// @ts-check
/**
 * Shot detection: ffmpeg's scene score (`select='gt(scene,T)'`) on a small
 * proxy of the video, turned into a shot list and pacing stats. Deterministic:
 * the same file and threshold always give the same cuts.
 */
import { ReelclawError } from "../core/errors.mjs";
import { requireTool, run } from "../core/exec.mjs";

/**
 * @typedef {object} Shot
 * @property {number} index     1-based
 * @property {number} start     seconds
 * @property {number} end
 * @property {number} duration
 */

/**
 * @typedef {object} Pacing
 * @property {number} shots
 * @property {number} avgShot       mean shot length, seconds
 * @property {number} shortestShot
 * @property {number} longestShot
 * @property {number} cutsPerMinute
 * @property {number | null} firstCut  seconds until the first cut (the hook length), null for one-shot videos
 */

/** Default scene-change threshold (0–1). Lower finds more cuts (and more false ones). */
export const DEFAULT_THRESHOLD = 0.3;
/** Cuts closer together than this are merged (flash frames, glitch transitions). */
export const MIN_SHOT = 0.25;

const r3 = (/** @type {number} */ n) => Math.round(n * 1000) / 1000;
const r2 = (/** @type {number} */ n) => Math.round(n * 100) / 100;

/**
 * Times (seconds) where ffmpeg sees a scene change.
 * @param {string} file
 * @param {{ threshold?: number }} [o]
 * @returns {Promise<number[]>}
 */
export async function detectCuts(file, { threshold = DEFAULT_THRESHOLD } = {}) {
  requireTool("ffmpeg", "detect cuts in the reference video");
  // a 160px-wide proxy keeps this fast on long videos; scene scores barely change
  const vf = `scale=160:-2,select='gt(scene\\,${threshold})',showinfo`;
  const r = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-an", "-vf", vf, "-f", "null", "-"]);
  if (r.code !== 0) {
    throw new ReelclawError(`ffmpeg could not read ${file}`, { hint: r.stderr.trim().split("\n").pop() ?? "is it a video file?" });
  }
  return parseCutTimes(r.stderr);
}

/**
 * Pull `pts_time:` values from ffmpeg `showinfo` output.
 * @param {string} stderr
 * @returns {number[]} ascending, unique
 */
export function parseCutTimes(stderr) {
  const times = [...stderr.matchAll(/Parsed_showinfo.*?pts_time:\s*([\d.]+)/g)].map((m) => r3(Number(m[1])));
  return [...new Set(times)].filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
}

/**
 * Turn cut times into contiguous shots covering [0, duration]. Cuts within
 * `minShot` of the previous boundary (or of the end) are dropped.
 * @param {number[]} cuts
 * @param {number} duration
 * @param {{ minShot?: number }} [o]
 * @returns {Shot[]}
 */
export function shotsFromCuts(cuts, duration, { minShot = MIN_SHOT } = {}) {
  if (!(duration > 0)) throw new ReelclawError("the reference video has no duration", { hint: "is it a valid video file? check it with `ffprobe <file>`" });
  /** @type {number[]} */
  const bounds = [0];
  for (const t of [...cuts].sort((a, b) => a - b)) {
    if (t - bounds[bounds.length - 1] >= minShot && duration - t >= minShot) bounds.push(t);
  }
  bounds.push(duration);
  return bounds.slice(0, -1).map((start, i) => ({
    index: i + 1,
    start: r3(start),
    end: r3(bounds[i + 1]),
    duration: r3(bounds[i + 1] - start),
  }));
}

/**
 * @param {Shot[]} shots
 * @param {number} duration
 * @returns {Pacing}
 */
export function pacingOf(shots, duration) {
  const lengths = shots.map((s) => s.duration);
  return {
    shots: shots.length,
    avgShot: r2(duration / Math.max(1, shots.length)),
    shortestShot: r2(Math.min(...lengths)),
    longestShot: r2(Math.max(...lengths)),
    cutsPerMinute: r2(((shots.length - 1) / duration) * 60),
    firstCut: shots.length > 1 ? shots[1].start : null,
  };
}

/**
 * Tempo from beat times: 60 / median inter-beat interval, or null with < 4 beats.
 * @param {number[]} beats seconds
 */
export function bpmOf(beats) {
  if (beats.length < 4) return null;
  const gaps = beats.slice(1).map((t, i) => t - beats[i]).sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  return median > 0 ? Math.round(60 / median) : null;
}
