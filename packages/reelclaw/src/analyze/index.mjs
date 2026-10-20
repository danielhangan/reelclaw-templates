// @ts-check
/**
 * `reelclaw analyze` as a library: reference video → analysis/<slug>/ with
 * analysis.json, shot keyframes, a contact sheet and a filmstrip; optionally a
 * transcript, a beat grid, and a side-by-side comparison with a render.
 *
 * Deterministic and offline apart from the download (and the one-time Whisper
 * model download when transcribing).
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ReelclawError } from "../core/errors.mjs";
import { silentLogger } from "../core/log.mjs";
import { ffprobe } from "../core/media/probe.mjs";
import { ENGINE_ROOT } from "../core/project.mjs";
import { ANALYSIS_VERSION, aspectOf, blankFormat, readAnalysis } from "./analysis.mjs";
import { beatGrid, transcribe } from "./audio.mjs";
import { compareSheet, contactSheet, filmstrip, shotKeyframes } from "./frames.mjs";
import { DEFAULT_THRESHOLD, detectCuts, pacingOf, shotsFromCuts } from "./scenes.mjs";
import { resolveSource, slugFor } from "./source.mjs";

export { locateAnalysis, readAnalysis, blankFormat, aspectOf } from "./analysis.mjs";
export { slugFor, pickMeta, resolveSource } from "./source.mjs";
export { parseCutTimes, shotsFromCuts, pacingOf, bpmOf } from "./scenes.mjs";
export { stripStep, grid } from "./frames.mjs";

/** @typedef {import('./analysis.mjs').Analysis} Analysis */
/** @typedef {import('./source.mjs').Exec} Exec */

const VERSION = JSON.parse(readFileSync(join(ENGINE_ROOT, "package.json"), "utf8")).version;

/**
 * @typedef {object} AnalyzeOptions
 * @property {string} input        reference: file path or URL
 * @property {string} root         project root; output goes to <root>/analysis/<slug>/
 * @property {string} [cwd]        resolves relative file inputs (default: root)
 * @property {string} [out]        explicit output folder (overrides root/analysis/<slug>)
 * @property {string} [slug]
 * @property {string} [sourceUrl]  the link a local file was saved from (recorded, never fetched)
 * @property {number} [threshold]  scene-change threshold 0–1
 * @property {boolean} [transcribe]
 * @property {string} [model]      Whisper model for --transcribe
 * @property {boolean} [beats]
 * @property {boolean} [refresh]   re-download even if source.* exists
 * @property {Exec} [exec]         yt-dlp runner override (tests)
 * @property {import('../core/log.mjs').Logger} [log]
 */

/**
 * Analyze a reference video.
 * @param {AnalyzeOptions} o
 * @returns {Promise<{ dir: string, file: string, analysis: Analysis }>}
 */
export async function analyzeReference(o) {
  const log = o.log ?? silentLogger;
  const cwd = o.cwd ?? o.root;
  const slug = o.slug ?? slugFor(o.sourceUrl ?? o.input);
  const base = join(o.root, "analysis");
  const dir = o.out ?? join(base, slug);
  const threshold = o.threshold ?? DEFAULT_THRESHOLD;
  if (!(threshold > 0 && threshold < 1)) throw new ReelclawError(`--threshold must be between 0 and 1 (got ${threshold})`, { hint: "0.3 is a good default; try 0.2 for soft cuts, 0.45 for busy footage" });

  // reference videos and frames are copyrighted: keep the whole analysis/ folder out of git,
  // before anything (even a partial download) lands in it
  if (!o.out && !existsSync(join(base, ".gitignore"))) {
    await mkdir(base, { recursive: true });
    await writeFile(join(base, ".gitignore"), "# reelclaw analyze output: reference videos + frames. Never commit (copyright) — templates store the link only.\n*\n");
  }
  log.step(/^https?:/i.test(o.input) ? `fetching ${o.input}…` : `reading ${o.input}…`);
  const src = await resolveSource(o.input, { dir, cwd, refresh: o.refresh, exec: o.exec });
  await mkdir(dir, { recursive: true });

  const probe = await ffprobe(src.file);
  if (!probe.hasVideo) throw new ReelclawError(`${o.input} has no video stream`, { hint: "analyze needs a video (TikTok / Reels / Shorts link or an .mp4/.mov file)" });

  log.step("detecting cuts…");
  const shots = shotsFromCuts(await detectCuts(src.file, { threshold }), probe.duration);

  log.step(`extracting frames for ${shots.length} shot(s)…`);
  const keyframes = await shotKeyframes(src.file, shots, dir);
  await contactSheet(dir, shots.length, join(dir, "contact-sheet.png"));
  const step = await filmstrip(src.file, probe.duration, join(dir, "filmstrip.png"));

  const previous = await previousFormat(join(dir, "analysis.json"), shots.length);
  let transcript = null;
  if (o.transcribe && probe.hasAudio) {
    log.step("transcribing (first run downloads a Whisper model)…");
    transcript = await transcribe(src.file, dir, { model: o.model });
  }
  let beats = null;
  if (o.beats && probe.hasAudio) {
    log.step("detecting beats…");
    beats = await beatGrid(src.file, dir);
  }

  /** @type {Analysis} */
  const analysis = {
    version: ANALYSIS_VERSION,
    slug,
    createdWith: `reelclaw@${VERSION}`,
    source: { input: src.input, ...(src.url || o.sourceUrl ? { url: src.url ?? o.sourceUrl } : {}), file: src.file, ...src.meta },
    media: {
      duration: probe.duration,
      width: probe.width,
      height: probe.height,
      fps: probe.fps,
      hasAudio: probe.hasAudio,
      aspect: aspectOf(probe.width, probe.height),
    },
    detection: { threshold },
    shots,
    pacing: pacingOf(shots, probe.duration),
    images: { contactSheet: "contact-sheet.png", filmstrip: "filmstrip.png", filmstripStep: step, keyframes },
    transcript,
    beats,
    format: previous ?? blankFormat(shots.length),
  };
  const file = join(dir, "analysis.json");
  await writeFile(file, `${JSON.stringify(analysis, null, 2)}\n`);
  return { dir, file, analysis };
}

