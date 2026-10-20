// @ts-check
/**
 * analysis.json — what `reelclaw analyze` measured about a reference video,
 * plus a `format` block the agent fills in after looking at the frames.
 * `reelclaw scaffold --from` reads both.
 *
 * Everything outside `format` is regenerated on every analyze run; `format`
 * is preserved, so re-running analyze (new threshold, --beats) never loses notes.
 */
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { ReelclawError } from "../core/errors.mjs";
import { CATEGORIES } from "../core/template.mjs";

/** @typedef {import('./scenes.mjs').Shot} Shot */
/** @typedef {import('./scenes.mjs').Pacing} Pacing */
/** @typedef {import('./source.mjs').SourceMeta} SourceMeta */
/** @typedef {import('./audio.mjs').Transcript} Transcript */
/** @typedef {import('./audio.mjs').BeatGrid} BeatGrid */

export const ANALYSIS_VERSION = 1;
export const TEXT_POSITIONS = /** @type {const} */ (["top", "center", "bottom"]);
export const CAPTION_LOOKS = /** @type {const} */ (["tiktok-outline", "tiktok-box", "tiktok-box-dark", "plain"]);

/**
 * On-screen text seen in the reference (read from the frames by the agent).
 * @typedef {object} TextOverlay
 * @property {string} text
 * @property {number} start
 * @property {number} end
 * @property {'top'|'center'|'bottom'} [position]
 * @property {string} [key]  camelCase input name for it (default: hook, caption2, caption3…)
 */

/**
 * The agent's reading of the format. Filled in by hand after `analyze`.
 * @typedef {object} FormatNotes
 * @property {string} [_fill]          instructions (ignored)
 * @property {string} [name]           template title, e.g. "POV app reveal"
 * @property {string} [description]    one or two sentences: the format and when it works
 * @property {string} [category]       one of CATEGORIES
 * @property {string[]} [tags]
 * @property {string} [structure]      beat-by-beat: "0–3s hook over selfie → hard cut → 3 steps of 1.5s"
 * @property {string} [whyItWorks]     the retention mechanics (curiosity gap, payoff, loop…)
 * @property {string} [captionStyle]   closest look: tiktok-outline | tiktok-box | tiktok-box-dark | plain
 * @property {(string | null)[]} [roles]  one per shot: the input that feeds it ("reaction", "demo"); same name = same footage
 * @property {TextOverlay[]} [texts]
 */

/**
 * @typedef {object} Analysis
 * @property {number} version
 * @property {string} slug
 * @property {string} createdWith      "reelclaw@x.y.z"
 * @property {{ input: string, url?: string, file: string } & SourceMeta} source
 * @property {{ duration: number, width: number, height: number, fps: number, hasAudio: boolean, aspect: string }} media
 * @property {{ threshold: number }} detection
 * @property {Shot[]} shots
 * @property {Pacing} pacing
 * @property {{ contactSheet: string, filmstrip: string, filmstripStep: number, keyframes: string[] }} images
 * @property {Transcript | null} transcript
 * @property {BeatGrid | null} beats
 * @property {FormatNotes} format
 */

/**
 * The blank `format` block analyze writes for the agent to fill.
 * @param {number} shots
 * @returns {FormatNotes}
 */
export function blankFormat(shots) {
  return {
    _fill:
      "Look at contact-sheet.png and filmstrip.png, then fill these fields (see .claude/skills/new-template/SKILL.md). roles: one entry per shot naming the footage input that feeds it (same name = same clip). texts: every on-screen text with its time window. Then run `reelclaw scaffold <id> --from <this file>`.",
    name: "",
    description: "",
    category: "",
    tags: [],
    structure: "",
    whyItWorks: "",
    captionStyle: "tiktok-outline",
    roles: Array.from({ length: shots }, () => null),
    texts: [],
  };
}

/** Aspect ratio label: "9:16", "16:9", "1:1", "4:5" or "W:H". */
export function aspectOf(/** @type {number} */ w, /** @type {number} */ h) {
  if (!w || !h) return "unknown";
  const r = w / h;
  const named = /** @type {[number, string][]} */ ([[9 / 16, "9:16"], [16 / 9, "16:9"], [1, "1:1"], [4 / 5, "4:5"], [3 / 4, "3:4"]]);
  const hit = named.find(([v]) => Math.abs(v - r) < 0.02);
  return hit ? hit[1] : `${w}:${h}`;
}

