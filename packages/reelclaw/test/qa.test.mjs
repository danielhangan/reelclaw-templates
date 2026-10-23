// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { compile } from "../src/core/compile.mjs";
import { karaokeCaptions } from "../src/core/components/karaoke.mjs";
import { nativeText } from "../src/core/components/native-text.mjs";
import { ffprobe } from "../src/core/media/probe.mjs";
import {
  captionWindows, dedupeTimes, formatQaReport, hardCuts, lastFrameTime, MAX_QA_FRAMES, musicTrack,
  parseComposition, qaFramePlan, qaReel, resolveQaTarget,
} from "../src/core/qa.mjs";
import { caption, image, music, timeline, video } from "../src/core/timeline.mjs";

/** @typedef {import('../src/core/types.mjs').MediaRef} MediaRef */

/** @param {Partial<MediaRef>} o @returns {MediaRef} */
const media = (o = {}) => ({
  kind: "video", label: "clip", src: "assets/clip-abc.mp4", path: "/x/assets/clip-abc.mp4",
  duration: 6, width: 720, height: 1280, fps: 30, hasVideo: true, hasAudio: true, hasAlpha: false, isImage: false,
  ...o,
});
const track = media({ kind: "audio", src: "assets/music-123.m4a", duration: 20, hasVideo: false, width: 0, height: 0 });
const still = media({ kind: "image", src: "assets/photo-1.jpg", duration: 0, isImage: true, hasVideo: false, hasAudio: false });

/** The reaction-demo shape: reaction 0–3s, demo 3–8.9s, two captions, music. */
const reactionDemo = compile(timeline([
  video(media(), { id: "reaction", duration: 3, trim: 1, volume: 0.8 }),
  video(media({ src: "assets/demo-def.mp4", hasAudio: false }), { id: "demo", start: 3, duration: 5.9 }),
  caption("i was about to hit it", { id: "hook", start: 0, duration: 3 }),
  caption("12/12 cravings resisted", { id: "hook2", start: 3, duration: 5.9, position: "top" }),
  music(track, { volume: 0.6 }),
]), { name: "reel-1" }).html;

describe("parseComposition: timeline facts from a compiled reel", () => {
  const comp = parseComposition(reactionDemo);

  it("reads the declared duration and every timed element", () => {
    assert.equal(comp.duration, 8.9);
    assert.deepEqual(comp.clips.map((c) => [c.id, c.kind, c.start, c.end]), [
      ["reaction", "video", 0, 3],
      ["demo", "video", 3, 8.9],
      ["hook", "caption", 0, 3],
      ["hook2", "caption", 3, 8.9],
      ["music", "audio", 0, 8.9],
    ]);
  });

  it("finds the hard cut, the caption windows (with their regions) and the music", () => {
    assert.deepEqual(hardCuts(comp), [3]);
    const caps = captionWindows(comp);
    assert.deepEqual(caps.map((c) => [c.id, c.start, c.end]), [["hook", 0, 3], ["hook2", 3, 8.9]]);
    assert.deepEqual(caps[0].box, { x: 180, y: 220, w: 720, h: 1200 });
    assert.equal(musicTrack(comp)?.id, "music");
  });

  it("counts loop seams and overlays as cuts, and text html() clips as captions", () => {
    const html = compile(timeline([
      video(media({ duration: 2.1 }), { id: "bg", duration: 5, loop: true }), // 2s loops: seams at 2, 4
      image(still, { id: "logo", start: 1.5, duration: 2, box: { x: 40, y: 40, w: 200, h: 200 } }),
      karaokeCaptions([{ text: "one", start: 0.2, end: 0.6 }, { text: "two.", start: 0.6, end: 1 }, { text: "three", start: 2.5, end: 3 }], { id: "k" }),
      nativeText("native box", { id: "nt", start: 4, duration: 1 }),
    ]), { name: "loops" }).html;
    const comp2 = parseComposition(html);
    assert.deepEqual(hardCuts(comp2), [1.5, 2, 3.5, 4]);
    assert.deepEqual(captionWindows(comp2).map((c) => c.id), ["k-1", "k-2", "nt"]);
    assert.equal(musicTrack(comp2), null);
  });

  it("ignores data-start inside scripts and comments, and hand-written elements still count", () => {
    const html = `<body><div id="root" data-composition-id="x" data-start="0" data-duration="4">
      <!-- <video id="old" data-start="1" data-duration="1"></video> -->
      <img id="card" src="../assets/a.png" style="left: 0px; top: 0px; width: 1080px; height: 1920px;" data-start='2' data-duration=2 />
      <div id="panel" class="clip rc-box" style="background: #fff; left: 0px; top: 0px; width: 10px; height: 10px;" data-start="0" data-duration="4"></div>
    </div><script>for (const a of ["data-start"]) el.setAttribute(a, 'data-start="9"');</script></body>`;
    const comp3 = parseComposition(html);
    assert.equal(comp3.duration, 4);
    assert.deepEqual(comp3.clips.map((c) => [c.id, c.kind, c.start, c.end]), [["card", "image", 2, 4], ["panel", "solid", 0, 4]]);
    assert.deepEqual(hardCuts(comp3), [2]);
  });
});

