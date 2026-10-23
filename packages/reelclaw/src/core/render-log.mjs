// @ts-check
/**
 * Silent render failures. HyperFrames can exit 0 and write a perfectly sized
 * MP4 even though a font, a script or a media file never loaded: the captions
 * fall back to another font, animations vanish, a clip is missing from the
 * frame. The only trace is in its log, so every render's full output is saved
 * to renders/<name>.render.log and scanned for these signatures.
 *
 * Patterns were checked against what hyperframes 0.8.181 prints when things
 * break (older and CDN-script variants from the v1 skill are kept too):
 *
 *   exits 0 (silent)                         exits 1 (already loud)
 *   missing font file  → font                missing video → asset
 *   missing <img>/CSS image → asset          missing audio → asset
 *   sparse-keyframe video → sparse-keyframes missing GSAP → script
 *   a script throwing after the timeline     a script throwing before the
 *     registered → page-error                  timeline registered → script
 *
 * Re-check them when HYPERFRAMES_VERSION is bumped.
 */

/**
 * @typedef {object} RenderWarning
 * @property {string} code     font | script | asset | sparse-keyframes | page-error | capture
 * @property {string} message  what it means for the video
 * @property {string} fix      what to do
 * @property {string} line     the first log line that matched (trimmed)
 * @property {number} count    how many lines matched
 */

const FONT_FILE = /\.(?:ttf|otf|woff2?)\b/i;
const SCRIPT_FILE = /\.m?js\b/i;

/**
 * Ordered: a log line counts for the first signature it matches only.
 * `{reel}` in a fix is replaced with the reel's html path.
 * @type {readonly { code: string, test: (line: string) => boolean, message: string, fix: string }[]}
 */
export const RENDER_LOG_SIGNATURES = Object.freeze([
  {
    code: "font",
    test: (l) =>
      /Could not embed local font/i.test(l) ||
      (/404 Not Found/i.test(l) && FONT_FILE.test(l)) ||
      (/Asset load failure|REQUESTFAILED|Browser:HTTP4\d\d/i.test(l) && (/resource=font/i.test(l) || FONT_FILE.test(l))),
    message: "a font failed to load — text rendered in a fallback font (this can hide on machines that have TikTok Sans installed)",
    fix: 'the @font-face in {reel} must load "../assets/fonts/TikTokSans-Variable.ttf"; if assets/fonts/ is missing, re-run `reelclaw make` (it restores it)',
  },
  {
    code: "script",
    test: (l) =>
      /Failed to download CDN script|sub_timeline_script_failure|timeline wait cut short|GSAP is not loaded/i.test(l) ||
      (/404 Not Found|Asset load failure|REQUESTFAILED/i.test(l) && SCRIPT_FILE.test(l)),
    message: "a script (GSAP) failed to load — animations, motion and fades were dropped",
    fix: 'load GSAP from the project, never a CDN: <script src="../assets/vendor/gsap.min.js"> in {reel}; re-run `reelclaw make` to restore assets/vendor/',
  },
  {
    code: "asset",
    test: (l) =>
      /could not be resolved on disk|media_load_failed|Audio track failed|audio_processing_failed|source_not_found|VIDEO_SOURCE_UNRENDERABLE/i.test(l) ||
      (/\[FileServer\] 404 Not Found|Asset load failure|Browser:REQUESTFAILED|Browser:HTTP4\d\d/i.test(l) && !/favicon/i.test(l)),
    message: "a video, audio or image failed to load — something is missing from the frame or the mix",
    fix: "fix the src in {reel}: media paths are ../assets/<file> relative to the reel, and the file must exist (re-run `reelclaw make` to re-stage inputs)",
  },
  {
    code: "sparse-keyframes",
    test: (l) => /sparse keyframes/i.test(l),
    message: "a video has sparse keyframes — seeks land on stale frames, so footage can freeze or stutter",
    fix: "re-run `reelclaw make` (staging re-encodes sparse video automatically), or re-encode by hand: ffmpeg -i in.mp4 -c:v libx264 -crf 18 -pix_fmt yuv420p -g 30 -keyint_min 30 -c:a aac -movflags +faststart out.mp4",
  },
  {
    code: "page-error",
    test: (l) => /\[Browser:PAGEERROR\]/.test(l),
    message: "a script in the composition threw an error — part of the reel may not have been set up",
    fix: "undo the last hand edit to {reel} (check element ids used by scripts and the window.__timelines key), then `reelclaw check` and re-render",
  },
  {
    code: "capture",
    test: (l) => /Render completed capture with correctness warnings|\[FrameCapture:[a-z_]+\]/i.test(l),
    message: "HyperFrames finished with correctness warnings — some frames may not show what the composition describes",
    fix: "read the matching lines in the render log; usually a script or asset problem in {reel}",
  },
]);

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;

/**
 * Find silent-failure signatures in a HyperFrames render log. Pure.
 * @param {string} text  the full log
 * @returns {RenderWarning[]} one entry per signature found, in signature order
 */
export function scanRenderLog(text) {
  /** @type {Map<string, RenderWarning>} */
  const found = new Map();
  for (const raw of text.split(/\r?\n|\r/)) {
    const line = raw.replace(ANSI, "").trim();
    if (!line) continue;
    const sig = RENDER_LOG_SIGNATURES.find((s) => s.test(line));
    if (!sig) continue;
    const hit = found.get(sig.code);
    if (hit) hit.count++;
    else found.set(sig.code, { code: sig.code, message: sig.message, fix: sig.fix, line: line.length > 240 ? `${line.slice(0, 239)}…` : line, count: 1 });
  }
  return RENDER_LOG_SIGNATURES.flatMap((s) => found.get(s.code) ?? []);
}

/**
 * The RENDER WARNINGS block printed after a render and in qa reports.
 * @param {RenderWarning[]} warnings
 * @param {{ reel?: string, logFile?: string, failed?: boolean }} [o] `reel` fills {reel} in fixes
 *   (default "the reel's html"); `failed`: the render itself failed (different heading)
 * @returns {string} empty when there are no warnings
 */
export function formatRenderWarnings(warnings, { reel = "the reel's html", logFile, failed = false } = {}) {
  if (!warnings.length) return "";
  const lines = [failed
    ? "Likely causes, from the render log:"
    : `RENDER WARNINGS — the render "succeeded", but ${warnings.length === 1 ? "this usually means" : "these usually mean"} a broken video:`];
  for (const w of warnings) {
    lines.push(`  - ${w.message}`);
    lines.push(`      log: ${w.line}${w.count > 1 ? `  (+${w.count - 1} more)` : ""}`);
    lines.push(`      fix: ${w.fix.replaceAll("{reel}", reel)}`);
  }
  if (logFile) lines.push(`  full log: ${logFile}`);
  return lines.join("\n");
}
