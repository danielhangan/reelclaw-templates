// @ts-check
/**
 * Images an agent (or a human) looks at to understand a reference video:
 *
 *   shots/NNN.png       one labelled keyframe per shot (mid-shot, 540px wide)
 *   contact-sheet.png   every shot keyframe in a grid — structure at a glance
 *   filmstrip.png       a frame every `step` seconds — text and motion that change without a cut
 *   compare.png         reference vs. your render at the same timestamps (analyze --compare)
 *
 * Labels use TikTok Sans via ffmpeg drawtext; on an ffmpeg without libfreetype
 * the images are produced without labels (times are in analysis.json anyway).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { ReelclawError } from "../core/errors.mjs";
import { requireTool, run } from "../core/exec.mjs";
import { ENGINE_ROOT, REPO_ROOT } from "../core/project.mjs";

/** @typedef {import('./scenes.mjs').Shot} Shot */

const STEPS = [0.5, 1, 1.5, 2, 3, 4, 5, 10, 15, 30];
const KEYFRAME_W = 540;
const THUMB_W = 270;
const THUMB_H = 480;

/**
 * The smallest "nice" sampling step that keeps the frame count ≤ `max`.
 * @param {number} duration seconds
 * @param {number} max frames
 */
export function stripStep(duration, max) {
  return STEPS.find((s) => Math.floor(duration / s) + 1 <= max) ?? Math.ceil(duration / (max - 1));
}

/** Grid size for `n` tiles, at most `cols` wide. */
export function grid(/** @type {number} */ n, /** @type {number} */ cols) {
  const c = Math.max(1, Math.min(n, cols));
  return { cols: c, rows: Math.max(1, Math.ceil(n / c)) };
}

/** @type {string | null | undefined} */
let fontFile;

/** TikTok Sans for labels, or null when drawtext/the font is unavailable. */
function labelFont() {
  if (fontFile !== undefined) return fontFile;
  const filters = spawnSync("ffmpeg", ["-hide_banner", "-filters"], { encoding: "utf8" }).stdout ?? "";
  const font = [join(ENGINE_ROOT, "fonts"), REPO_ROOT && join(REPO_ROOT, "shared", "fonts")]
    .filter(Boolean)
    .map((d) => join(/** @type {string} */ (d), "TikTokSans-Variable.ttf"))
    .find((f) => existsSync(f));
  fontFile = /\bdrawtext\b/.test(filters) && font ? font : null;
  return fontFile;
}

/** Escape a value for an ffmpeg filter option (inside single quotes). */
const esc = (/** @type {string} */ s) => s.replace(/\\/g, "/").replace(/'/g, "\\'").replace(/:/g, "\\:");

/**
 * A white strip above the frame with `text` in it (`%{pts\:hms}` expands to the
 * frame time). Empty string when labels are unavailable.
 * @param {string} text drawtext text (already escaped for expansions)
 * @param {number} size font size in px
 */
function label(text, size) {
  const font = labelFont();
  if (!font) return "";
  const bar = Math.round(size * 1.6);
  return `,pad=iw:ih+${bar}:0:${bar}:white,drawtext=fontfile='${esc(font)}':text='${text}':fontsize=${size}:fontcolor=black:x=${Math.round(size / 2)}:y=${Math.round(size * 0.3)}`;
}

/** @param {string[]} args */
async function ffmpeg(args) {
  requireTool("ffmpeg", "extract frames from the video");
  const r = await run("ffmpeg", ["-v", "error", "-y", ...args]);
  if (r.code !== 0) throw new ReelclawError("ffmpeg could not extract frames", { hint: r.stderr.trim().split("\n").pop() ?? "" });
}

/**
 * One labelled mid-shot keyframe per shot → `<dir>/shots/NNN.png`.
 * @param {string} file
 * @param {Shot[]} shots
 * @param {string} dir analysis folder
 * @returns {Promise<string[]>} paths relative to `dir`
 */
export async function shotKeyframes(file, shots, dir) {
  await mkdir(join(dir, "shots"), { recursive: true });
  const rel = shots.map((s) => `shots/${String(s.index).padStart(3, "0")}.png`);
  const jobs = shots.map((s, i) => () => {
    const t = s.start + s.duration / 2;
    const text = `#${s.index}  ${s.start.toFixed(2)}-${s.end.toFixed(2)}s`;
    return ffmpeg(["-ss", t.toFixed(3), "-i", file, "-frames:v", "1", "-vf", `scale=${KEYFRAME_W}:-2${label(text, 30)}`, join(dir, rel[i])]);
  });
  // 4 at a time: fast without starving concurrent renders
  for (let i = 0; i < jobs.length; i += 4) await Promise.all(jobs.slice(i, i + 4).map((j) => j()));
  return rel;
}

/**
 * Tile the shot keyframes into one image.
 * @param {string} dir analysis folder (with shots/)
 * @param {number} count number of shots
 * @param {string} out
 */
export async function contactSheet(dir, count, out) {
  const { cols, rows } = grid(count, 6);
  await ffmpeg([
    "-framerate", "1", "-start_number", "1", "-i", join(dir, "shots", "%03d.png"),
    "-vf", `scale=${THUMB_W}:-2,tile=${cols}x${rows}:padding=8:margin=8:color=white`,
    "-frames:v", "1", out,
  ]);
}

/**
 * A frame every `step` seconds, timestamped, in one grid.
 * @param {string} file
 * @param {number} duration
 * @param {string} out
 * @returns {Promise<number>} the step used
 */
export async function filmstrip(file, duration, out) {
  const step = stripStep(duration, 40);
  const { cols, rows } = grid(Math.floor(duration / step) + 1, 8);
  const vf = `fps=1/${step},scale=${THUMB_W - 54}:-2${label("%{pts\\:hms}", 18)},tile=${cols}x${rows}:padding=6:margin=6:color=white`;
  await ffmpeg(["-i", file, "-an", "-vf", vf, "-frames:v", "1", out]);
  return step;
}

/**
 * Reference and candidate side by side at the same timestamps — the visual diff
 * an agent uses to check a template against the video it recreates.
 * @param {string} reference
 * @param {string} candidate
 * @param {number} duration  compared length (the shorter of the two)
 * @param {string} out
 * @returns {Promise<number>} the step used
 */
export async function compareSheet(reference, candidate, duration, out) {
  const step = stripStep(duration, 24);
  const { cols, rows } = grid(Math.floor(duration / step) + 1, 3);
  const frame = (/** @type {string} */ name) =>
    `fps=1/${step},scale=${THUMB_W}:${THUMB_H}:force_original_aspect_ratio=decrease,pad=${THUMB_W}:${THUMB_H}:(ow-iw)/2:(oh-ih)/2:black,setsar=1${label(`${name} %{pts\\:hms}`, 18)}`;
  const graph = [
    `[0:v]${frame("reference")}[a]`,
    `[1:v]${frame("yours")}[b]`,
    `[a][b]hstack=inputs=2,pad=iw+24:ih:12:0:white,tile=${cols}x${rows}:padding=6:margin=6:color=white[out]`,
  ].join(";");
  const t = duration.toFixed(3);
  await ffmpeg(["-t", t, "-i", reference, "-t", t, "-i", candidate, "-filter_complex", graph, "-map", "[out]", "-frames:v", "1", out]);
  return step;
}
