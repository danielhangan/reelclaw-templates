// @ts-check
/**
 * Inspect rendered reels: probe an MP4 against what its composition declares
 * (size, fps, duration, audio), and extract review images — a frame strip, a
 * safe-zone overlay (RULES.md §4) and a small preview GIF/MP4.
 *
 * Used by `reelclaw preview`, the CI smoke render (scripts/smoke-render.mjs)
 * and the integration tests. Pure helpers are exported for unit tests.
 */
import { rename, rm, stat } from "node:fs/promises";
import { ReelclawError } from "./errors.mjs";
import { requireTool, run } from "./exec.mjs";
import { CANVAS, SAFE_BAND, SAFE_ZONE } from "./geometry.mjs";
import { declaredDuration } from "./render.mjs";

/**
 * @typedef {object} RenderInfo
 * @property {number} width
 * @property {number} height
 * @property {number} fps
 * @property {number} duration      seconds (container)
 * @property {string} videoCodec
 * @property {string} pixFmt
 * @property {boolean} hasAudio
 * @property {number | null} meanVolume  dB of the first audio stream (null: no audio)
 * @property {number | null} maxVolume   dB
 * @property {number} blackSeconds  seconds of (near-)black frames
 */

/**
 * @typedef {object} RenderExpectation
 * @property {number} [duration]   declared reel length (seconds)
 * @property {boolean} [audible]   the composition plays sound (music or a video with volume)
 */

/**
 * @typedef {object} RenderCheck
 * @property {string[]} problems   the render is wrong (CI fails)
 * @property {string[]} warnings   suspicious; worth a look
 */

/** Duration slack between declared and rendered length (one frame + encoder rounding). */
export const DURATION_TOLERANCE = 0.15;
/** Mean volume below this is treated as silence. */
export const SILENCE_DB = -60;

/**
 * What a composition promises about its render.
 * @param {string} html  compiled reels/<name>.html
 * @returns {RenderExpectation}
 */
export function expectationsFor(html) {
  const duration = declaredDuration(html) ?? undefined;
  const audible = /<audio\b/i.test(html) || /data-has-audio="true"/.test(html);
  return { duration, audible };
}

/**
 * Compare a probed render with the platform format and the composition. Pure.
 * @param {RenderInfo} info
 * @param {RenderExpectation} [expect]
 * @returns {RenderCheck}
 */
export function checkRender(info, expect = {}) {
  /** @type {string[]} */
  const problems = [];
  /** @type {string[]} */
  const warnings = [];
  if (info.width !== CANVAS.width || info.height !== CANVAS.height) {
    problems.push(`resolution is ${info.width}x${info.height}, expected ${CANVAS.width}x${CANVAS.height}`);
  }
  if (Math.abs(info.fps - CANVAS.fps) > 0.01) problems.push(`frame rate is ${info.fps}, expected ${CANVAS.fps}`);
  if (info.videoCodec !== "h264") problems.push(`video codec is ${info.videoCodec || "missing"}, expected h264`);
  if (info.pixFmt && info.pixFmt !== "yuv420p") warnings.push(`pixel format ${info.pixFmt} (platforms expect yuv420p)`);
  if (!(info.duration > 0)) problems.push("render has no duration");
  else if (expect.duration !== undefined && Math.abs(info.duration - expect.duration) > DURATION_TOLERANCE) {
    problems.push(`duration is ${info.duration}s, the composition declares ${expect.duration}s`);
  }
  if (expect.audible) {
    if (!info.hasAudio) problems.push("no audio stream, but the composition has music or a clip with sound");
    else if (info.meanVolume === null || info.meanVolume < SILENCE_DB) {
      problems.push(`audio is silent (mean ${info.meanVolume ?? "-inf"} dB), but the composition has music or a clip with sound`);
    }
  }
  if (info.duration > 0 && info.blackSeconds > Math.min(1, info.duration / 2)) {
    warnings.push(`${info.blackSeconds}s of black frames — did a video fail to load?`);
  }
  return { problems, warnings };
}

/**
 * Probe a rendered MP4: streams, loudness and black frames.
 * @param {string} file
 * @returns {Promise<RenderInfo>}
 */
