// @ts-check
/**
 * Template inputs. One declaration per input drives everything else:
 * CLI flags (`--hook-position`), validation (zod), `--props` JSON, the README
 * flags table, the JSON schema in registry.json, and SKILL.md docs.
 *
 *   inputs: {
 *     reaction: input.video({ required: true, description: "Creator reaction clip" }),
 *     hook: input.text({ required: true, description: "Hook caption" }),
 *     hookPosition: input.enum(["top", "center", "bottom"], { default: "center", description: "…" }),
 *     musicVolume: input.number({ default: 1, min: 0, max: 1, description: "…" }),
 *   }
 *
 * Keys are camelCase; the CLI flag is the kebab-case key (`--hook-position`).
 */
import { z } from "zod";
import { ReelclawError } from "./errors.mjs";

/** @typedef {import('./types.mjs').MediaRef} MediaRef */
/** @typedef {import('./types.mjs').MediaKind} MediaKind */
/** @typedef {MediaKind|'text'|'number'|'boolean'|'enum'|'list'} InputKind */

/**
 * @template [T=unknown]
 * @typedef {object} InputSpec
 * @property {InputKind} kind
 * @property {string} description  one line, shown in --help, README and SKILL.md
 * @property {boolean} required
 * @property {unknown} [default]
 * @property {readonly string[]} [options]  enum values
 * @property {number} [min]
 * @property {number} [max]
 * @property {boolean} [integer]
 * @property {string} [unit]       e.g. "s", "px", "%" — docs only
 * @property {InputSpec} [item]    list item spec
 * @property {string} [example]    example value for docs (e.g. a hook line)
 * @property {z.ZodType} schema    validates one raw value (CLI string or JSON value)
 * @property {T} [__value]         phantom: the value type `build()` receives
 */

/**
 * Value type an input resolves to in `build({ inputs })`.
 * @template {InputSpec<any>} S
 * @typedef {S extends InputSpec<infer T> ? T : never} ValueOf
 */

/**
 * @template {Record<string, InputSpec<any>>} I
 * @typedef {{ [K in keyof I]: ValueOf<I[K]> }} InputValues
 */

/**
 * `T` when the input is required or has a default, else `T | undefined`.
 * @template O, T
 * @typedef {O extends { required: true } ? T : O extends { default: {} } ? T : T | undefined} Req
 */

/** @typedef {{ description: string, required?: boolean, example?: string }} BaseOptions */

const MEDIA_HINT = {
  video: "a local video path or URL (direct .mp4/.mov link, or a TikTok/IG/YouTube page link)",
  image: "a local image path or URL (.png/.jpg/.webp)",
  audio: "a local audio/video path or URL (.mp3/.m4a/.wav, or a page link — audio is extracted)",
  visual: "a local video/image path or URL (.mp4/.mov/.png/.jpg, or a TikTok/IG/YouTube page link)",
};

/**
 * @template T
 * @param {Omit<InputSpec<T>, 'required'> & { required?: boolean }} spec
 * @returns {InputSpec<T>}
 */
function make(spec) {
  if (!spec.description || !spec.description.trim()) {
    throw new ReelclawError(`input.${spec.kind}() needs a description`, {
      hint: "Every input documents itself: input.text({ description: \"Hook caption over the reaction\" })",
    });
  }
  const required = Boolean(spec.required) && spec.default === undefined;
  return Object.freeze({ ...spec, required });
}

/**
 * @param {MediaKind} kind
 * @param {BaseOptions} o
 */
function media(kind, o) {
  return make({
    kind,
    ...o,
    schema: z.string({ error: `expected ${MEDIA_HINT[kind]}` }).trim().min(1, `expected ${MEDIA_HINT[kind]}`),
  });
}

/** Strings from the CLI become numbers; JSON numbers pass through. */
const toNumber = (/** @type {unknown} */ v) =>
  typeof v === "string" && v.trim() !== "" ? Number(v) : v;

