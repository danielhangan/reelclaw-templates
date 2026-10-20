// @ts-check
/**
 * Resolve the reference video for `reelclaw analyze`: a local file is used in
 * place; a page link (TikTok / Instagram / YouTube / X) is fetched with yt-dlp
 * together with its public metadata; a direct file URL is downloaded.
 *
 * Downloads land in the analysis folder as `source.<ext>` and are reused on
 * re-runs. The analysis folder is git-ignored: a reference video is never
 * committed — templates store the link only (CONTRIBUTING.md, copyright).
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdir, readFile, rename } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { ReelclawError } from "../core/errors.mjs";
import { requireTool, run } from "../core/exec.mjs";
import { classifySource, downloadDirect } from "../core/media/download.mjs";
import { kebab } from "../core/project.mjs";

/**
 * Public facts about the reference post (from yt-dlp's info JSON). Everything is
 * optional: local files have none of it.
 * @typedef {object} SourceMeta
 * @property {string} [platform]     "TikTok", "Instagram", "Youtube"…
 * @property {string} [title]
 * @property {string} [uploader]
 * @property {string} [uploadDate]   YYYYMMDD
 * @property {number} [views]
 * @property {number} [likes]
 * @property {number} [comments]
 * @property {number} [shares]
 * @property {string} [description]  the post caption (≤ 500 chars)
 * @property {string} [sound]        "track — artist" when the platform reports it
 */

/**
 * @typedef {object} ResolvedSource
 * @property {string} input   what the user passed
 * @property {string} file    absolute path of the video to analyze
 * @property {string} [url]   the reference link (page or direct URL)
 * @property {SourceMeta} meta
 * @property {boolean} downloaded  true when fetched by this run
 */

/** @typedef {(cmd: string, args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>} Exec */

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv)$/i;

/**
 * A short, stable folder name for a reference: `tiktok-7301234567890`,
 * `instagram-c1a2b3`, `youtube-dqw4w9wgxcq`, or the file's base name.
 * @param {string} value URL or file path
 */
export function slugFor(value) {
  if (classifySource(value) === "local") return kebab(basename(value, extname(value))) || "reference";
  const url = new URL(value);
  const host = url.hostname.replace(/^(www|m|vm|vt)\./, "");
  const path = url.pathname;
  /** @type {[RegExp, string, RegExp][]} host pattern, prefix, id pattern */
  const rules = [
    [/tiktok\.com$/, "tiktok", /\/(?:video|photo)\/(\d+)/],
    [/instagram\.com$/, "instagram", /\/(?:reels?|p|tv)\/([\w-]+)/],
    [/youtube\.com$/, "youtube", /\/(?:shorts|embed|live)\/([\w-]+)/],
    [/youtu\.be$/, "youtube", /^\/([\w-]+)/],
    [/(twitter|x)\.com$/, "x", /\/status\/(\d+)/],
  ];
  for (const [hostRe, prefix, idRe] of rules) {
    if (!hostRe.test(host)) continue;
    const id = idRe.exec(path)?.[1] ?? url.searchParams.get("v");
    if (id) return kebab(`${prefix}-${id}`);
  }
  const last = decodeURIComponent(path.split("/").filter(Boolean).pop() ?? "");
  return kebab(`${host.split(".")[0]}-${basename(last, extname(last))}`) || "reference";
}

/**
 * Find or fetch the reference video.
 * @param {string} value  file path (relative to `cwd`) or URL
 * @param {{ dir: string, cwd: string, refresh?: boolean, exec?: Exec }} o
 *   dir = analysis folder downloads go to; `exec` replaces the yt-dlp runner (tests)
 * @returns {Promise<ResolvedSource>}
 */
export async function resolveSource(value, { dir, cwd, refresh = false, exec }) {
  const kind = classifySource(value);
  if (kind === "local") {
    const file = resolve(cwd, value);
    if (!existsSync(file) || !statSync(file).isFile()) {
      throw new ReelclawError(`reference video not found: ${value}`, { hint: "pass a local video file or a TikTok / Instagram / YouTube link" });
    }
    return { input: value, file, meta: {}, downloaded: false };
  }

  await mkdir(dir, { recursive: true });
  const cached = refresh ? undefined : findDownloaded(dir);
  if (cached) return { input: value, url: value, file: cached, meta: await readInfo(dir), downloaded: false };

  if (kind === "direct") {
    const tmp = await downloadDirect(value, dir);
    const file = join(dir, `source${extname(tmp)}`);
    await rename(tmp, file);
    return { input: value, url: value, file, meta: {}, downloaded: true };
  }

  const file = await downloadPage(value, dir, exec);
  return { input: value, url: value, file, meta: await readInfo(dir), downloaded: true };
}

/**
 * yt-dlp → `<dir>/source.mp4` + `<dir>/source.info.json`.
 * @param {string} url
 * @param {string} dir
 * @param {Exec} [exec]
 */
async function downloadPage(url, dir, exec) {
  if (!exec) requireTool("yt-dlp", `download ${url}`);
  const args = [
    "-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b",
    "--merge-output-format", "mp4",
    "--no-playlist",
    "--write-info-json",
    "-o", join(dir, "source.%(ext)s"),
    url,
  ];
  const r = await (exec ?? run)("yt-dlp", args);
  if (r.code !== 0) {
    const reason = r.stderr.trim().split("\n").filter(Boolean).pop() ?? "unknown error";
    throw new ReelclawError(`yt-dlp could not download ${url}`, {
      hint: `${reason} — update it (\`yt-dlp -U\` / \`brew upgrade yt-dlp\`), or save the video yourself and run \`reelclaw analyze <file> --source-url ${url}\``,
    });
  }
  const file = findDownloaded(dir);
  if (!file) throw new ReelclawError(`yt-dlp finished but wrote no video for ${url}`, { hint: "is the link a video (not a photo carousel)?" });
  return file;
}

/** @param {string} dir */
function findDownloaded(dir) {
  if (!existsSync(dir)) return undefined;
  const hit = readdirSync(dir).find((f) => f.startsWith("source.") && VIDEO_EXT.test(f));
  return hit ? join(dir, hit) : undefined;
}

/**
 * Read the subset of yt-dlp's info JSON worth keeping (never the full dump:
 * it holds signed URLs and cookies-derived fields).
 * @param {string} dir
 * @returns {Promise<SourceMeta>}
 */
async function readInfo(dir) {
  const file = join(dir, "source.info.json");
  if (!existsSync(file)) return {};
  try {
    return pickMeta(JSON.parse(await readFile(file, "utf8")));
  } catch {
    return {};
  }
}

/**
 * @param {Record<string, any>} info yt-dlp info JSON
 * @returns {SourceMeta}
 */
export function pickMeta(info) {
  const num = (/** @type {unknown} */ v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const str = (/** @type {unknown} */ v, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
  const sound = [str(info.track), str(info.artist ?? info.creator)].filter(Boolean).join(" — ");
  /** @type {SourceMeta} */
  const meta = {
    platform: str(info.extractor_key ?? info.extractor),
    title: str(info.title),
    uploader: str(info.uploader ?? info.channel ?? info.uploader_id),
    uploadDate: str(info.upload_date),
    views: num(info.view_count),
    likes: num(info.like_count),
    comments: num(info.comment_count),
    shares: num(info.repost_count),
    description: str(info.description, 500),
    sound: sound || undefined,
  };
  return /** @type {SourceMeta} */ (Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined)));
}