describe("qaFramePlan: which frames to look at", () => {
  it("takes 0/0.5/1s, both sides of every cut, every caption middle and the last frame", () => {
    const comp = parseComposition(reactionDemo);
    const { frames, skipped } = qaFramePlan({ duration: 8.9, cuts: hardCuts(comp), captions: captionWindows(comp) });
    assert.equal(skipped, 0);
    assert.deepEqual(frames.map((f) => f.time), [0, 0.5, 1, 1.5, 2.8, 3.5, 5.95, 8.86]);
    assert.deepEqual(frames.map((f) => f.file), ["01-0.00s.png", "02-0.50s.png", "03-1.00s.png", "04-1.50s.png", "05-2.80s.png", "06-3.50s.png", "07-5.95s.png", "08-8.86s.png"]);
    assert.match(frames[4].reasons[0], /0\.2s before the cut at 3s/);
    assert.match(frames[5].reasons[0], /0\.5s after the cut at 3s/);
    assert.match(frames[6].reasons[0], /caption "hook2" \(3–8\.9s\)/);
  });

  it("merges moments that fall on the same frame and clamps to the video", () => {
    const { frames } = qaFramePlan({ duration: 4, cuts: [0.7, 3.8], captions: [{ id: "a", start: 0, end: 1 }] });
    const half = frames.find((f) => f.time === 0.5);
    assert.deepEqual(half?.reasons, ["0.5s: hook on screen", "0.2s before the cut at 0.7s", "caption \"a\" (0–1s)"]);
    assert.ok(frames.every((f) => f.time <= lastFrameTime(4)));
    assert.equal(new Set(frames.map((f) => f.time)).size, frames.length);
  });

  it("caps the frame count but always keeps the fixed moments", () => {
    const cuts = Array.from({ length: 40 }, (_, i) => 1.5 + i * 1.5);
    const { frames, skipped } = qaFramePlan({ duration: 62, cuts });
    assert.equal(frames.length, MAX_QA_FRAMES);
    assert.equal(skipped, 80 - (MAX_QA_FRAMES - 4));
    assert.deepEqual(frames.slice(0, 3).map((f) => f.time), [0, 0.5, 1]);
    assert.equal(frames.at(-1)?.time, lastFrameTime(62));
  });

  it("plain videos get the fixed times plus --cut", () => {
    assert.deepEqual(qaFramePlan({ duration: 6, cuts: [3] }).frames.map((f) => f.time), [0, 0.5, 1, 2.8, 3.5, 5.96]);
    assert.deepEqual(qaFramePlan({ duration: 0 }), { frames: [], skipped: 0 });
  });

  it("helpers", () => {
    assert.equal(lastFrameTime(8.9), 8.86);
    assert.equal(lastFrameTime(0.02), 0);
    assert.deepEqual(dedupeTimes([3, 1, 3.02, 2.999], 0.05), [1, 2.999]);
  });
});

const hasFfmpeg = !spawnSync("ffmpeg", ["-version"]).error;

