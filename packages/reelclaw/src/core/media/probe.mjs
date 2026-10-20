// @ts-check
/** ffprobe → ProbeInfo, cached on disk next to the staged file's content hash. */
import { ReelclawError } from "../errors.mjs";
import { requireTool, run } from "../exec.mjs";

/** @typedef {import('../types.mjs').ProbeInfo} ProbeInfo */

const IMAGE_FORMATS = /(^|,)(image2|png_pipe|jpeg_pipe|webp_pipe|gif|bmp_pipe|tiff_pipe|svg_pipe)(,|$)/;

/**
 * Probe a media file with ffprobe.
 * @param {string} file absolute path
 * @returns {Promise<ProbeInfo>}
 */
export async function ffprobe(file) {
  requireTool("ffprobe", "read media durations and sizes");
  const r = await run("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", file]);
  if (r.code !== 0) {
    throw new ReelclawError(`could not read media file ${file}`, { hint: `ffprobe says: ${r.stderr.trim() || "unknown error"} — is it a valid video/image/audio file?` });
  }
  return parseProbe(JSON.parse(r.stdout));
}

/**
 * Turn raw `ffprobe -of json` output into ProbeInfo. Pure (unit-tested).
 * @param {{ format?: Record<string, any>, streams?: Record<string, any>[] }} raw
 * @returns {ProbeInfo}
 */
export function parseProbe(raw) {
  const streams = raw.streams ?? [];
  const format = raw.format ?? {};
  const isImage = IMAGE_FORMATS.test(String(format.format_name ?? ""));
  const v = streams.find((s) => s.codec_type === "video" && !(s.disposition?.attached_pic));
  const hasAudio = streams.some((s) => s.codec_type === "audio");

  let width = Number(v?.width ?? 0);
  let height = Number(v?.height ?? 0);
  const rotation = Math.abs(rotationOf(v) % 180);
  if (rotation === 90) [width, height] = [height, width];

  const pix = String(v?.pix_fmt ?? "");
  const hasAlpha = /^(yuva|rgba|bgra|argb|abgr|ya|gbrap|pal8)/.test(pix) || v?.tags?.alpha_mode === "1" || v?.tags?.ALPHA_MODE === "1";
  const duration = isImage ? 0 : Number(format.duration ?? v?.duration ?? 0) || 0;

  return {
    duration: Math.round(duration * 1000) / 1000,
    width,
    height,
    fps: isImage || !v ? 0 : frameRate(v.avg_frame_rate ?? v.r_frame_rate),
    hasVideo: Boolean(v) && !isImage,
    hasAudio,
    hasAlpha,
    isImage,
  };
}

/** @param {Record<string, any> | undefined} v */
function rotationOf(v) {
  if (!v) return 0;
  const tag = Number(v.tags?.rotate ?? 0);
  if (tag) return tag;
  const side = (v.side_data_list ?? []).find((/** @type {any} */ d) => d.rotation !== undefined);
  return Number(side?.rotation ?? 0);
}

/** @param {string | undefined} rate "30000/1001" */
function frameRate(rate) {
  if (!rate) return 0;
  const [n, d] = rate.split("/").map(Number);
  return d ? Math.round((n / d) * 100) / 100 : n || 0;
}
