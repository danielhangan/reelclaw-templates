// @ts-check
/** Fetch remote media: direct file URLs via HTTP, page links (TikTok/IG/YouTube…) via yt-dlp. */
import { createWriteStream } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ReelclawError } from "../errors.mjs";
import { requireTool, run } from "../exec.mjs";

/** @typedef {import('../types.mjs').MediaKind} MediaKind */

const DIRECT_EXT = /\.(mp4|mov|m4v|webm|mkv|mp3|m4a|aac|wav|ogg|opus|flac|png|jpe?g|webp|gif)$/i;

/**
 * How an input string should be fetched.
 * @param {string} value
 * @returns {'local'|'direct'|'page'}
 */
export function classifySource(value) {
  if (!/^https?:\/\//i.test(value)) return "local";
  try {
    return DIRECT_EXT.test(new URL(value).pathname) ? "direct" : "page";
  } catch {
    throw new ReelclawError(`not a valid URL: ${value}`);
  }
}

/**
 * Download a direct file URL. Returns the written path.
 * @param {string} url
 * @param {string} dir    directory to write into
 * @returns {Promise<string>}
 */
export async function downloadDirect(url, dir) {
  await mkdir(dir, { recursive: true });
  const ext = (new URL(url).pathname.match(DIRECT_EXT)?.[0] ?? ".bin").toLowerCase();
  const out = join(dir, `download${ext}`);
  let res;
  try {
    res = await fetch(url, { redirect: "follow" });
  } catch (cause) {
    throw new ReelclawError(`could not download ${url}`, { hint: `network error: ${/** @type {Error} */ (cause).message}`, cause });
  }
  if (!res.ok || !res.body) {
    throw new ReelclawError(`download failed (HTTP ${res.status}) for ${url}`, {
      hint: res.status === 403 ? "the link may be expired or private — download it in a browser and pass the local file" : undefined,
    });
  }
  await pipeline(Readable.fromWeb(/** @type {any} */ (res.body)), createWriteStream(out));
  return out;
}

/**
 * Download a page link (TikTok, Instagram, YouTube, X…) with yt-dlp.
 * Video inputs get an mp4; audio inputs get the extracted soundtrack (m4a).
 * @param {string} url
 * @param {string} dir
 * @param {MediaKind} kind
 * @returns {Promise<string>}
 */
export async function downloadPage(url, dir, kind) {
  if (kind === "image") {
    throw new ReelclawError(`${url} is a page link, not an image file`, { hint: "pass a direct image URL (ending in .png/.jpg/.webp) or a local file" });
  }
  requireTool("yt-dlp", `download page links like ${url}`);
  await mkdir(dir, { recursive: true });
  const template = join(dir, "download.%(ext)s");
  const args = kind === "audio"
    ? ["-x", "--audio-format", "m4a", "--no-playlist", "-o", template, url]
    : ["-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b", "--merge-output-format", "mp4", "--no-playlist", "-o", template, url];
  const r = await run("yt-dlp", args);
  if (r.code !== 0) {
    throw new ReelclawError(`yt-dlp could not download ${url}`, {
      hint: `${lastLine(r.stderr)} — try \`yt-dlp -U\` to update it, or download the video yourself and pass the file`,
    });
  }
  const file = (await readdir(dir)).find((f) => f.startsWith("download.") && !f.endsWith(".part"));
  if (!file) throw new ReelclawError(`yt-dlp finished but wrote no file for ${url}`);
  return join(dir, file);
}

/** @param {string} s */
function lastLine(s) {
  return s.trim().split("\n").filter(Boolean).pop() ?? "unknown error";
}
