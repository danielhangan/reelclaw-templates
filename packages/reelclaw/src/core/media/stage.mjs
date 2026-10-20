// @ts-check
/**
 * Staging: every media input is copied into the project's assets/ under a
 * content-addressed name — `assets/<slug>-<sha256:12><ext>`.
 *
 * Same bytes → same file (re-runs and batches reuse it); different bytes → a
 * different name, always. Two inputs called `IMG_0001.mov` from different
 * folders can never overwrite or alias each other (the v1 collision bug).
 *
 * Per-entry cache files under .reelclaw/cache/ make repeated runs instant and
 * are safe for concurrent processes (atomic rename, no shared JSON index).
 */
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { constants, copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { ReelclawError } from "../errors.mjs";
import { projectPaths } from "../project.mjs";
import { classifySource, downloadDirect, downloadPage } from "./download.mjs";
import { ffprobe } from "./probe.mjs";

/** @typedef {import('../types.mjs').MediaRef} MediaRef */
/** @typedef {import('../types.mjs').MediaKind} MediaKind */
/** @typedef {import('../types.mjs').ProbeInfo} ProbeInfo */
/** @typedef {import('../log.mjs').Logger} Logger */

/**
 * Stage one media input into `<root>/assets/` and probe it.
 * @param {object} o
 * @param {string} o.root     reel project root
 * @param {string} o.value    local path (relative to `cwd`) or URL
 * @param {MediaKind} o.kind  what the template expects
 * @param {string} o.label    input name, used in messages ("reaction")
 * @param {string} [o.cwd]    base for relative paths (default process.cwd())
 * @param {Logger} [o.log]
 * @returns {Promise<MediaRef>}
 */
export async function stageMedia({ root, value, kind, label, cwd = process.cwd(), log }) {
  const paths = projectPaths(root);
  const source = classifySource(value);
  /** @type {string} */
  let file;
  /** @type {string | undefined} */
  let tmpDir;

  if (source === "local") {
    // relative to where the command runs; saved props (assets/…) resolve against the project
    file = resolve(cwd, value);
    if (!existsSync(file) && existsSync(resolve(root, value))) file = resolve(root, value);
    if (!existsSync(file)) {
      throw new ReelclawError(`${label}: file not found: ${value}`, { hint: `check the path (resolved to ${file}), or pass a URL` });
    }
  } else {
    const cached = await readJson(join(paths.cache, "url", `${sha1(value)}.json`));
    if (cached?.name && existsSync(join(paths.assets, cached.name))) {
      return finish(root, cached.name, kind, label);
    }
    tmpDir = join(paths.cache, "tmp", randomUUID());
    log?.step(`downloading ${label}: ${value}`);
    file = source === "direct" ? await downloadDirect(value, tmpDir) : await downloadPage(value, tmpDir, kind);
  }

  try {
    const hash = await contentHash(file, paths.cache);
    const name = assetName(basename(file, extname(file)) === "download" && source !== "local" ? label : basename(file), extname(file), hash);
    const target = join(paths.assets, name);
    if (!existsSync(target)) {
      await mkdir(paths.assets, { recursive: true });
      const partial = `${target}.${randomUUID()}.partial`;
      await copyFile(file, partial, constants.COPYFILE_FICLONE);
      await rename(partial, target);
    }
    if (source !== "local") await writeJsonAtomic(join(paths.cache, "url", `${sha1(value)}.json`), { url: value, name });
    return await finish(root, name, kind, label);
  } finally {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Create (once) a file derived from a staged asset — a background-removed
 * cut-out, a transcoded proxy, an extracted audio track — cached by the source's
 * content hash plus `key`. `produce` writes `outPath`; it is skipped when the
 * derived file already exists.
 *
 *   const cut = await derive({ root, from: inputs.reaction, key: "cutout-balanced", ext: ".webm", kind: "video",
 *     produce: (inPath, outPath) => removeBackground({ input: inPath, output: outPath }) });
 *
 * @param {object} o
 * @param {string} o.root
 * @param {MediaRef} o.from
 * @param {string} o.key      what the derivation is, incl. options that change the output ("cutout-best")
 * @param {string} o.ext      extension of the derived file (".webm")
 * @param {MediaKind} o.kind
 * @param {(inPath: string, outPath: string) => Promise<unknown>} o.produce
 * @returns {Promise<MediaRef>}
 */
export async function deriveMedia({ root, from, key, ext, kind, produce }) {
  const paths = projectPaths(root);
  if (!/^[a-z0-9-]+$/.test(key)) throw new ReelclawError(`derive key "${key}" must be kebab-case`);
  const stem = basename(from.src, extname(from.src));
  const name = `${stem}.${key}${ext.startsWith(".") ? ext : `.${ext}`}`;
  const target = join(paths.assets, name);
  if (!existsSync(target)) {
    const partial = join(paths.cache, "tmp", `${randomUUID()}${ext}`);
    await mkdir(join(paths.cache, "tmp"), { recursive: true });
    try {
      await produce(from.path, partial);
      if (!existsSync(partial)) throw new ReelclawError(`deriving ${key} from ${from.label} produced no file`);
      await rename(partial, target);
    } finally {
      await rm(partial, { force: true });
    }
  }
  return finish(root, name, kind, `${from.label} (${key})`);
}

/**
 * Probe a staged asset (cached) and check it is the kind the template expects.
 * @param {string} root
 * @param {string} name file name inside assets/
 * @param {MediaKind} kind
 * @param {string} label
 * @returns {Promise<MediaRef>}
 */
async function finish(root, name, kind, label) {
  const paths = projectPaths(root);
  const path = join(paths.assets, name);
  const info = await probeCached(path, join(paths.cache, "probe", `${name}.json`));
  checkKind(info, kind, label);
  return { ...info, kind, label, src: `assets/${name}`, path };
}

/**
 * @param {ProbeInfo} info
 * @param {MediaKind} kind
 * @param {string} label
 */
export function checkKind(info, kind, label) {
  if (kind === "video" && !info.hasVideo) {
    throw new ReelclawError(`${label}: expected a video but got ${info.isImage ? "an image" : "a file with no video stream"}`, {
      hint: info.isImage ? "this template wants moving footage here; convert the still to a clip or pick another file" : "pass a video file (mp4/mov/webm)",
    });
  }
  if (kind === "image" && !info.isImage && !(info.hasVideo && info.duration === 0)) {
    throw new ReelclawError(`${label}: expected an image (png/jpg/webp)`);
  }
  if (kind === "visual" && !info.hasVideo && !info.isImage) {
    throw new ReelclawError(`${label}: expected a video or an image`, { hint: "pass a video (mp4/mov/webm) or an image (png/jpg/webp)" });
  }
  if (kind === "audio" && !info.hasAudio) {
    throw new ReelclawError(`${label}: expected audio but the file has no sound`, { hint: "pass an mp3/m4a/wav or a video with an audio track" });
  }
}

/**
 * @param {string} path
 * @param {string} cacheFile
 * @returns {Promise<ProbeInfo>}
 */
async function probeCached(path, cacheFile) {
  const cached = await readJson(cacheFile);
  if (cached) return cached;
  const info = await ffprobe(path);
  await writeJsonAtomic(cacheFile, info);
  return info;
}

/**
 * Human-readable, collision-free asset file name.
 * @param {string} original original file name (or label)
 * @param {string} ext
 * @param {string} hash hex content hash
 */
export function assetName(original, ext, hash) {
  const stem = basename(original, extname(original))
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "media";
  return `${stem}-${hash.slice(0, 12)}${ext.toLowerCase()}`;
}

/**
 * sha256 of a file's bytes, memoised by (path, size, mtime) so unchanged
 * sources are not re-read on every run.
 * @param {string} file
 * @param {string} cacheDir
 */
async function contentHash(file, cacheDir) {
  const s = await stat(file);
  const memo = join(cacheDir, "hash", `${sha1(`${resolve(file)}|${s.size}|${s.mtimeMs}`)}.txt`);
  try {
    return (await readFile(memo, "utf8")).trim();
  } catch {
    const h = createHash("sha256");
    for await (const chunk of createReadStream(file)) h.update(chunk);
    const hex = h.digest("hex");
    await writeAtomic(memo, hex);
    return hex;
  }
}

/** @param {string} s */
const sha1 = (s) => createHash("sha1").update(s).digest("hex");

/** @param {string} file */
async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

/** @param {string} file @param {unknown} data */
async function writeJsonAtomic(file, data) {
  await writeAtomic(file, JSON.stringify(data));
}

/** @param {string} file @param {string} data */
async function writeAtomic(file, data) {
  await mkdir(join(file, ".."), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}