describe("qaReel (real ffmpeg)", { skip: !hasFfmpeg && "ffmpeg not installed" }, () => {
  /** @type {string} */ let dir;
  /** @type {string} */ let root;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), "reelclaw-qa-"));
    root = join(dir, "project");
    for (const sub of ["reels", "renders"]) mkdirSync(join(root, sub), { recursive: true });
    // a 4s 1080x1920 "render": picture + tone, with a 0.5s black stretch at 2s and a music-style fade at the end
    const r = spawnSync("ffmpeg", [
      "-y", "-v", "error",
      "-f", "lavfi", "-i", "testsrc2=size=1080x1920:rate=30:duration=4",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=4",
      "-vf", "drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='between(t,2,2.5)'",
      "-af", "afade=t=out:st=3.2:d=0.8",
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", join(root, "renders", "reel-1.mp4"),
    ]);
    assert.equal(r.status, 0, r.stderr?.toString());
    const html = compile(timeline([
      video(media(), { id: "a", duration: 2 }),
      video(media(), { id: "b", start: 2, duration: 2 }),
      caption("hook text", { id: "hook", start: 0, duration: 2, region: { x: 180, y: 300, w: 720, h: 400 } }),
      music(track),
    ]), { name: "reel-1" }).html;
    writeFileSync(join(root, "reels", "reel-1.html"), html);
    const old = new Date(Date.now() - 60_000);
    utimesSync(join(root, "reels", "reel-1.html"), old, old);
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("resolves reel names and MP4 paths", () => {
    const byName = resolveQaTarget({ root, target: "reel-1", cwd: dir });
    assert.equal(byName.html, join(root, "reels", "reel-1.html"));
    assert.equal(byName.out, join(root, "renders", "qa", "reel-1"));
    assert.equal(byName.renderLog, join(root, "renders", "reel-1.render.log"));
    const byPath = resolveQaTarget({ root: dir, target: "project/renders/reel-1.mp4", cwd: dir });
    assert.equal(byPath.html, join(root, "reels", "reel-1.html"));
    assert.throws(() => resolveQaTarget({ root, target: "nope", cwd: dir }), /no reel named "nope"/);
    assert.throws(() => resolveQaTarget({ root, target: "missing.mp4", cwd: dir }), /video not found/);
  });

  it("writes timeline-aware frames, a font crop, a contact sheet and reports; black frames fail", async () => {
    const t = resolveQaTarget({ root, target: "reel-1", cwd: dir });
    const report = await qaReel({ video: t.video, html: t.html, out: t.out, cwd: dir });
    assert.equal(report.reel, t.html);
    assert.deepEqual(report.cuts, [2]);
    assert.deepEqual(report.frames.map((f) => f.time), [0, 0.5, 1, 1.8, 2.5, 3.96]);
    for (const f of report.frames) {
      const png = await ffprobe(f.file);
      assert.deepEqual([png.width, png.height], [540, 960]);
    }
    const crop = await ffprobe(report.fontCheck.file);
    assert.deepEqual([crop.width, crop.height], [720, 400], "the caption's own region, full resolution");
    assert.ok(existsSync(report.contactSheet.file));
    assert.equal(report.contactSheet.frames, 8);

    assert.equal(report.ok, false);
    assert.match(report.problems.join("\n"), /black frames at 2(\.\d+)?–2\.\d+s/);
    assert.equal(report.audio.silent, false);
    assert.equal(report.audio.music, "music");
    assert.ok(/** @type {number} */ (report.audio.tail?.belowMean) >= 8, `tail fade ${report.audio.tail?.belowMean} dB`);
    assert.equal(report.renderLog, null);

    const json = JSON.parse(readFileSync(join(t.out, "report.json"), "utf8"));
    assert.equal(json.instruction, "look at every frame before delivering");
    const txt = readFileSync(join(t.out, "report.txt"), "utf8");
    assert.match(txt, /timeline-aware: 1 cut, 1 caption/);
    assert.match(txt, /QA FAILED/);
    assert.match(txt, /look at every frame before delivering/);
    assert.equal(txt, `${formatQaReport(report, { cwd: dir })}\n`);
  });

  it("fails on render-log warnings and clears frames from an earlier run", async () => {
    const t = resolveQaTarget({ root, target: "reel-1", cwd: dir });
    writeFileSync(join(t.out, "09-9.99s.png"), "stale");
    writeFileSync(t.renderLog, "[WARN] [Compiler] Could not embed local font assets/fonts/X.ttf: ENOENT\n[FileServer] 404 Not Found: /assets/fonts/X.ttf\n");
    const report = await qaReel({ video: t.video, html: t.html, out: t.out, cwd: dir });
    assert.equal(report.renderWarnings[0]?.code, "font");
    assert.equal(report.renderWarnings[0]?.count, 2);
    assert.match(report.problems.join("\n"), /render warning: a font failed to load/);
    assert.ok(!existsSync(join(t.out, "09-9.99s.png")));
    assert.match(readFileSync(join(t.out, "report.txt"), "utf8"), /RENDER WARNINGS[\s\S]*fix: the @font-face in project\/reels\/reel-1\.html/);
    rmSync(t.renderLog);
  });

  it("checks a plain MP4 with fixed times plus --cut, and flags a wrong canvas", async () => {
    const plain = join(dir, "landscape.mp4");
    const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=25:duration=3", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", plain]);
    assert.equal(r.status, 0);
    const t = resolveQaTarget({ root: dir, target: plain, cwd: dir });
    assert.equal(t.html, null);
    const report = await qaReel({ video: t.video, out: t.out, cuts: [1.5], cwd: dir });
    assert.deepEqual(report.frames.map((f) => f.time), [0, 0.5, 1, 1.3, 2, 2.96]);
    assert.match(report.problems.join("\n"), /resolution is 640x360/);
    assert.match(report.problems.join("\n"), /frame rate is 25/);
    assert.match(report.warnings.join("\n"), /SILENT/);
    assert.equal(report.audio.expected, null);
    assert.match(readFileSync(join(t.out, "report.txt"), "utf8"), /plain video — fixed frame times/);
  });
});
