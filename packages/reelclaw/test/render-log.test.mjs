// @ts-check
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatRenderWarnings, scanRenderLog } from "../src/core/render-log.mjs";
import { isNoise, renderLogPath } from "../src/core/render.mjs";

// Lines captured from hyperframes 0.8.181 renders with a deliberately broken composition.
const LOGS = {
  healthy: `◆  Rendering base/reels/base.html → /tmp/p/renders/base.mp4
  Lint: 0 error(s), 2 warning(s) — run with --lint-verbose for full output.
  Continuing render despite lint issues. Use --strict to block errors.
✗  No composition found in /tmp/p
   No index.html file found.
[INFO] [Compiler] Embedded local font file: assets/fonts/TikTokSans-Variable.ttf (744 KB → data URI)
[Browser:ERROR] The AudioContext encountered an error from the audio device or the WebAudio renderer.
[FrameCapture] Timed out closing browser; forcing browser process shutdown
\u001b[32m  █████████████████████████  100%  Render complete\u001b[0m`,
  font: `[WARN] [Compiler] Could not embed local font assets/fonts/Missing-Font.ttf: ENOENT: no such file or directory, open '/tmp/p/assets/fonts/Missing-Font.ttf'
[FileServer] 404 Not Found: /assets/fonts/Missing-Font.ttf`,
  image: `[FileServer] 404 Not Found: /assets/nope-logo.png
[non-blocking] Failed to load resource: the server responded with a status of 404 (Not Found)
[FileServer] 404 Not Found: /assets/nope-bg.png
[FrameCapture:media_load_failed] image media failed to load before capture {
[WARN] Render completed capture with correctness warnings {"strictness":"best-effort","warningCodes":["media_load_failed"]}`,
  sparse: `[WARN] [Compiler] WARNING: Video "reaction" has sparse keyframes (max interval: 6s). This causes seek failures and frame freezing. Re-encode with: ffmpeg -i "assets/sparse.mp4" -c:v libx264 -r 30 -g 30 -keyint_min 30 -movflags +faststart -c:a copy output.mp4`,
  pageError: `[Browser:PAGEERROR] Cannot set properties of null (setting 'textContent')`,
  gsap: `[FileServer] 404 Not Found: /assets/vendor/nope-gsap.min.js
[non-blocking] Failed to load resource: the server responded with a status of 404 (Not Found)
[Browser:PAGEERROR] Cannot read properties of null (reading 'timeline')
[FrameCapture] Sub-composition timeline wait cut short after 2032ms: script resource(s) failed to load (http://localhost:62231/assets/vendor/nope-gsap.min.js), so the timeline registration they carry can never arrive.
[FrameCapture:sub_timeline_script_failure] A sub-composition timeline script failed to load (http://localhost:62231/assets/vendor/nope-gsap.min.js)`,
  audio: `[WARN] Audio track failed {"elementId":"music","stage":"source","reason":"source_not_found","detail":"Source not found for audio element music"}`,
  video: `[hyperframes:render] WARNING: video src="assets/nope-demo.mp4" could not be resolved on disk (looked for /tmp/p/assets/nope-demo.mp4).`,
  // v1 skill / CDN-era signatures
  cdn: `[Compiler] WARNING: Failed to download CDN script: https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js (timeout). The render may fail if this script is required (e.g. GSAP).
[Render] Asset load failure: [Browser:REQUESTFAILED] GET http://localhost:1/assets/fonts/x.woff2 resource=font error=net::ERR_FILE_NOT_FOUND`,
};

/** @param {string} log */
const codes = (log) => scanRenderLog(log).map((w) => `${w.code}x${w.count}`);

describe("scanRenderLog", () => {
  it("finds nothing in a healthy render (benign errors, lint notes, ANSI codes)", () => {
    assert.deepEqual(scanRenderLog(LOGS.healthy), []);
  });

  it("recognises each silent failure hyperframes 0.8.181 exits 0 on", () => {
    assert.deepEqual(codes(LOGS.font), ["fontx2"]);
    assert.deepEqual(codes(LOGS.image), ["assetx4"]);
    assert.deepEqual(codes(LOGS.sparse), ["sparse-keyframesx1"]);
    assert.deepEqual(codes(LOGS.pageError), ["page-errorx1"]);
  });

  it("explains the failures that already stop the render", () => {
    assert.deepEqual(codes(LOGS.gsap), ["scriptx3", "page-errorx1"]);
    assert.deepEqual(codes(LOGS.audio), ["assetx1"]);
    assert.deepEqual(codes(LOGS.video), ["assetx1"]);
  });

  it("keeps the v1 CDN-era signatures", () => {
    assert.deepEqual(codes(LOGS.cdn), ["fontx1", "scriptx1"]);
  });

  it("keeps the first matching line, trimmed, with a count", () => {
    const [w] = scanRenderLog(`\n  ${LOGS.font}\n`);
    assert.equal(w.code, "font");
    assert.match(w.line, /^\[WARN\] \[Compiler\] Could not embed local font/);
    assert.equal(w.count, 2);
    assert.ok(scanRenderLog(`[Browser:PAGEERROR] ${"x".repeat(400)}`)[0].line.length <= 240);
  });
});

describe("formatRenderWarnings", () => {
  it("prints a RENDER WARNINGS block with the fix for this reel", () => {
    const text = formatRenderWarnings(scanRenderLog(LOGS.font + "\n" + LOGS.sparse), { reel: "reels/hook-a.html", logFile: "renders/hook-a.render.log" });
    assert.match(text, /^RENDER WARNINGS/);
    assert.match(text, /a font failed to load/);
    assert.match(text, /\(\+1 more\)/);
    assert.match(text, /fix: the @font-face in reels\/hook-a\.html/);
    assert.match(text, /fix: re-run `reelclaw make` \(staging re-encodes sparse video automatically\)/);
    assert.match(text, /full log: renders\/hook-a\.render\.log$/);
    assert.equal(formatRenderWarnings([]), "");
    assert.match(formatRenderWarnings(scanRenderLog(LOGS.gsap), { failed: true }), /^Likely causes/);
  });
});

describe("render log plumbing", () => {
  it("sits next to the output", () => {
    assert.equal(renderLogPath("renders/hook-a.mp4"), "renders/hook-a.render.log");
    assert.equal(renderLogPath("/abs/out/final.MP4"), "/abs/out/final.render.log");
  });

  it("the terminal filter hides noise but the log keeps it (signatures live in [WARN]/[FileServer] lines too)", () => {
    assert.equal(isNoise("[INFO] [Compiler] Embedded local font file"), true);
    assert.equal(isNoise("[FileServer] 404 Not Found: /assets/fonts/x.ttf"), false);
  });
});
