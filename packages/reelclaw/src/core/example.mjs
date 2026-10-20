// @ts-check
/**
 * Make a template's example (templates/<id>/example.json, or any props file)
 * in a throwaway reel project. Shared by `reelclaw preview`, the CI smoke
 * render and the integration tests, so they all exercise the real pipeline.
 */
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ReelclawError } from "./errors.mjs";
import { isMediaKind } from "./inputs.mjs";
import { loadTemplate } from "./loader.mjs";
import { silentLogger } from "./log.mjs";
import { makeReel, readProps } from "./make.mjs";
import { REPO_ROOT } from "./project.mjs";

/** @typedef {import('./log.mjs').Logger} Logger */
/** @typedef {import('./make.mjs').MakeResult} MakeResult */
/** @typedef {import('./render.mjs').Quality} Quality */
/** @typedef {import('./template.mjs').Template<any, any>} AnyTemplate */

/**
 * @typedef {object} ExampleOptions
 * @property {string} template      id or folder path
 * @property {string} root          project used to locate the template (cwd or --project)
 * @property {string} [props]       inputs file (default templates/<id>/example.json)
 * @property {string} [base]        directory relative media paths resolve against
 *                                  (default: the repo root for example.json, cwd for --props)
 * @property {string} [project]     reel project to make into (default: a fresh temp dir)
 * @property {string} [name]        reel name (default "example")
 * @property {boolean} [render]
 * @property {Quality} [quality]    default "draft"
 * @property {number|'auto'} [workers]  default 2 (renders run next to other work)
 * @property {Logger} [log]         default silent
 */

/**
 * @typedef {object} ExampleRun
 * @property {AnyTemplate} template
 * @property {string} dir           the template's folder
 * @property {string} project       the reel project it was made in
 * @property {MakeResult} made
 * @property {string} html          compiled composition source
 * @property {() => Promise<void>} cleanup  delete the project (no-op for a caller-provided one)
 */

/**
 * @param {ExampleOptions} o
 * @returns {Promise<ExampleRun>}
 */
export async function makeExample(o) {
  const { template, dir } = await loadTemplate(o.template, o.root);
  const propsFile = o.props ? resolve(o.props) : join(dir, "example.json");
  if (!existsSync(propsFile)) {
    throw new ReelclawError(`${template.id} has no example.json`, { hint: `add templates/${template.id}/example.json or pass --props <file>` });
  }
  const props = await readProps(propsFile);
  const base = o.base ?? (o.props ? process.cwd() : REPO_ROOT ?? o.root);
  const missing = missingMedia(template, props.inputs, base);
  if (missing.length) {
    throw new ReelclawError(`example media not found: ${missing.join(", ")}`, {
      hint: REPO_ROOT && base === REPO_ROOT ? "generate the synthetic fixtures: npm run fixtures" : "pass your own inputs with --props <file>",
    });
  }

  const owned = !o.project;
  const project = o.project ?? (await mkdtemp(join(tmpdir(), `reelclaw-${template.id}-`)));
  try {
    const made = await makeReel({
      root: project,
      template,
      values: props.inputs,
      name: o.name ?? "example",
      render: o.render,
      quality: o.quality ?? "draft",
      workers: o.workers ?? 2,
      cwd: base,
      log: o.log ?? silentLogger,
    });
    return {
      template,
      dir,
      project,
      made,
      html: await readFile(made.html, "utf8"),
      cleanup: () => (owned ? rm(project, { recursive: true, force: true }) : Promise.resolve()),
    };
  } catch (err) {
    if (owned) await rm(project, { recursive: true, force: true });
    throw err;
  }
}

/**
 * Local media paths in `values` that do not exist under `base` (URLs are skipped).
 * @param {AnyTemplate} template
 * @param {Record<string, unknown>} values
 * @param {string} base
 * @returns {string[]}
 */
export function missingMedia(template, values, base) {
  const out = [];
  for (const [key, spec] of Object.entries(template.inputs)) {
    const v = values[key] ?? values[key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)];
    const isList = spec.kind === "list" && spec.item && isMediaKind(spec.item.kind);
    const items = isList ? (Array.isArray(v) ? v : v ? [v] : []) : isMediaKind(spec.kind) && v ? [v] : [];
    for (const item of items) {
      const s = String(item);
      if (!/^https?:/i.test(s) && !existsSync(resolve(base, s))) out.push(s);
    }
  }
  return out;
}