const TRUE = new Set(["true", "1", "yes", "on"]);
const FALSE = new Set(["false", "0", "no", "off"]);
const toBoolean = (/** @type {unknown} */ v) => {
  if (typeof v !== "string") return v;
  const s = v.trim().toLowerCase();
  return TRUE.has(s) ? true : FALSE.has(s) ? false : v;
};

export const input = {
  /**
   * A video file or link. `build()` receives a probed {@link MediaRef}.
   * @template {BaseOptions} O
   * @param {O} o
   * @returns {InputSpec<Req<O, MediaRef>>}
   */
  video: (o) => media("video", o),

  /**
   * A still image. `build()` receives a probed {@link MediaRef}.
   * @template {BaseOptions} O
   * @param {O} o
   * @returns {InputSpec<Req<O, MediaRef>>}
   */
  image: (o) => media("image", o),

  /**
   * An audio track (music, voiceover). Video files are accepted (their sound is used).
   * @template {BaseOptions} O
   * @param {O} o
   * @returns {InputSpec<Req<O, MediaRef>>}
   */
  audio: (o) => media("audio", o),

  /**
   * A video **or** a still image (b-roll, list items). `build()` receives a
   * probed {@link MediaRef}; branch on `ref.isImage` (or use `visual()` from "reelclaw").
   * @template {BaseOptions} O
   * @param {O} o
   * @returns {InputSpec<Req<O, MediaRef>>}
   */
  visual: (o) => media("visual", o),

  /**
   * Free text (captions, hooks).
   * @template {BaseOptions & { default?: string, maxLength?: number }} O
   * @param {O} o
   * @returns {InputSpec<Req<O, string>>}
   */
  text(o) {
    let schema = z.preprocess((v) => (typeof v === "number" ? String(v) : v), z.string());
    if (o.maxLength) {
      schema = z.preprocess(
        (v) => (typeof v === "number" ? String(v) : v),
        z.string().max(o.maxLength, `at most ${o.maxLength} characters`),
      );
    }
    return make({ kind: "text", ...o, schema });
  },

  /**
   * A number (seconds, volumes, sizes). CLI strings are coerced.
   * @template {BaseOptions & { default?: number, min?: number, max?: number, integer?: boolean, unit?: string }} O
   * @param {O} o
   * @returns {InputSpec<Req<O, number>>}
   */
  number(o) {
    let n = z.number({ error: "expected a number" });
    if (o.integer) n = n.int("expected a whole number");
    if (o.min !== undefined) n = n.min(o.min, `must be ≥ ${o.min}`);
    if (o.max !== undefined) n = n.max(o.max, `must be ≤ ${o.max}`);
    return make({ kind: "number", ...o, schema: z.preprocess(toNumber, n) });
  },

  /**
   * An on/off switch. Always defined (defaults to false). CLI: `--flag`, `--no-flag`.
   * @param {Omit<BaseOptions, 'required'> & { default?: boolean }} o
   * @returns {InputSpec<boolean>}
   */
  boolean(o) {
    return make({
      kind: "boolean",
      ...o,
      default: o.default ?? false,
      schema: z.preprocess(toBoolean, z.boolean({ error: "expected true or false" })),
    });
  },

  /**
   * One of a fixed set of strings.
   * @template {string} const V
   * @template {BaseOptions & { default?: NoInfer<V> }} O
   * @param {readonly V[]} options
   * @param {O} o
   * @returns {InputSpec<Req<O, V>>}
   */
  enum(options, o) {
    if (!options.length) throw new ReelclawError("input.enum() needs at least one option");
    const schema = z.enum(/** @type {[V, ...V[]]} */ ([...options]), {
      error: (iss) => `expected one of ${options.join(" | ")} (got ${JSON.stringify(iss.input)})`,
    });
    return make({ kind: "enum", ...o, options: Object.freeze([...options]), schema });
  },

  /**
   * A repeatable input: `--step "a" --step "b"` on the CLI, an array in JSON.
   * Always defined (defaults to []). Items may be media (each one is staged).
   * @template T
   * @param {InputSpec<T>} item
   * @param {Omit<BaseOptions, 'required'> & { min?: number, max?: number }} o
   * @returns {InputSpec<Array<Exclude<T, undefined>>>}
   */
  list(item, o) {
    let arr = z.array(item.schema);
    if (o.min !== undefined) arr = arr.min(o.min, `needs at least ${o.min} item(s)`);
    if (o.max !== undefined) arr = arr.max(o.max, `takes at most ${o.max} item(s)`);
    const schema = z.preprocess((v) => (v === undefined || Array.isArray(v) ? v : [v]), arr);
    return make({ kind: "list", ...o, required: (o.min ?? 0) > 0, default: (o.min ?? 0) > 0 ? undefined : [], item, schema });
  },
};

