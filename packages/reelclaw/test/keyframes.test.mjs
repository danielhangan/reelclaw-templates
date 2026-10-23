// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { keyframeTimes, MAX_KEYFRAME_GAP, maxKeyframeGap, parseKeyframePackets } from "../src/core/media/keyframes.mjs";
import { stageMedia } from "../src/core/media/stage.mjs";

describe("keyframe intervals (pure)", () => {
  it("reads keyframe flags from ffprobe packet csv", () => {
    assert.deepEqual(parseKeyframePackets("0.000000,K__\n0.033333,___\n1.000000,K_\n\n2.000000,KD_\nN/A,K__\n"), [0, 1, 2]);
  });

  it("measures the longest stretch a seek decodes, including to the end of the file", () => {
    assert.equal(maxKeyframeGap([0, 1, 2, 3, 4, 5], 6), 1);
    assert.equal(maxKeyframeGap([0], 6), 6, "one keyframe = one 6s GOP");
    assert.equal(maxKeyframeGap([0, 0.5, 4], 4.2), 3.5);
    assert.equal(maxKeyframeGap([], 4), 4);
    assert.equal(MAX_KEYFRAME_GAP, 2);
  });
});

const hasFfmpeg = !spawnSync("ffmpeg", ["-version"]).error;

describe("seek-safe staging (real ffmpeg)", { skip: !hasFfmpeg && "ffmpeg not installed" }, () => {
  /** @type {string} */ let dir;
  /** @type {string} */ let root;
  /** @param {string} file @param {string[]} args */
  const make = (file, args) => {
    const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...args, join(dir, file)]);
    assert.equal(r.status, 0, r.stderr?.toString());
  };
  before(() => {
    dir = mkdtempSync(join(tmpdir(), "reelclaw-keyframes-"));
    root = join(dir, "project");
    const src = ["-f", "lavfi", "-i", "testsrc2=size=160x284:rate=30:duration=6", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=6"];
    const x264 = ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-sc_threshold", "0", "-c:a", "aac", "-shortest"];
    make("sparse.mp4", [...src, ...x264, "-g", "300", "-keyint_min", "300"]); // one keyframe in 6s (phone/platform export)
    make("dense.mp4", [...src, ...x264, "-g", "30", "-keyint_min", "30"]);
    // a transparent cut-out with sparse keyframes: must never be re-encoded to H.264 (alpha would be lost)
    make("cutout.webm", ["-f", "lavfi", "-i", "color=c=red@0.5:size=64x64:rate=30:duration=3,format=yuva420p", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-g", "300", "-auto-alt-ref", "0"]);
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("detects sparse vs dense keyframes from packet flags", async () => {
    const sparse = await keyframeTimes(join(dir, "sparse.mp4"));
    const dense = await keyframeTimes(join(dir, "dense.mp4"));
    assert.deepEqual(sparse, [0]);
    assert.equal(dense.length, 6);
    assert.ok(maxKeyframeGap(sparse, 6) > MAX_KEYFRAME_GAP);
    assert.ok(maxKeyframeGap(dense, 6) <= 1.01);
  });

  it("re-encodes a sparse video once into assets/<stem>.seekable.mp4 and logs one line", async () => {
    /** @type {string[]} */
    const lines = [];
    const log = { info() {}, success() {}, warn() {}, error() {}, step: (/** @type {string} */ m) => lines.push(m) };
    const a = await stageMedia({ root, value: join(dir, "sparse.mp4"), kind: "video", label: "reaction", log });
    assert.match(a.src, /^assets\/sparse-[0-9a-f]{12}\.seekable\.mp4$/);
    assert.equal(a.label, "reaction");
    assert.equal(a.hasAudio, true, "sound survives the re-encode");
    assert.ok(Math.abs(a.duration - 6) < 0.1);
    assert.ok(maxKeyframeGap(await keyframeTimes(a.path), a.duration) <= MAX_KEYFRAME_GAP);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /reaction: keyframes up to 6s apart — re-encoding once/);

    const again = await stageMedia({ root, value: join(dir, "sparse.mp4"), kind: "video", label: "reaction", log });
    assert.equal(again.src, a.src);
    assert.equal(lines.length, 1, "cached: no second re-encode");

    // re-making from the saved props (assets/….seekable.mp4) reuses the file in place
    const fromProps = await stageMedia({ root, value: a.src, kind: "video", label: "reaction", cwd: root, log });
    assert.equal(fromProps.src, a.src);
    assert.equal(lines.length, 1);
    assert.equal(readdirSync(join(root, "assets")).filter((f) => f.startsWith("sparse-")).length, 2, "the staged original + one seekable copy");
  });

  it("leaves dense video, transparent video and audio inputs alone", async () => {
    const dense = await stageMedia({ root, value: join(dir, "dense.mp4"), kind: "video", label: "demo" });
    assert.match(dense.src, /^assets\/dense-[0-9a-f]{12}\.mp4$/);
    const cut = await stageMedia({ root, value: join(dir, "cutout.webm"), kind: "video", label: "cutout" });
    assert.equal(cut.hasAlpha, true);
    assert.match(cut.src, /^assets\/cutout-[0-9a-f]{12}\.webm$/);
    const sound = await stageMedia({ root, value: join(dir, "sparse.mp4"), kind: "audio", label: "music" });
    assert.match(sound.src, /^assets\/sparse-[0-9a-f]{12}\.mp4$/);
  });
});
