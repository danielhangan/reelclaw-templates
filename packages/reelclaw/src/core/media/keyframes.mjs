// @ts-check
/**
 * Seek-safe video. HyperFrames renders by seeking to every frame; in a video
 * whose keyframes are seconds apart (phone exports, TikTok/IG downloads) those
 * seeks land late or on stale frames, so the render stutters or freezes
 * (HyperFrames itself warns "sparse keyframes"). Staging re-encodes such files
 * once with a keyframe every 30 frames.
 */
import { ReelclawError } from "../errors.mjs";
import { requireTool, run } from "../exec.mjs";

/** A video whose keyframes are further apart than this (seconds) is re-encoded. */
export const MAX_KEYFRAME_GAP = 2;

/** Derive key of the re-encoded copy: `assets/<stem>.seekable.mp4`. */
export const SEEKABLE_KEY = "seekable";

/**
 * ffmpeg arguments that make a seek-friendly H.264 copy (a keyframe every 30
 * frames, faststart). Audio is kept when present.
 * @param {string} input
 * @param {string} output
 */
export function seekableArgs(input, output) {
  return [
    "-y", "-v", "error", "-i", input,
    "-map", "0:v:0", "-map", "0:a:0?",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
    "-g", "30", "-keyint_min", "30",
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
    output,
  ];
}

/**
 * Keyframe timestamps (seconds) of the first video stream, read from packet
 * flags (no decoding, so it is fast even for long files).
 * @param {string} file
 * @returns {Promise<number[]>}
 */
export async function keyframeTimes(file) {
  requireTool("ffprobe", "check video keyframes");
  const r = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time,flags", "-of", "csv=p=0", file]);
  if (r.code !== 0) throw new ReelclawError(`could not read keyframes of ${file}`, { hint: r.stderr.trim() || "is it a valid video?" });
  return parseKeyframePackets(r.stdout);
}

/**
 * `ffprobe -show_entries packet=pts_time,flags -of csv=p=0` → sorted keyframe times. Pure.
 * @param {string} csv lines like "0.033333,K__" / "0.066667,___"
 */
export function parseKeyframePackets(csv) {
  /** @type {number[]} */
  const out = [];
  for (const line of csv.split("\n")) {
    const [t, flags = ""] = line.trim().split(",");
    if (!flags.includes("K")) continue;
    const n = Number(t);
    if (t !== "" && Number.isFinite(n)) out.push(n);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Longest stretch (seconds) a seek may have to decode through: the largest gap
 * between keyframes, including from the last keyframe to the end of the file.
 * A file with no keyframes at all counts as one gap the length of the file. Pure.
 * @param {number[]} times sorted keyframe times
 * @param {number} duration seconds
 */
export function maxKeyframeGap(times, duration) {
  if (!times.length) return Math.round(duration * 100) / 100;
  let gap = times[0];
  for (let i = 1; i < times.length; i++) gap = Math.max(gap, times[i] - times[i - 1]);
  gap = Math.max(gap, duration - times[times.length - 1]);
  return Math.round(gap * 100) / 100;
}