export async function probeRender(file) {
  requireTool("ffprobe", "inspect renders");
  requireTool("ffmpeg", "inspect renders");
  const p = await run("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", file]);
  if (p.code !== 0) throw new ReelclawError(`could not read ${file}`, { hint: p.stderr.trim() || "is it a valid MP4?" });
  const raw = JSON.parse(p.stdout);
  /** @type {Record<string, any>[]} */
  const streams = raw.streams ?? [];
  const v = streams.find((s) => s.codec_type === "video") ?? {};
  const hasAudio = streams.some((s) => s.codec_type === "audio");
  // one decode pass: volumedetect on the audio, blackdetect on a 10fps video sample
  const args = ["-hide_banner", "-nostats", "-i", file, "-filter_complex", "[0:v]fps=10,blackdetect=d=0.1:pix_th=0.06[vo]", "-map", "[vo]"];
  if (hasAudio) args.push("-map", "0:a:0", "-af", "volumedetect");
  args.push("-f", "null", "-");
  const a = await run("ffmpeg", args);
  const vol = parseVolume(a.stderr);
  return {
    width: Number(v.width ?? 0),
    height: Number(v.height ?? 0),
    fps: frameRate(v.avg_frame_rate),
    duration: Math.round(Number(raw.format?.duration ?? v.duration ?? 0) * 1000) / 1000,
    videoCodec: String(v.codec_name ?? ""),
    pixFmt: String(v.pix_fmt ?? ""),
    hasAudio,
    meanVolume: hasAudio ? vol.mean : null,
    maxVolume: hasAudio ? vol.max : null,
    blackSeconds: parseBlack(a.stderr),
  };
}

/**
 * `volumedetect` stderr → dB values (null when absent / -inf).
 * @param {string} stderr
 */
export function parseVolume(stderr) {
  const num = (/** @type {RegExpExecArray | null} */ m) => (m && Number.isFinite(Number(m[1])) ? Number(m[1]) : null);
  return { mean: num(/mean_volume:\s*(-?[\d.]+) dB/.exec(stderr)), max: num(/max_volume:\s*(-?[\d.]+) dB/.exec(stderr)) };
}

/**
 * Total seconds reported by `blackdetect` (black_duration lines).
 * @param {string} stderr
 */
export function parseBlack(stderr) {
  let total = 0;
  for (const m of stderr.matchAll(/black_duration:\s*([\d.]+)/g)) total += Number(m[1]);
  return Math.round(total * 100) / 100;
}

/** @param {string | undefined} rate "30/1" */
function frameRate(rate) {
  if (!rate) return 0;
  const [n, d] = rate.split("/").map(Number);
  return d ? Math.round((n / d) * 100) / 100 : n || 0;
}

/**
 * `count` sample times spread across a reel (segment midpoints, so the first
 * and last frames — often fades — are avoided). Pure.
 * @param {number} duration
 * @param {number} count
 * @returns {number[]} seconds, rounded to 0.01
 */
export function frameTimes(duration, count) {
  if (!(duration > 0) || count < 1) return [];
  return Array.from({ length: count }, (_, i) => Math.round(((i + 0.5) / count) * duration * 100) / 100);
}

/**
 * ffmpeg filter that shades the platform UI zones and outlines the text band
 * (RULES.md §4) on a 1080x1920 frame. Pure.
 * @returns {string}
 */
export function safeZoneFilter() {
  const { top, bottom, left, right } = SAFE_ZONE;
  const { width: W, height: H } = CANVAS;
  const shade = "color=black@0.55:t=fill";
  const b = SAFE_BAND;
  return [
    `scale=${W}:${H}`,
    `drawbox=x=0:y=0:w=${W}:h=${top}:${shade}`,
    `drawbox=x=0:y=${H - bottom}:w=${W}:h=${bottom}:${shade}`,
    `drawbox=x=0:y=${top}:w=${left}:h=${b.h}:${shade}`,
    `drawbox=x=${W - right}:y=${top}:w=${right}:h=${b.h}:${shade}`,
    `drawbox=x=${b.x}:y=${b.y}:w=${b.w}:h=${b.h}:color=lime@0.9:t=6`,
  ].join(",");
}

