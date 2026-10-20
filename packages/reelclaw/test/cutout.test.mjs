// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { alphaBounds, cutout, dragFrom, parseCropdetect, placeCutout } from "../src/core/components/cutout.mjs";
import { silentLogger } from "../src/core/log.mjs";
import { deriveMedia, stageMedia } from "../src/core/media/stage.mjs";

describe("parseCropdetect", () => {
  it("takes the last (accumulated) crop line", () => {
    const log = "[Parsed_cropdetect_1] x1:10 crop=100:200:10:20\n[Parsed_cropdetect_1] crop=156:300:102:200\n";
    assert.deepEqual(parseCropdetect(log), { x: 102, y: 200, w: 156, h: 300 });
  });
  it("returns null when nothing is opaque or there is no output", () => {
    assert.equal(parseCropdetect("crop=-358:-638:360:640"), null);
    assert.equal(parseCropdetect("no crop lines here"), null);
  });
  it("clamps the box inside the source frame", () => {
    assert.deepEqual(parseCropdetect("crop=400:700:200:600", 360, 640), { x: 200, y: 600, w: 160, h: 40 });
  });
});

describe("placeCutout", () => {
  const subject = { x: 182, y: 298, w: 344, h: 982 };
  it("sizes by width % of the frame, keeps the subject's aspect, flush to the corner", () => {
    const b = placeCutout(subject, { widthPct: 40, anchor: "bottom-left" });
    assert.equal(b.w, 432);
    assert.equal(b.h, Math.round((432 * 982) / 344));
    assert.equal(b.x, 0);
    assert.equal(b.y, 1920 - b.h);
  });
  it("insets by margin and lets x/y override one axis each", () => {
    const b = placeCutout({ x: 0, y: 0, w: 100, h: 100 }, { widthPct: 50, anchor: "bottom-right", margin: 40 });
    assert.deepEqual(b, { x: 1080 - 540 - 40, y: 1920 - 540 - 40, w: 540, h: 540 });
    const o = placeCutout({ x: 0, y: 0, w: 100, h: 100 }, { widthPct: 50, anchor: "bottom-right", margin: 40, y: 900 });
    assert.deepEqual(o, { ...b, y: 900 });
  });
});

describe("dragFrom", () => {
  it("is the transform that maps the resting box onto the opening box (scale about the centre)", () => {
    const subject = { x: 0, y: 0, w: 300, h: 600 };
    const rest = placeCutout(subject, { widthPct: 40, anchor: "bottom-left" });
    const start = placeCutout(subject, { widthPct: 60, anchor: "center" });
    const t = dragFrom(rest, start);
    assert.equal(t.scale, 1.5);
    const cx = rest.x + rest.w / 2 + t.x;
    const cy = rest.y + rest.h / 2 + t.y;
    assert.ok(Math.abs(cx - (start.x + start.w / 2)) <= 1);
    assert.ok(Math.abs(cy - (start.y + start.h / 2)) <= 1);
  });
  it("is the identity when the boxes match", () => {
    const b = { x: 10, y: 20, w: 300, h: 400 };
    assert.deepEqual(dragFrom(b, b), { x: 0, y: 0, scale: 1 });
  });
});

const hasFfmpeg = !spawnSync("ffmpeg", ["-version"]).error;

describe("cutout() with transparent sources (no matting model needed)", { skip: !hasFfmpeg && "ffmpeg not installed" }, () => {
  /** @type {string} */ let dir;
  /** @type {string} */ let root;
  /** @type {string[]} */ const warnings = [];
  const ctx = () => ({
    root,
    media: { derive: (/** @type {any} */ d) => deriveMedia({ root, ...d }) },
    log: silentLogger,
    warn: (/** @type {string} */ m) => warnings.push(m),
  });

  /**
   * A 360x640 transparent clip with an opaque 120x300 box drifting right 40px/s.
   * @param {string} file
   * @param {string[]} codec
   * @param {boolean} [empty] fully transparent
   */
  const makeAlpha = (file, codec, empty = false) => {
    const r = spawnSync("ffmpeg", [
      "-y", "-v", "error",
      "-f", "lavfi", "-i", "color=c=black@0.0:s=360x640:r=30:d=1,format=rgba",
      "-f", "lavfi", "-i", "color=c=red:s=120x300:r=30:d=1,format=rgba",
      "-filter_complex", empty ? "[0]null" : "[0][1]overlay=x='100+40*t':y=200",
      ...codec, join(dir, file),
    ], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return join(dir, file);
  };
  const VP9 = ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-b:v", "0", "-crf", "40", "-deadline", "realtime"];

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "reelclaw-cutout-"));
    root = join(dir, "project");
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("uses a transparent WebM as-is and finds the subject over all frames", async () => {
    const ref = await stageMedia({ root, value: makeAlpha("alpha.webm", VP9), kind: "video", label: "reaction" });
    assert.equal(ref.hasAlpha, true);
    const cut = await cutout(ctx(), ref);
    assert.equal(cut.matted, false);
    assert.equal(cut.video.src, ref.src);
    // the box drifts from x=100 to ~139 over the second; cropdetect skips the first 2 frames
    assert.ok(cut.subject.x >= 100 && cut.subject.x <= 104, `x ${cut.subject.x}`);
    assert.ok(cut.subject.w >= 150 && cut.subject.w <= 162, `w ${cut.subject.w}`);
    assert.equal(cut.subject.y, 200);
    assert.equal(cut.subject.h, 300);
    assert.ok(existsSync(join(root, ".reelclaw", "cache", "alpha-bounds", `${ref.src.slice("assets/".length)}.json`)), "bounds are cached");
    assert.deepEqual(await alphaBounds(root, ref), cut.subject, "cached result matches");
  });

  it("converts other transparent formats (ProRes 4444) to VP9 WebM once", async () => {
    const mov = makeAlpha("alpha.mov", ["-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le"]);
    const ref = await stageMedia({ root, value: mov, kind: "video", label: "reaction" });
    assert.equal(ref.hasAlpha, true);
    const cut = await cutout(ctx(), ref);
    assert.match(cut.video.src, /\.alpha-webm\.webm$/);
    assert.equal(cut.video.hasAlpha, true);
    assert.equal(cut.subject.y, 200);
  });

  it("crop: false keeps the whole frame; a fully transparent clip warns and falls back to it", async () => {
    const ref = await stageMedia({ root, value: makeAlpha("alpha.webm", VP9), kind: "video", label: "reaction" });
    assert.deepEqual((await cutout(ctx(), ref, { crop: false })).subject, { x: 0, y: 0, w: 360, h: 640 });

    const empty = await stageMedia({ root, value: makeAlpha("empty.webm", VP9, true), kind: "video", label: "empty" });
    const cut = await cutout(ctx(), empty);
    assert.deepEqual(cut.subject, { x: 0, y: 0, w: 360, h: 640 });
    assert.match(warnings.at(-1) ?? "", /no subject found/);
  });
});
