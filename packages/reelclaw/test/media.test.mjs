// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { classifySource } from "../src/core/media/download.mjs";
import { parseProbe } from "../src/core/media/probe.mjs";
import { assetName, deriveMedia, stageMedia } from "../src/core/media/stage.mjs";

describe("assetName", () => {
  it("slugs the original name and appends 12 hash chars", () => {
    assert.equal(assetName("IMG_0001 (1).MOV", ".MOV", "abcdef0123456789"), "img-0001-1-abcdef012345.mov");
  });
  it("falls back to 'media' for names with no usable characters", () => {
    assert.equal(assetName("😀.mp4", ".mp4", "0123456789abcdef"), "media-0123456789ab.mp4");
  });
  it("differs for same name + different content, matches for same content", () => {
    assert.notEqual(assetName("clip.mp4", ".mp4", "aaaaaaaaaaaa"), assetName("clip.mp4", ".mp4", "bbbbbbbbbbbb"));
    assert.equal(assetName("a/clip.mp4", ".mp4", "aaaaaaaaaaaa"), assetName("b/clip.mp4", ".mp4", "aaaaaaaaaaaa"));
  });
});

describe("classifySource", () => {
  it("tells local paths, direct files and page links apart", () => {
    assert.equal(classifySource("clips/a.mp4"), "local");
    assert.equal(classifySource("https://cdn.example.com/x/a.MP4?sig=1"), "direct");
    assert.equal(classifySource("https://www.tiktok.com/@u/video/123"), "page");
  });
});

describe("parseProbe", () => {
  it("swaps width/height for rotated phone footage", () => {
    const p = parseProbe({
      format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "5.2" },
      streams: [
        { codec_type: "video", width: 1920, height: 1080, avg_frame_rate: "30000/1001", side_data_list: [{ rotation: -90 }] },
        { codec_type: "audio" },
      ],
    });
    assert.deepEqual(p, { duration: 5.2, width: 1080, height: 1920, fps: 29.97, hasVideo: true, hasAudio: true, hasAlpha: false, isImage: false });
  });

  it("detects stills, alpha and cover art", () => {
    const png = parseProbe({ format: { format_name: "png_pipe" }, streams: [{ codec_type: "video", width: 512, height: 512, pix_fmt: "rgba" }] });
    assert.equal(png.isImage, true);
    assert.equal(png.hasVideo, false);
    assert.equal(png.hasAlpha, true);
    assert.equal(png.duration, 0);
    const webm = parseProbe({ format: { format_name: "matroska,webm", duration: "3" }, streams: [{ codec_type: "video", width: 10, height: 10, pix_fmt: "yuv420p", tags: { alpha_mode: "1" } }] });
    assert.equal(webm.hasAlpha, true);
    const mp3 = parseProbe({ format: { format_name: "mp3", duration: "9" }, streams: [{ codec_type: "audio" }, { codec_type: "video", disposition: { attached_pic: 1 } }] });
    assert.equal(mp3.hasVideo, false);
    assert.equal(mp3.hasAudio, true);
  });
});

const hasFfmpeg = !spawnSync("ffmpeg", ["-version"]).error;

describe("stageMedia (real files)", { skip: !hasFfmpeg && "ffmpeg not installed" }, () => {
  /** @type {string} */ let dir;
  /** @type {string} */ let root;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), "reelclaw-stage-"));
    root = join(dir, "project");
    for (const [sub, color] of [["a", "red"], ["b", "blue"]]) {
      mkdirSync(join(dir, sub));
      const r = spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `color=c=${color}:size=64x64:rate=10:duration=1`, "-pix_fmt", "yuv420p", join(dir, sub, "clip.mp4")]);
      assert.equal(r.status, 0);
    }
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("stages same-named files with different content under different names (v1 collision bug)", async () => {
    const a = await stageMedia({ root, value: join(dir, "a", "clip.mp4"), kind: "video", label: "reaction" });
    const b = await stageMedia({ root, value: join(dir, "b", "clip.mp4"), kind: "video", label: "demo" });
    assert.notEqual(a.src, b.src);
    assert.match(a.src, /^assets\/clip-[0-9a-f]{12}\.mp4$/);
    assert.equal(a.width, 64);
    assert.ok(Math.abs(a.duration - 1) < 0.05);
  });

  it("reuses the staged file for identical content and caches probes", async () => {
    const first = await stageMedia({ root, value: join(dir, "a", "clip.mp4"), kind: "video", label: "x" });
    const again = await stageMedia({ root, value: join(dir, "a", "clip.mp4"), kind: "video", label: "y" });
    assert.equal(first.src, again.src);
    assert.equal(readdirSync(join(root, "assets")).filter((f) => f.endsWith(".mp4")).length, 2);
  });

  it("rejects the wrong kind with a precise message", async () => {
    await assert.rejects(stageMedia({ root, value: join(dir, "a", "clip.mp4"), kind: "audio", label: "music" }), /music: expected audio but the file has no sound/);
    await assert.rejects(stageMedia({ root, value: join(dir, "nope.mp4"), kind: "video", label: "demo" }), /demo: file not found/);
  });

  it("derives a file once and names it after the source hash + key", async () => {
    const src = await stageMedia({ root, value: join(dir, "a", "clip.mp4"), kind: "video", label: "reaction" });
    let runs = 0;
    /** @param {string} input @param {string} output */
    const produce = async (input, output) => {
      runs++;
      spawnSync("ffmpeg", ["-v", "error", "-i", input, "-vf", "hflip", output]);
    };
    const d1 = await deriveMedia({ root, from: src, key: "flipped", ext: ".mp4", kind: "video", produce });
    const d2 = await deriveMedia({ root, from: src, key: "flipped", ext: ".mp4", kind: "video", produce });
    assert.equal(runs, 1);
    assert.equal(d1.src, d2.src);
    assert.equal(d1.src, src.src.replace(/\.mp4$/, ".flipped.mp4"));
  });
});