/**
 * filter_complex for a horizontal strip of `n` single-frame inputs. Pure.
 * @param {number} n
 * @param {{ height: number, safeZones?: boolean, gap?: number }} o
 */
export function stripFilter(n, { height, safeZones = false, gap = 12 }) {
  const width = Math.round((height * CANVAS.width) / CANVAS.height / 2) * 2;
  const parts = [];
  for (let i = 0; i < n; i++) {
    const overlay = safeZones ? `${safeZoneFilter()},` : "";
    const pad = i < n - 1 ? `,pad=${width + gap}:${height}:0:0:color=0x111111` : "";
    parts.push(`[${i}:v]${overlay}scale=${width}:${height}:flags=lanczos,setsar=1${pad}[f${i}]`);
  }
  const labels = Array.from({ length: n }, (_, i) => `[f${i}]`).join("");
  parts.push(n > 1 ? `${labels}hstack=inputs=${n}[out]` : `[f0]null[out]`);
  return parts.join(";");
}

/**
 * Write a PNG strip of frames taken at `times` from `video`.
 * @param {string} video
 * @param {number[]} times seconds
 * @param {string} out .png path
 * @param {{ height?: number, safeZones?: boolean }} [o] height of each frame (default 640)
 */
export async function frameStrip(video, times, out, { height = 640, safeZones = false } = {}) {
  if (!times.length) throw new ReelclawError("frameStrip needs at least one time");
  requireTool("ffmpeg", "extract preview frames");
  const inputs = times.flatMap((t) => ["-ss", String(t), "-i", video]);
  const r = await run("ffmpeg", [
    "-y", "-v", "error", ...inputs,
    "-filter_complex", stripFilter(times.length, { height, safeZones }),
    "-map", "[out]", "-frames:v", "1", "-update", "1", out,
  ]);
  if (r.code !== 0) throw new ReelclawError(`could not extract frames from ${video}`, { hint: r.stderr.trim().split("\n").slice(-2).join(" ") });
  return out;
}

/**
 * Write a looping preview GIF no larger than `maxBytes`, stepping size and
 * frame rate down until it fits.
 * @param {string} video
 * @param {string} out .gif path
 * @param {{ maxBytes?: number }} [o] default 2MB (TEMPLATE_API.md budget)
 * @returns {Promise<{ out: string, bytes: number, width: number, fps: number }>}
 */
export async function previewGif(video, out, { maxBytes = 2_000_000 } = {}) {
  requireTool("ffmpeg", "make preview GIFs");
  /** @type {{ out: string, bytes: number, width: number, fps: number } | undefined} */
  let last;
  for (const [width, fps, colors] of [[270, 10, 128], [216, 8, 96], [180, 6, 64], [144, 5, 48]]) {
    const filter = `fps=${fps},scale=${width}:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
    const r = await run("ffmpeg", ["-y", "-v", "error", "-i", video, "-filter_complex", filter, "-loop", "0", out]);
    if (r.code !== 0) throw new ReelclawError(`could not make a GIF from ${video}`, { hint: r.stderr.trim().split("\n").slice(-2).join(" ") });
    last = { out, bytes: (await stat(out)).size, width, fps };
    if (last.bytes <= maxBytes) return last;
  }
  return /** @type {NonNullable<typeof last>} */ (last);
}

/**
 * Write a small web preview MP4 (540x960, with sound) for READMEs and the website.
 * @param {string} video
 * @param {string} out .mp4 path
 */
export async function previewMp4(video, out) {
  requireTool("ffmpeg", "make preview videos");
  const tmp = `${out}.tmp.mp4`;
  const r = await run("ffmpeg", [
    "-y", "-v", "error", "-i", video,
    "-vf", "scale=540:960:flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", "30", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", tmp,
  ]);
  if (r.code !== 0) {
    await rm(tmp, { force: true });
    throw new ReelclawError(`could not make a preview MP4 from ${video}`, { hint: r.stderr.trim().split("\n").slice(-2).join(" ") });
  }
  await rename(tmp, out);
  return out;
}