/**
 * Keep the agent's `format` notes across re-runs. Roles are per shot, so they
 * are reset (with a fresh array) when the shot count changed.
 * @param {string} file
 * @param {number} shots
 */
async function previousFormat(file, shots) {
  if (!existsSync(file)) return null;
  try {
    const prev = JSON.parse(await readFile(file, "utf8"));
    if (!prev?.format) return null;
    if (!Array.isArray(prev.format.roles) || prev.format.roles.length !== shots) prev.format.roles = blankFormat(shots).roles;
    return prev.format;
  } catch {
    return null;
  }
}

/**
 * @typedef {object} Comparison
 * @property {string} image        compare.png
 * @property {number} step
 * @property {{ reference: number, yours: number }} duration
 * @property {{ reference: number[], yours: number[] }} cuts   shot start times after 0
 * @property {string[]} notes      human-readable differences
 */

/**
 * Compare an analyzed candidate (usually your render) with a reference analysis.
 * @param {{ dir: string, analysis: Analysis }} candidate
 * @param {string} referenceFile analysis.json of the reference
 * @returns {Promise<Comparison>}
 */
export async function compareWith(candidate, referenceFile) {
  const ref = await readAnalysis(referenceFile);
  const yours = candidate.analysis;
  const duration = Math.min(ref.media.duration, yours.media.duration);
  const refVideo = ref.source.file;
  if (!refVideo || !existsSync(refVideo)) {
    throw new ReelclawError(`the reference video for ${referenceFile} is gone (${refVideo ?? "no source.file"})`, { hint: `re-run \`reelclaw analyze ${ref.source.url ?? ref.source.input}\`` });
  }
  const image = join(candidate.dir, "compare.png");
  const step = await compareSheet(refVideo, yours.source.file, duration, image);
  const refCuts = ref.shots.slice(1).map((s) => s.start);
  const yourCuts = yours.shots.slice(1).map((s) => s.start);
  return {
    image,
    step,
    duration: { reference: ref.media.duration, yours: yours.media.duration },
    cuts: { reference: refCuts, yours: yourCuts },
    notes: diffNotes(ref, yours),
  };
}

/**
 * Plain-language pacing differences (cuts within 0.15s count as matching).
 * @param {Analysis} ref
 * @param {Analysis} yours
 * @returns {string[]}
 */
export function diffNotes(ref, yours) {
  const notes = [];
  const dd = yours.media.duration - ref.media.duration;
  if (Math.abs(dd) > 0.25) notes.push(`duration ${yours.media.duration}s vs reference ${ref.media.duration}s (${dd > 0 ? "+" : ""}${dd.toFixed(2)}s)`);
  if (ref.shots.length !== yours.shots.length) notes.push(`${yours.shots.length} shot(s) vs reference ${ref.shots.length}`);
  const yourCuts = yours.shots.slice(1).map((s) => s.start);
  for (const s of ref.shots.slice(1)) {
    const near = yourCuts.reduce((best, t) => (Math.abs(t - s.start) < Math.abs(best - s.start) ? t : best), Infinity);
    if (!(Math.abs(near - s.start) <= 0.15)) notes.push(`reference cuts at ${s.start}s; ${Number.isFinite(near) ? `your nearest cut is ${near}s` : "you have no cut there"}`);
  }
  if (ref.media.hasAudio !== yours.media.hasAudio) notes.push(yours.media.hasAudio ? "yours has sound, the reference is silent" : "the reference has sound, yours is silent (fine if a trending sound is added in-app)");
  return notes;
}
