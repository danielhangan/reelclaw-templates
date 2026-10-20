// @ts-check
/**
 * defineTemplate — the only API a template author needs to start from.
 * See docs/TEMPLATE_API.md for the full contract and templates/reaction-demo
 * for the reference implementation.
 */
import { z } from "zod";
import { ReelclawError } from "./errors.mjs";
import { CANVAS, SAFE_BAND } from "./geometry.mjs";

/** @typedef {import('./inputs.mjs').InputSpec<any>} AnyInputSpec */
/** @typedef {import('./timeline.mjs').Timeline} Timeline */
/** @typedef {import('./types.mjs').MediaRef} MediaRef */
/** @typedef {import('./types.mjs').MediaKind} MediaKind */
/** @typedef {import('./log.mjs').Logger} Logger */
/**
 * @template {Record<string, AnyInputSpec>} I
 * @typedef {import('./inputs.mjs').InputValues<I>} InputValues
 */

/** Registry categories. Add one here (and to docs/TEMPLATE_API.md) when a new format family appears. */
export const CATEGORIES = Object.freeze([
  "reaction", "tutorial", "split-screen", "greenscreen", "talking-head", "slideshow",
  "listicle", "meme", "text-story", "before-after", "product-demo", "ugc-ad", "trend", "skit", "other",
]);

/**
 * What `build()` receives. Pure and synchronous: same inputs → same timeline.
 * @template {Record<string, AnyInputSpec>} I
 * @template P
 * @typedef {object} BuildContext
 * @property {InputValues<I>} inputs  validated values; media inputs are probed MediaRefs
 * @property {P} prepared             whatever `prepare()` returned (or {})
 * @property {typeof CANVAS} canvas
 * @property {typeof SAFE_BAND} safe  the caption-safe band
 * @property {(message: string) => void} warn  report a non-fatal problem to the user
 */

/**
 * What `prepare()` receives: the async, side-effecting step before `build()`
 * (background removal, transcription, derived proxies). Results must be cached
 * (use `media.derive`) so re-runs with a new hook are instant.
 * @template {Record<string, AnyInputSpec>} I
 * @typedef {object} PrepareContext
 * @property {InputValues<I>} inputs
 * @property {string} root  reel project root
 * @property {string} cwd   where the command runs: resolve user-given file paths (e.g. a transcript) against it
 * @property {{
 *   derive: (o: { from: MediaRef, key: string, ext: string, kind: MediaKind, produce: (inPath: string, outPath: string) => Promise<unknown> }) => Promise<MediaRef>,
 *   stage: (value: string, kind: MediaKind, label: string) => Promise<MediaRef>,
 * }} media
 * @property {(args: string[]) => Promise<void>} hyperframes  run the pinned HyperFrames CLI in the project (throws on failure)
 * @property {Logger} log
 * @property {(message: string) => void} warn
 */

/**
 * @template {Record<string, AnyInputSpec>} I
 * @template [P={}]
 * @typedef {object} TemplateDefinition
 * @property {string} id           kebab-case, equals the folder name (templates/<id>/) and the SKILL.md name
 * @property {string} name         human title ("Reaction → Demo")
 * @property {string} description  one or two sentences: the format and when it works
 * @property {string} category     one of CATEGORIES
 * @property {string[]} [tags]     kebab-case search tags
 * @property {{ url?: string, notes?: string }} [source]  the viral reference this recreates
 * @property {I} inputs
 * @property {(ctx: PrepareContext<I>) => Promise<P>} [prepare]
 * @property {(ctx: BuildContext<I, P>) => Timeline} build
 */

/**
 * @template {Record<string, AnyInputSpec>} I
 * @template [P={}]
 * @typedef {Readonly<TemplateDefinition<I, P>> & { readonly tags: string[], readonly [TEMPLATE]: true }} Template
 */

/** Brand that marks objects created by defineTemplate. */
export const TEMPLATE = Symbol.for("reelclaw.template");

const manifestSchema = z.object({
  id: z.string().max(64).regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, "id must be kebab-case (e.g. reaction-demo) — it is also the Agent Skills name"),
  name: z.string().min(2),
  description: z.string().min(20, "description should explain the format in a sentence or two").max(400),
  category: z.enum(/** @type {[string, ...string[]]} */ ([...CATEGORIES]), {
    error: () => `category must be one of: ${CATEGORIES.join(", ")}`,
  }),
  tags: z.array(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "tags are kebab-case")).default([]),
  source: z.object({ url: z.string().url().optional(), notes: z.string().optional() }).optional(),
  inputs: z.record(z.string(), z.any()).refine((r) => Object.keys(r).length > 0, "a template needs at least one input"),
  build: z.custom((v) => typeof v === "function", "build must be a function: build({ inputs }) => timeline([...])"),
  prepare: z.custom((v) => typeof v === "function", "prepare must be an async function").optional(),
});

/** Inputs every `make` run accepts on top of the template's own; templates must not reuse them. */
export const RESERVED_FLAGS = Object.freeze(["name", "props", "render", "draft", "quality", "workers", "project", "help", "json", "open"]);

/**
 * Declare a template. Validates the manifest eagerly so a broken template fails
 * at load time with a precise message, not halfway through a render.
 *
 * @template {Record<string, AnyInputSpec>} I
 * @template [P={}]
 * @param {TemplateDefinition<I, P>} def
 * @returns {Template<I, P>}
 */
export function defineTemplate(def) {
  const parsed = manifestSchema.safeParse(def);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "template"}: ${i.message}`);
    throw new ReelclawError(`template "${def?.id ?? "?"}" is invalid:\n  - ${issues.join("\n  - ")}`);
  }
  for (const [key, spec] of Object.entries(def.inputs)) {
    if (!/^[a-z][a-zA-Z0-9]*$/.test(key)) throw new ReelclawError(`template "${def.id}": input key "${key}" must be camelCase`);
    if (RESERVED_FLAGS.includes(key)) {
      throw new ReelclawError(`template "${def.id}": input "${key}" clashes with the built-in --${key} flag — rename it`);
    }
    if (!spec || typeof spec !== "object" || !("schema" in spec)) {
      throw new ReelclawError(`template "${def.id}": input "${key}" must be created with input.*()`);
    }
    if (spec.default !== undefined) {
      const ok = spec.schema.safeParse(spec.default);
      if (!ok.success) throw new ReelclawError(`template "${def.id}": default of "${key}" is invalid: ${ok.error.issues[0]?.message}`);
    }
  }
  return Object.freeze({ ...def, tags: def.tags ?? [], [TEMPLATE]: /** @type {const} */ (true) });
}

/**
 * @param {unknown} value
 * @returns {value is Template<Record<string, AnyInputSpec>, any>}
 */
export function isTemplate(value) {
  return typeof value === "object" && value !== null && /** @type {any} */ (value)[TEMPLATE] === true;
}
