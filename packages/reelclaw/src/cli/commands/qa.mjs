// @ts-check
import { resolve } from "node:path";
import { ReelclawError } from "../../core/errors.mjs";
import { color, displayPath } from "../../core/log.mjs";
import { qaReel, renderWarningProblem, resolveQaTarget } from "../../core/qa.mjs";
import { formatRenderWarnings } from "../../core/render-log.mjs";
import { numberFlag } from "../args.mjs";

/** @typedef {import('../../core/qa.mjs').QaReport} QaReport */
/** @typedef {import('../../core/log.mjs').Logger} Logger */

/** @type {import('../main.mjs').Command} */
export default {
  summary: "check a rendered reel and write the frames to look at before delivering",
  usage: `
Usage
  reelclaw qa <name> [--out dir] [--json]          a reel from reels/ (renders/<name>.mp4)
  reelclaw qa <video.mp4> [--cut 3] [--cut 7.5]     any MP4

For a reel made by reelclaw the frame times come from its composition
(reels/<name>.html): 0.0s, 0.5s and 1.0s (scroll-stop, hook readable), 0.2s
before and 0.5s after every hard cut, the middle of every caption window and
the last frame — 540x960 with the text safe band outlined. Also writes
font-check.png (full-res caption region), contact-sheet.png (2 fps) and
report.txt / report.json: canvas, fps, duration vs the composition, audio
level (or SILENT), music tail fade, black frames, frozen frames and the render
log's silent-failure warnings (renders/<name>.render.log).

Exit code 1 on a problem: wrong canvas or length, silent when the composition
has sound, black frames, render warnings. Warnings are listed but don't fail.
Then open every PNG — the numbers can't tell you whether the hook reads.

Flags
  --out <dir>    output folder (default renders/qa/<name>/, next to the MP4)
  --cut <s>      also check around a cut at <s> seconds (repeatable; the only
                 cuts known for a plain MP4)
  --json         print report.json instead of the summary`,
  options: {
    out: { type: "string" },
    cut: { type: "string", multiple: true },
    json: { type: "boolean" },
  },
  async run(ctx) {
    const [target, ...extra] = ctx.args.positionals;
    if (!target || extra.length) throw new ReelclawError("qa one reel at a time", { hint: "reelclaw qa <name>  or  reelclaw qa path/to/video.mp4" });
    const v = ctx.args.values;
    const cuts = /** @type {string[]} */ (v.cut ?? []).map((c) => /** @type {number} */ (numberFlag(c, "cut")));
    const t = resolveQaTarget({ root: ctx.root, target, cwd: ctx.cwd });
    if (!v.json) ctx.log.step(`qa ${displayPath(ctx.cwd, t.video)}${t.html ? ` (timeline from ${displayPath(ctx.cwd, t.html)})` : ""}…`);
    const report = await qaReel({ video: t.video, html: t.html, out: v.out ? resolve(ctx.cwd, String(v.out)) : t.out, cuts, cwd: ctx.cwd });
    if (v.json) console.log(JSON.stringify(report, null, 2));
    else printQa(report, ctx.cwd, ctx.log);
    return report.ok ? 0 : 1;
  },
};

/**
 * Terminal summary of a QA run (shared with `make --render`): measurements,
 * problems/warnings, then every PNG to open.
 * @param {QaReport} r
 * @param {string} cwd
 * @param {Logger} log
 */
export function printQa(r, cwd, log) {
  const p = (/** @type {string} */ f) => displayPath(cwd, f);
  const f = r.format;
  const audio = !r.audio.hasAudio ? "no audio (SILENT)" : r.audio.silent ? "SILENT" : `${r.audio.meanVolume} dB mean`;
  const tail = r.audio.tail?.belowMean != null ? ` · tail −${r.audio.tail.belowMean} dB` : "";
  console.log(color.dim(`  ${f.width}x${f.height} · ${f.fps}fps · ${f.duration}s${f.expectedDuration !== null ? ` (composition ${f.expectedDuration}s)` : ""} · ${audio}${tail} · ${r.cuts.length} cut(s) · ${r.captions.length} caption(s) · black ${r.black.length ? "YES" : "none"} · freezes ${r.freezes.length}`));
  if (r.renderWarnings.length) {
    const block = formatRenderWarnings(r.renderWarnings, { reel: r.reel ? p(r.reel) : undefined, logFile: r.renderLog ? p(r.renderLog) : undefined });
    console.log(color.red(block));
  }
  const fromLog = new Set(r.renderWarnings.map((w) => renderWarningProblem(w)));
  for (const x of r.problems) if (!fromLog.has(x)) log.error(x);
  for (const x of r.warnings) log.warn(x);
  console.log(`\n${color.bold("Look at every frame before delivering")} ${color.dim(`(report: ${p(`${r.out}/report.txt`)})`)}`);
  for (const fr of r.frames) console.log(`  ${p(fr.file)}  ${color.dim(fr.reasons.join("; "))}`);
  console.log(`  ${p(r.fontCheck.file)}  ${color.dim("full-res caption: TikTok Sans, not a fallback?")}`);
  console.log(`  ${p(r.contactSheet.file)}  ${color.dim(`${r.contactSheet.fps} fps sheet`)}`);
  if (r.ok) log.success(`qa: no problems measured${r.warnings.length ? ` (${r.warnings.length} warning(s) to judge)` : ""}`);
  else log.error(`qa failed: ${r.problems.length} problem(s) — fix before delivering`);
}