const blank = (/** @type {unknown} */ v) => (v === "" || v === null ? undefined : v);

const formatSchema = z.looseObject({
  name: z.preprocess(blank, z.string().optional()),
  description: z.preprocess(blank, z.string().optional()),
  category: z.preprocess(blank, z.enum(/** @type {[string, ...string[]]} */ ([...CATEGORIES]), { error: () => `format.category must be one of: ${CATEGORIES.join(", ")}` }).optional()),
  tags: z.array(z.string()).optional(),
  structure: z.preprocess(blank, z.string().optional()),
  whyItWorks: z.preprocess(blank, z.string().optional()),
  captionStyle: z.preprocess(blank, z.enum(CAPTION_LOOKS, { error: () => `format.captionStyle must be one of: ${CAPTION_LOOKS.join(", ")}` }).optional()),
  roles: z.array(z.string().nullable()).optional(),
  texts: z.array(z.object({
    text: z.string().min(1, "format.texts[].text is empty"),
    start: z.number().min(0),
    end: z.number().positive(),
    position: z.enum(TEXT_POSITIONS).optional(),
    key: z.string().regex(/^[a-z][a-zA-Z0-9]*$/, "format.texts[].key must be camelCase (e.g. hook, payoff)").optional(),
  }).refine((t) => t.end > t.start, "format.texts[]: end must be after start")).optional(),
});

const analysisSchema = z.looseObject({
  version: z.literal(ANALYSIS_VERSION, { error: () => `unsupported analysis version (this reelclaw reads version ${ANALYSIS_VERSION}) — re-run reelclaw analyze` }),
  slug: z.string(),
  source: z.looseObject({ input: z.string(), url: z.string().optional() }),
  media: z.looseObject({ duration: z.number().positive(), width: z.number(), height: z.number(), hasAudio: z.boolean() }),
  shots: z.array(z.object({ index: z.number(), start: z.number(), end: z.number(), duration: z.number() })).min(1),
  pacing: z.looseObject({ avgShot: z.number() }),
  beats: z.looseObject({ bpm: z.number().nullable() }).nullable().optional(),
  transcript: z.looseObject({ text: z.string() }).nullable().optional(),
  format: formatSchema.default({}),
});

/**
 * Find an analysis.json from a file, an analysis folder, or a slug under
 * `<root>/analysis/`.
 * @param {string} from
 * @param {{ root: string, cwd: string }} o
 */
export function locateAnalysis(from, { root, cwd }) {
  const candidates = [resolve(cwd, from), join(root, "analysis", from)];
  for (const c of candidates) {
    if (!existsSync(c)) continue;
    const file = statSync(c).isDirectory() ? join(c, "analysis.json") : c;
    if (existsSync(file)) return file;
  }
  throw new ReelclawError(`no analysis found at ${from}`, { hint: "run `reelclaw analyze <link-or-file>` first, then pass analysis/<slug> (or its analysis.json)" });
}

/**
 * Read and validate an analysis.json.
 * @param {string} file
 * @returns {Promise<Analysis>}
 */
export async function readAnalysis(file) {
  /** @type {unknown} */
  let raw;
  try {
    raw = JSON.parse(await readFile(file, "utf8"));
  } catch (cause) {
    throw new ReelclawError(`${file} is not valid JSON: ${/** @type {Error} */ (cause).message}`, { hint: "fix the syntax (a trailing comma?) or re-run reelclaw analyze", cause });
  }
  const parsed = analysisSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new ReelclawError(`${file} is invalid:\n  - ${issues.join("\n  - ")}`, { hint: "fix the fields above (the `format` block is yours to edit; the rest comes from reelclaw analyze)" });
  }
  const a = /** @type {Analysis} */ (/** @type {unknown} */ (parsed.data));
  const roles = a.format.roles;
  if (roles && roles.length !== a.shots.length && roles.some(Boolean)) {
    throw new ReelclawError(`${file}: format.roles has ${roles.length} entries but there are ${a.shots.length} shots`, { hint: "give one role per shot, in order (null = unassigned)" });
  }
  return a;
}
