// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { ffprobe } from "../src/core/media/probe.mjs";
import {
  checkRender, expectationsFor, frameStrip, frameTimes, parseBlack, parseVolume,
  previewGif, probeRender, safeZoneFilter, stripFilter,
} from "../src/core/inspect.mjs";

/** @type {import('../src/core/inspect.mjs').RenderInfo} */
const good = {
  width: 1080, height: 1920, fps: 30, duration: 8.9, videoCodec: "h264", pixFmt: "yuv420p",
  hasAudio: true, meanVolume: -20, maxVolume: -8, blackSeconds: 0,
};

describe("checkRender", () => {
  it("accepts a correct render", () => {
    assert.deepEqual(checkRender(good, { duration: 8.9, audible: true }), { problems: [], warnings: [] });
  });

  it("flags wrong format, length and fps", () => {
    const { problems } = checkRender({ ...good, width: 720, height: 1280, fps: 25, videoCodec: "hevc", duration: 7 }, { duration: 8.9 });
    assert.equal(problems.length, 4);
    assert.match(problems.join("\n"), /720x1280, expected 1080x1920/);
    assert.match(problems.join("\n"), /frame rate is 25/);
    assert.match(problems.join("\n"), /hevc/);
    assert.match(problems.join("\n"), /duration is 7s, the composition declares 8\.9s/);
  });

  it("tolerates a frame of duration drift", () => {
    assert.deepEqual(checkRender({ ...good, duration: 8.933 }, { duration: 8.9 }).problems, []);
  });

  it("requires sound only when the composition has some", () => {
    const mute = { ...good, hasAudio: false, meanVolume: null, maxVolume: null };
    assert.deepEqual(checkRender(mute, { audible: false }).problems, []);
    assert.match(checkRender(mute, { audible: true }).problems[0], /no audio stream/);
    assert.match(checkRender({ ...good, meanVolume: -91 }, { audible: true }).problems[0], /audio is silent/);
  });

  it("warns about long black stretches", () => {
    assert.match(checkRender({ ...good, blackSeconds: 5 }).warnings[0], /5s of black frames/);
    assert.deepEqual(checkRender({ ...good, blackSeconds: 0.3 }).warnings, []);
  });
});

describe("expectationsFor", () => {
  it("reads the declared duration and whether anything plays sound", () => {
    const html = '<div id="root" data-composition-id="r" data-start="0" data-width="1080" data-height="1920" data-duration="8.9"><video id="v" muted></video></div>';
    assert.deepEqual(expectationsFor(html), { duration: 8.9, audible: false });
    assert.equal(expectationsFor(html.replace("muted", 'data-has-audio="true"')).audible, true);
    assert.equal(expectationsFor(`${html}<audio id="music" src="x.m4a"></audio>`).audible, true);
  });
});

describe("ffmpeg output parsing", () => {
  it("parses volumedetect", () => {
    assert.deepEqual(parseVolume("[Parsed_volumedetect_0] mean_volume: -19.9 dB\n[Parsed_volumedetect_0] max_volume: -10.1 dB"), { mean: -19.9, max: -10.1 });
    assert.deepEqual(parseVolume("mean_volume: -inf dB"), { mean: null, max: null });
  });

  it("sums blackdetect segments", () => {
    assert.equal(parseBlack("black_start:0 black_end:1.2 black_duration:1.2\nblack_start:5 black_end:5.5 black_duration:0.5"), 1.7);
    assert.equal(parseBlack(""), 0);
  });
});

describe("frame sampling and filters", () => {
  it("samples segment midpoints", () => {
    assert.deepEqual(frameTimes(9, 3), [1.5, 4.5, 7.5]);
    assert.deepEqual(frameTimes(8.9, 1), [4.45]);
    assert.deepEqual(frameTimes(0, 3), []);
  });

  it("shades the RULES.md §4 zones and outlines the 720x1200 band", () => {
    const f = safeZoneFilter();
    assert.match(f, /^scale=1080:1920,/);
    assert.match(f, /drawbox=x=0:y=0:w=1080:h=220:/);
    assert.match(f, /drawbox=x=0:y=1420:w=1080:h=500:/);
    assert.match(f, /drawbox=x=180:y=220:w=720:h=1200:color=lime/);
  });

  it("stacks n frames, padding all but the last", () => {
    const f = stripFilter(3, { height: 640 });
    assert.equal((f.match(/pad=/g) ?? []).length, 2);
    assert.match(f, /\[f0\]\[f1\]\[f2\]hstack=inputs=3\[out\]$/);
    assert.match(stripFilter(1, { height: 640 }), /\[f0\]null\[out\]$/);
    assert.match(stripFilter(2, { height: 640, safeZones: true }), /\[1:v\]scale=1080:1920,drawbox/);
  });
});

describe("real ffmpeg round trip", () => {
  const dir = mkdtempSync(join(tmpdir(), "reelclaw-inspect-"));
  after(() => rmSync(dir, { recursive: true, force: true }));
  const mp4 = join(dir, "reel.mp4");
  const made = spawnSync("ffmpeg", [
    "-y", "-v", "error",
    "-f", "lavfi", "-i", "testsrc2=size=1080x1920:rate=30:duration=2",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2",
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", mp4,
  ]);

  it("probes, strips and GIFs a render", { skip: made.status === 0 ? false : "ffmpeg unavailable" }, async () => {
    const info = await probeRender(mp4);
    assert.equal(info.width, 1080);
    assert.equal(info.fps, 30);
    assert.ok(info.hasAudio && /** @type {number} */ (info.meanVolume) > -40, `audible (${info.meanVolume} dB)`);
    assert.deepEqual(checkRender(info, { duration: 2, audible: true }).problems, []);

    const strip = await frameStrip(mp4, frameTimes(info.duration, 3), join(dir, "strip.png"), { height: 320, safeZones: true });
    const png = await ffprobe(strip);
    assert.equal(png.height, 320);
    assert.equal(png.width, 3 * 180 + 2 * 12);

    const gif = await previewGif(mp4, join(dir, "p.gif"), { maxBytes: 400_000 });
    assert.ok(gif.bytes <= 400_000 || gif.width === 144, `gif ${gif.bytes}B at ${gif.width}px`);
    assert.equal(statSync(gif.out).size, gif.bytes);
  });
});
