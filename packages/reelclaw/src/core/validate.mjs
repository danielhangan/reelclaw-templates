// @ts-check
/**
 * Template validation (CI + `reelclaw validate`): manifest, required files,
 * SKILL.md frontmatter, example.json, and a full make (stage → build → compile)
 * into a throwaway project — optionally a draft render too.
 */
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compile } from "./compile.mjs";
import { ReelclawError } from "./errors.mjs";
import { CANVAS, SAFE_BAND } from "./geometry.mjs";
import { isMediaKind, parseValues } from "./inputs.mjs";
import { missingMedia } from "./example.mjs";
import { loadTemplate } from "./loader.mjs";
import { silentLogger } from "./log.mjs";
import { makeReel, readProps } from "./make.mjs";

/** @typedef {import('./loader.mjs').TemplateLocation} TemplateLocation */
/** @typedef {import('./types.mjs').MediaRef} MediaRef */
/** @typedef {import('./types.mjs').MediaKind} MediaKind */

/**
 * @typedef {object} ValidationResult
 * @property {string} id
 * @property {string[]} errors
 * @property {string[]} warnings
 * @property {number} [duration]  compiled reel length
 * @property {string} [output]    rendered MP4 (with render: true)
 */

/**
 * @param {TemplateLocation} loc
 * @param {{ root: string, base: string, render?: boolean, keep?: boolean }} o
 *   root = project root used to load the template; base = directory example.json
 *   media paths are relative to (the repo root, for fixtures/…)
 * @returns {Promise<ValidationResult>}
 */
export async function validateTemplate(loc, { root, base, render = false, keep = false }) {
  /** @type {ValidationResult} */
  const res = { id: loc.id, errors: [], warnings: [] };
  const err = (/** @type {unknown} */ e) => res.errors.push(e instanceof ReelclawError ? `${e.message}${e.hint ? ` (${e.hint})` : ""}` : String(/** @type {Error} */ (e)?.stack ?? e));

  /** @type {import('./template.mjs').Template<any, any>} */
  let template;
  try {
    ({ template } = await loadTemplate(loc.dir, root));
  } catch (e) {
    err(e);
    return res;
  }
  if (template.id !== loc.id) res.errors.push(`id "${template.id}" does not match folder "${loc.id}"`);

  // files every template ships
  for (const f of ["SKILL.md", "README.md", "example.json"]) {
    if (!existsSync(join(loc.dir, f))) res.errors.push(`missing ${f}`);
  }
  if (existsSync(join(loc.dir, "SKILL.md"))) {
    const fm = parseFrontmatter(await readFile(join(loc.dir, "SKILL.md"), "utf8"));
    if (!fm) res.errors.push("SKILL.md needs YAML frontmatter with name and description");
    else {
      if (fm.name !== template.id) res.errors.push(`SKILL.md name "${fm.name ?? ""}" must equal the template id "${template.id}"`);
      if (!fm.description || fm.description.length < 40) res.errors.push("SKILL.md description must say what the template makes and when to use it (≥ 40 chars)");
      if (fm.description && fm.description.length > 1024) res.errors.push("SKILL.md description must be ≤ 1024 characters (Agent Skills limit)");
    }
  }
  const todos = await todoMarkers(loc.dir);
  if (todos.length) res.errors.push(`unfinished scaffold: TODO left in ${todos.join(", ")} — finish or delete each one`);
  if (!existsSync(join(loc.dir, "example.json"))) return res;

  // example inputs: validate, then make (or compile with stand-in media when fixtures are missing)
  let example;
  try {
    example = await readProps(join(loc.dir, "example.json"));
    parseValues(template.inputs, example.inputs);
  } catch (e) {
    err(e);
    return res;
  }
  const missing = missingMedia(template, example.inputs, base);
  if (missing.length) {
    res.warnings.push(`example media not found (${missing.join(", ")}) — compiled with stand-in media; run \`npm run fixtures\` for a real check`);
    try {
      res.duration = compileWithStandIns(template, example.inputs);
    } catch (e) {
      err(e);
    }
    return res;
  }

  const project = await mkdtemp(join(tmpdir(), `reelclaw-validate-${loc.id}-`));
  try {
    const made = await makeReel({
      root: project,
      template,
      values: example.inputs,
      name: "example",
      render,
      quality: "draft",
      workers: 1,
      cwd: base,
      log: silentLogger,
    });
    res.duration = made.duration;
    res.output = made.output;
    res.warnings.push(...made.warnings);
  } catch (e) {
    err(e);
  } finally {
    if (!keep) await rm(project, { recursive: true, force: true });
  }
  return res;
}

/**
 * Files in a template folder that still contain `TODO` markers from `reelclaw scaffold`.
 * @param {string} dir
 * @returns {Promise<string[]>} e.g. ["template.mjs:12", "SKILL.md:40"]
 */
async function todoMarkers(dir) {
  const out = [];
  for (const f of (await readdir(dir)).filter((n) => /\.(mjs|md|json)$/.test(n)).sort()) {
    const line = (await readFile(join(dir, f), "utf8")).split("\n").findIndex((l) => /\bTODO\b/.test(l));
    if (line >= 0) out.push(`${f}:${line + 1}`);
  }
  return out;
}

/**
 * Build + compile with plausible fake MediaRefs (no files, no ffprobe).
 * @param {import('./template.mjs').Template<any, any>} template
 * @param {Record<string, unknown>} raw
 */
function compileWithStandIns(template, raw) {
  const values = parseValues(template.inputs, raw);
  /** @type {Record<string, any>} */
  const inputs = { ...values };
  for (const [key, spec] of Object.entries(template.inputs)) {
    if (values[key] === undefined) continue;
    if (isMediaKind(spec.kind)) inputs[key] = standIn(/** @type {MediaKind} */ (spec.kind), key);
    else if (spec.kind === "list" && spec.item && isMediaKind(spec.item.kind)) {
      inputs[key] = /** @type {unknown[]} */ (values[key]).map((_, i) => standIn(/** @type {MediaKind} */ (spec.item?.kind), `${key}-${i}`));
    }
  }
  if (template.prepare) throw new ReelclawError("template has prepare(); generate fixtures (npm run fixtures) to validate it");
  const tl = template.build({ inputs, prepared: {}, canvas: CANVAS, safe: SAFE_BAND, warn: () => {} });
  return compile(tl, { name: "example" }).timeline.duration;
}

/**
 * @param {MediaKind} kind
 * @param {string} label
 * @returns {MediaRef}
 */
export function standIn(kind, label) {
  const base = { kind, label, src: `assets/${label}.stand-in`, path: `/dev/null/${label}`, hasAlpha: false, fps: 30 };
  if (kind === "image") return { ...base, duration: 0, width: 1080, height: 1350, hasVideo: false, hasAudio: false, isImage: true, fps: 0 };
  if (kind === "audio") return { ...base, duration: 30, width: 0, height: 0, hasVideo: false, hasAudio: true, isImage: false, fps: 0 };
  return { ...base, duration: 8, width: 1080, height: 1920, hasVideo: true, hasAudio: true, isImage: false };
}

/**
 * Minimal YAML frontmatter reader for SKILL.md (single-line `key: value` pairs).
 * @param {string} text
 * @returns {Record<string, string> | null}
 */
export function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}