/** @param {InputKind} kind */
export const isMediaKind = (kind) => kind === "video" || kind === "image" || kind === "audio" || kind === "visual";

/** @param {string} key camelCase input key */
export const flagName = (key) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** @param {string} flag kebab-case flag (no dashes) */
export const keyName = (flag) => flag.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

/**
 * Build the zod object schema for a template's inputs.
 * @param {Record<string, InputSpec<any>>} inputs
 */
export function inputsSchema(inputs) {
  /** @type {Record<string, z.ZodType>} */
  const shape = {};
  for (const [key, spec] of Object.entries(inputs)) {
    let field = spec.schema;
    if (spec.default !== undefined) field = field.default(/** @type {any} */ (spec.default));
    else if (!spec.required) field = field.optional();
    shape[key] = field;
  }
  return z.strictObject(shape);
}

/**
 * Normalise raw values (CLI flags or --props JSON): accepts camelCase or kebab-case
 * keys, drops undefined. Unknown keys are reported with the closest match.
 * @param {Record<string, InputSpec<any>>} inputs
 * @param {Record<string, unknown>} raw
 * @returns {Record<string, unknown>}
 */
export function normalizeValues(inputs, raw) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined) continue;
    const key = k.includes("-") ? keyName(k) : k;
    if (!(key in inputs)) {
      const guess = closest(key, Object.keys(inputs));
      throw new ReelclawError(`unknown input "${k}"`, {
        hint: guess
          ? `did you mean --${flagName(guess)}? (inputs: ${Object.keys(inputs).map(flagName).join(", ")})`
          : `this template's inputs are: ${Object.keys(inputs).map(flagName).join(", ")}`,
      });
    }
    out[key] = v;
  }
  return out;
}

/**
 * Validate raw values against the template's inputs. Returns parsed values with
 * defaults applied; media inputs are still raw strings at this point (staging
 * turns them into MediaRefs). Throws one ReelclawError listing every problem.
 * @param {Record<string, InputSpec<any>>} inputs
 * @param {Record<string, unknown>} raw
 * @param {{ templateId?: string }} [o] names the template in the help hint
 * @returns {Record<string, unknown>}
 */
export function parseValues(inputs, raw, o = {}) {
  const values = normalizeValues(inputs, raw);
  /** @type {string[]} */
  const problems = [];
  const missing = new Set();
  for (const [key, spec] of Object.entries(inputs)) {
    if (spec.required && (values[key] === undefined || values[key] === "")) {
      missing.add(key);
      problems.push(`--${flagName(key)} is required — ${spec.description}`);
    }
  }
  const result = inputsSchema(inputs).safeParse(values);
  if (result.success && !problems.length) return /** @type {Record<string, unknown>} */ (result.data);
  for (const issue of result.error?.issues ?? []) {
    const key = String(issue.path[0] ?? "");
    if (missing.has(key)) continue;
    const where = key ? `--${flagName(key)}` : "inputs";
    const item = issue.path.length > 1 ? ` (item ${Number(issue.path[1]) + 1})` : "";
    problems.push(`${where}${item}: ${issue.message}`);
  }
  throw new ReelclawError(`invalid inputs:\n  - ${problems.join("\n  - ")}`, {
    hint: `run \`reelclaw make ${o.templateId ?? "<template>"} --help\` to see every flag`,
  });
}

/**
 * Options for node:util parseArgs, derived from inputs.
 * @param {Record<string, InputSpec<any>>} inputs
 * @returns {Record<string, { type: 'string'|'boolean', multiple?: boolean }>}
 */
