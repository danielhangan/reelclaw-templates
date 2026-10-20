// @ts-check
/**
 * Template discovery and loading.
 *
 * Lookup order for `reelclaw make <id>`:
 *   1. <project>/templates/<id>/template.mjs   (installed with `reelclaw add`, editable)
 *   2. <repo>/templates/<id>/template.mjs      (when the engine runs from a git checkout)
 * A path to a template folder also works: `reelclaw make ./my-template`.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import nodeModule from "node:module";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ReelclawError } from "./errors.mjs";
import { closest } from "./inputs.mjs";
import { ENGINE_ROOT, REPO_ROOT, projectPaths } from "./project.mjs";
import { isTemplate } from "./template.mjs";

/** @typedef {import('./template.mjs').Template<any, any>} AnyTemplate */
/** @typedef {{ id: string, dir: string, file: string, source: 'project'|'repo'|'path' }} TemplateLocation */

let hooksRegistered = false;

/**
 * Make `import "reelclaw"` in template files resolve to this engine, wherever
 * the template lives (reel project without node_modules, repo, npx cache), so
 * templates and engine always share one module instance.
 */
function registerEngineAlias() {
  if (hooksRegistered) return;
  hooksRegistered = true;
  const src = join(ENGINE_ROOT, "src");
  /** @type {Record<string, string>} */
  const aliases = {
    reelclaw: pathToFileURL(join(src, "index.mjs")).href,
    "reelclaw/core": pathToFileURL(join(src, "core", "index.mjs")).href,
  };
  // Node ≥ 22.15 / 23.5: synchronous in-thread hooks; module.register() is deprecated (DEP0205)
  const mod = /** @type {any} */ (nodeModule);
  if (typeof mod.registerHooks === "function") {
    mod.registerHooks({
      resolve: (/** @type {string} */ specifier, /** @type {object} */ context, /** @type {Function} */ next) =>
        aliases[specifier] ? { url: aliases[specifier], shortCircuit: true } : next(specifier, context),
    });
  } else {
    nodeModule.register(pathToFileURL(join(src, "core", "resolve-hooks.mjs")), { data: { aliases } });
  }
}

/**
 * Directories that may contain templates, most specific first.
 * @param {string} projectRoot
 * @returns {{ dir: string, source: 'project'|'repo' }[]}
 */
export function templateRoots(projectRoot) {
  /** @type {{ dir: string, source: 'project'|'repo' }[]} */
  const roots = [{ dir: projectPaths(projectRoot).templates, source: "project" }];
  if (REPO_ROOT) {
    const repoDir = join(REPO_ROOT, "templates");
    if (resolve(repoDir) !== resolve(roots[0].dir)) roots.push({ dir: repoDir, source: "repo" });
  }
  return roots.filter((r) => existsSync(r.dir));
}

/**
 * Every template reachable from a project (first location wins per id).
 * @param {string} projectRoot
 * @returns {TemplateLocation[]}
 */
export function findTemplates(projectRoot) {
  /** @type {Map<string, TemplateLocation>} */
  const found = new Map();
  for (const { dir, source } of templateRoots(projectRoot)) {
    for (const id of readdirSync(dir).sort()) {
      const file = join(dir, id, "template.mjs");
      if (!found.has(id) && existsSync(file)) found.set(id, { id, dir: join(dir, id), file, source });
    }
  }
  return [...found.values()];
}

/**
 * Locate a template by id or folder path.
 * @param {string} idOrPath
 * @param {string} projectRoot
 * @returns {TemplateLocation}
 */
export function locateTemplate(idOrPath, projectRoot) {
  const asPath = resolve(projectRoot, idOrPath);
  if ((idOrPath.includes("/") || idOrPath.includes("\\") || idOrPath.startsWith(".")) && existsSync(asPath) && statSync(asPath).isDirectory()) {
    const file = join(asPath, "template.mjs");
    if (!existsSync(file)) throw new ReelclawError(`${idOrPath} has no template.mjs`);
    return { id: basename(asPath), dir: asPath, file, source: "path" };
  }
  const all = findTemplates(projectRoot);
  const id = normalizeId(idOrPath);
  const hit = all.find((t) => t.id === id);
  if (hit) return hit;
  const guess = closest(idOrPath, all.map((t) => t.id));
  throw new ReelclawError(`template "${idOrPath}" is not installed here`, {
    hint: guess
      ? `did you mean "${guess}"? (or install it: npx reelclaw@latest add ${idOrPath})`
      : `install it: npx reelclaw@latest add ${idOrPath}   ·   see what's available: reelclaw list`,
  });
}

/**
 * Template ids are kebab-case; v1 ids were snake_case (reaction_demo), so accept those too.
 * @param {string} id
 */
export const normalizeId = (id) => id.trim().toLowerCase().replace(/_/g, "-");

/**
 * Import and check a template module.
 * @param {string} idOrPath
 * @param {string} projectRoot
 * @returns {Promise<{ template: AnyTemplate } & TemplateLocation>}
 */
export async function loadTemplate(idOrPath, projectRoot) {
  const loc = locateTemplate(idOrPath, projectRoot);
  registerEngineAlias();
  /** @type {any} */
  let mod;
  try {
    mod = await import(pathToFileURL(loc.file).href);
  } catch (cause) {
    if (cause instanceof ReelclawError) throw cause;
    throw new ReelclawError(`could not load ${loc.file}: ${/** @type {Error} */ (cause).message}`, {
      hint: "templates may only import \"reelclaw\", node: built-ins and files inside their own folder",
      cause,
    });
  }
  const template = mod.default;
  if (!isTemplate(template)) {
    throw new ReelclawError(`${loc.file} must \`export default defineTemplate({...})\``);
  }
  if (template.id !== loc.id && loc.source !== "path") {
    throw new ReelclawError(`template id "${template.id}" does not match its folder templates/${loc.id}/`, { hint: `rename the folder or set id: "${loc.id}"` });
  }
  return { template, ...loc };
}
