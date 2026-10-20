// @ts-check
/**
 * Cut-outs: a person (or any subject) with the background removed, as a
 * transparent VP9 WebM, plus the subject's bounding box so templates can size
 * and place the *person* rather than the source frame.
 *
 *   async prepare({ inputs, ...ctx }) {
 *     return { cut: await cutout(ctx, inputs.reaction, { quality: "balanced" }) };
 *   },
 *   build({ inputs, prepared: { cut } }) {
 *     const box = placeCutout(cut.subject, { widthPct: 40, anchor: "bottom-left" });
 *     return timeline([video(inputs.video), video(cut.video, { box, crop: cut.subject })]);
 *   }
 *
 * Background removal runs HyperFrames' local matting model (u2net, ~4 fps on
 * Apple Silicon, downloaded once). Both the cut-out and the bounding box are
 * cached by the source's content hash, so re-runs with a new hook are instant.
 * A source that already has alpha (a transparent .webm/.mov) skips matting.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { ReelclawError } from "../errors.mjs";
import { requireTool, run } from "../exec.mjs";
import { CANVAS, place } from "../geometry.mjs";
import { projectPaths } from "../project.mjs";

/** @typedef {import('../types.mjs').MediaRef} MediaRef */
/** @typedef {import('../types.mjs').MediaKind} MediaKind */
/** @typedef {import('../geometry.mjs').Box} Box */
/** @typedef {import('../geometry.mjs').Anchor} Anchor */
/** @typedef {import('../log.mjs').Logger} Logger */

/** Matting encode presets (HyperFrames `remove-background --quality`). */
export const CUTOUT_QUALITIES = /** @type {const} */ (["fast", "balanced", "best"]);
/** @typedef {typeof CUTOUT_QUALITIES[number]} CutoutQuality */

/**
 * The parts of a template's prepare() context a cut-out needs.
 * @typedef {object} CutoutContext
 * @property {string} root
 * @property {{ derive: (o: { from: MediaRef, key: string, ext: string, kind: MediaKind, produce: (inPath: string, outPath: string) => Promise<unknown> }) => Promise<MediaRef> }} media
 * @property {Logger} log
 * @property {(message: string) => void} warn
 */

/**
 * @typedef {object} Cutout
 * @property {MediaRef} video  transparent VP9 WebM, no audio track (play the source's sound separately)
 * @property {Box} subject     where the subject is in the source frame (source px): the union of
 *                             its alpha bounding box over every frame, or the whole frame
 * @property {boolean} matted  false when the source already had alpha
 */

/**
 * Remove a clip's background (cached) and find the subject in it.
 * @param {CutoutContext} ctx    pass the template's prepare() context
 * @param {MediaRef} source      a video input
 * @param {{ quality?: CutoutQuality, crop?: boolean }} [o]
 *   `crop: false` keeps the whole source frame as `subject` (the person floats in transparent padding)
 * @returns {Promise<Cutout>}
 */
export async function cutout(ctx, source, { quality = "balanced", crop = true } = {}) {
  const matted = !source.hasAlpha;
  const video = matted ? await matte(ctx, source, quality) : await asAlphaWebm(ctx, source);
  const full = { x: 0, y: 0, w: video.width, h: video.height };
  if (!crop) return { video, subject: full, matted };

  const box = await alphaBounds(ctx.root, video);
  if (!box) {
    ctx.warn(`${source.label}: no subject found in the cut-out (the matting model saw no person?) — using the whole frame`);
    return { video, subject: full, matted };
  }
  return { video, subject: box, matted };
}

/**
 * Run HyperFrames' background removal once per (source, quality).
 * @param {CutoutContext} ctx
 * @param {MediaRef} source
 * @param {CutoutQuality} quality
 */
function matte(ctx, source, quality) {
  return ctx.media.derive({
    from: source,
    key: `cutout-${quality}`,
    ext: ".webm",
    kind: "video",
    produce: async (input, output) => {
      ctx.log.step(`removing the background from ${source.label} (${source.duration}s; first run only, ~4 fps — cached after)`);
      const { removeBackground } = await import("hyperframes/api");
      let lastQuarter = 0;
      try {
        const r = await removeBackground({
          input,
          output,
          quality,
          onProgress: (e) => {
            if (e.kind !== "frame" || !e.total) return;
            const quarter = Math.floor((4 * e.index) / e.total);
            if (quarter > lastQuarter && quarter < 4) {
              lastQuarter = quarter;
              ctx.log.step(`  background removal ${quarter * 25}% (${e.index}/${e.total} frames)`);
            }
          },
        });
        ctx.log.step(`  background removed: ${r.framesProcessed} frames in ${r.durationSeconds.toFixed(1)}s (${r.provider})`);
      } catch (cause) {
        throw new ReelclawError(`background removal failed for ${source.label}: ${/** @type {Error} */ (cause).message}`, {
          hint: "run `npx hyperframes remove-background --info` to check the model and execution providers; the model (~170 MB) downloads on first use, so the first run needs network",
          cause,
        });
      }
    },
  });
}

/**
 * Sources that already carry alpha: WebM plays as-is; anything else (ProRes
 * 4444 .mov, …) is converted once, because browsers only composite VP9 alpha.
 * @param {CutoutContext} ctx
 * @param {MediaRef} source
 */