export function cliOptions(inputs) {
  /** @type {Record<string, { type: 'string'|'boolean', multiple?: boolean }>} */
  const opts = {};
  for (const [key, spec] of Object.entries(inputs)) {
    opts[flagName(key)] =
      spec.kind === "boolean" ? { type: "boolean" }
      : spec.kind === "list" ? { type: "string", multiple: true }
      : { type: "string" };
  }
  return opts;
}

/**
 * The value placeholder shown after a flag in docs: `<file|url>`, `top|center|bottom`, `"text"`.
 * @param {InputSpec} spec
 * @returns {string}
 */
export function valueHint(spec) {
  switch (spec.kind) {
    case "video": case "image": case "audio": case "visual": return "<file|url>";
    case "text": return '"text"';
    case "enum": return (spec.options ?? []).join("|");
    case "boolean": return "";
    case "number": {
      // the unit rides along in the hint: <0.5..15s>, <26..120px>, <secs>
      if (spec.min !== undefined && spec.max !== undefined) return `<${spec.min}..${spec.max}${spec.unit ?? ""}>`;
      return `<${spec.unit === "s" ? "secs" : spec.unit ?? "n"}>`;
    }
    case "list": return spec.item ? valueHint(spec.item) : "<value>";
  }
}

/**
 * Markdown flags table for a template's inputs (README / `reelclaw docs`).
 * @param {Record<string, InputSpec<any>>} inputs
 */
export function flagsTable(inputs) {
  const rows = Object.entries(inputs).map(([key, spec]) => {
    const hint = valueHint(spec);
    const flag = `\`--${flagName(key)}${hint ? ` ${hint}` : ""}\``.replace(/\|/g, "\\|");
    const def = spec.required ? "**required**"
      : spec.default === undefined || (Array.isArray(spec.default) && !spec.default.length) ? "—"
      : `\`${typeof spec.default === "string" ? spec.default : JSON.stringify(spec.default)}\``;
    const repeat = spec.kind === "list" ? " (repeatable)" : "";
    return `| ${flag} | ${def} | ${spec.description.replace(/\|/g, "\\|")}${repeat} |`;
  });
  return ["| Flag | Default | Meaning |", "| --- | --- | --- |", ...rows].join("\n");
}

/**
 * JSON Schema (draft 2020-12) of a template's `--props` file.
 * @param {Record<string, InputSpec<any>>} inputs
 */
export function inputsJsonSchema(inputs) {
  /** @param {InputSpec} spec @returns {Record<string, unknown>} */
  const one = (spec) => {
    const base = { description: spec.description };
    switch (spec.kind) {
      case "video": case "image": case "audio": case "visual":
        return { ...base, type: "string", format: "uri-reference", "x-media": spec.kind };
      case "text": return { ...base, type: "string" };
      case "boolean": return { ...base, type: "boolean" };
      case "enum": return { ...base, type: "string", enum: spec.options };
      case "number":
        return { ...base, type: spec.integer ? "integer" : "number", minimum: spec.min, maximum: spec.max };
      case "list": return { ...base, type: "array", items: spec.item ? one(spec.item) : {} };
    }
  };
  /** @type {Record<string, unknown>} */
  const properties = {};
  for (const [key, spec] of Object.entries(inputs)) {
    properties[key] = JSON.parse(JSON.stringify({ ...one(spec), default: spec.default }));
  }
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    required: Object.entries(inputs).filter(([, s]) => s.required).map(([k]) => k),
    properties,
  };
}

/**
 * Closest candidate by edit distance (for "did you mean").
 * @param {string} word
 * @param {string[]} candidates
 * @returns {string | undefined}
 */
export function closest(word, candidates) {
  let best;
  let bestScore = Infinity;
  for (const c of candidates) {
    const d = editDistance(word.toLowerCase(), c.toLowerCase());
    if (d < bestScore) { best = c; bestScore = d; }
  }
  return bestScore <= Math.max(2, Math.floor(word.length / 3)) ? best : undefined;
}

/** @param {string} a @param {string} b */
function editDistance(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}