async function asAlphaWebm(ctx, source) {
  if (extname(source.src).toLowerCase() === ".webm") return { ...source, hasAudio: false };
  requireTool("ffmpeg", "convert the transparent clip to WebM");
  return ctx.media.derive({
    from: source,
    key: "alpha-webm",
    ext: ".webm",
    kind: "video",
    produce: async (input, output) => {
      ctx.log.step(`converting ${source.label} to a transparent WebM (once)`);
      const r = await run("ffmpeg", ["-y", "-v", "error", "-i", input, "-an", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-b:v", "0", "-crf", "24", "-row-mt", "1", output]);
      if (r.code !== 0) throw new ReelclawError(`could not convert ${source.label} to a transparent WebM`, { hint: r.stderr.trim().split("\n").slice(-2).join(" ") });
    },
  });
}

/**
 * The subject's bounding box in a transparent video: the union of the alpha
 * bounding box over every frame (so the subject never clips as it moves),
 * in source px. Cached per file in .reelclaw/cache/alpha-bounds/. Null when
 * the clip is fully transparent or has no alpha.
 * @param {string} root  reel project root
 * @param {MediaRef} ref  a staged transparent video
 * @returns {Promise<Box | null>}
 */
export async function alphaBounds(root, ref) {
  const cacheFile = join(projectPaths(root).cache, "alpha-bounds", `${ref.src.replace(/^assets\//, "")}.json`);
  if (existsSync(cacheFile)) return JSON.parse(await readFile(cacheFile, "utf8")).box;

  requireTool("ffmpeg", "find the subject in the cut-out");
  // ffmpeg's native VP9 decoder drops the alpha plane; libvpx-vp9 keeps it
  const decoder = extname(ref.path).toLowerCase() === ".webm" ? ["-c:v", "libvpx-vp9"] : [];
  const r = await run("ffmpeg", ["-v", "info", "-nostats", ...decoder, "-i", ref.path, "-an", "-vf", "alphaextract,cropdetect=limit=0.02:round=2:reset=0", "-f", "null", "-"]);
  if (r.code !== 0) {
    throw new ReelclawError(`could not read the alpha channel of ${ref.label}`, {
      hint: `ffmpeg needs libvpx-vp9 to decode transparent WebM (brew install ffmpeg ships it). ffmpeg says: ${r.stderr.trim().split("\n").slice(-1)[0]}`,
    });
  }
  const box = parseCropdetect(r.stderr, ref.width, ref.height);
  await mkdir(join(cacheFile, ".."), { recursive: true });
  await writeFile(`${cacheFile}.tmp`, JSON.stringify({ box }));
  await rename(`${cacheFile}.tmp`, cacheFile);
  return box;
}

/**
 * Parse the final `crop=w:h:x:y` that ffmpeg's cropdetect printed (with
 * reset=0 it is the union over all frames). Pure; unit-tested.
 * @param {string} stderr
 * @param {number} [width]  source size, to clamp the box inside the frame
 * @param {number} [height]
 * @returns {Box | null} null when nothing non-transparent was found
 */
export function parseCropdetect(stderr, width = Infinity, height = Infinity) {
  const all = [...stderr.matchAll(/crop=(-?\d+):(-?\d+):(-?\d+):(-?\d+)/g)];
  const last = all.at(-1);
  if (!last) return null;
  const [w, h, x, y] = last.slice(1).map(Number);
  if (w <= 0 || h <= 0 || x < 0 || y < 0) return null;
  return { x, y, w: Math.min(w, width - x), h: Math.min(h, height - y) };
}

/**
 * Where a subject goes on the canvas: scaled so it is `widthPct` of the frame
 * wide, at an anchor inset by `margin`; `x`/`y` (canvas px, top-left) override
 * the anchor per axis.
 * @param {Box} subject  subject box in source px (only its aspect ratio matters)
 * @param {{ widthPct: number, anchor?: Anchor, margin?: number, x?: number, y?: number }} o
 * @returns {Box}
 */
export function placeCutout(subject, { widthPct, anchor = "bottom-left", margin = 0, x, y }) {
  const w = (CANVAS.width * widthPct) / 100;
  const box = place(w, (w * subject.h) / subject.w, anchor, margin);
  return { ...box, x: x ?? box.x, y: y ?? box.y };
}

/**
 * The GSAP transform that makes a clip resting at `rest` appear at `start`
 * (uniform scale about the box centre, GSAP's default origin). Use it as the
 * `from` of a motion whose `to` is `{ x: 0, y: 0, scale: 1 }` — e.g. a cut-out
 * dragged from the centre into its corner.
 * @param {Box} rest
 * @param {Box} start  same aspect ratio as `rest` (e.g. both from placeCutout)
 * @returns {{ x: number, y: number, scale: number }}
 */
export function dragFrom(rest, start) {
  const scale = start.w / rest.w;
  const dx = start.x + start.w / 2 - (rest.x + rest.w / 2);
  const dy = start.y + start.h / 2 - (rest.y + rest.h / 2);
  return { x: Math.round(dx), y: Math.round(dy), scale: Math.round(scale * 1000) / 1000 };
}
