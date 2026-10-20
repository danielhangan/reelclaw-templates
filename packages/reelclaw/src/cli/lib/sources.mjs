// @ts-check
/**
 * Where `reelclaw add` gets templates from:
 *
 *   github  registry.json + each template file over raw.githubusercontent.com at
 *           a ref (default main) — the normal path, no npm release needed for new templates
 *   local   a reelclaw-templates checkout (--src, or the checkout this engine runs from)
 *
 * Both expose the same two calls: catalog() and fetch(entry, dest).
 */
import { existsSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { ReelclawError } from "../../core/errors.mjs";
import { DEFAULT_REF, REGISTRY_FILE, REPO, buildRegistry } from "./registry.mjs";

/** @typedef {import('./registry.mjs').RegistryEntry} RegistryEntry */

/**
 * @typedef {object} TemplateSource
 * @property {string} label    shown to the user ("github:owner/repo#main", a path)
 * @property {string} from     recorded in the project's package.json per template
 * @property {() => Promise<{ entries: RegistryEntry[], warnings: string[] }>} catalog
 * @property {(entry: RegistryEntry, dest: string) => Promise<void>} fetch  write the template's files into dest/
 */

/** Overridable for tests and mirrors: REELCLAW_RAW_BASE=http://localhost:8080 */
const rawBase = () => (process.env.REELCLAW_RAW_BASE ?? "https://raw.githubusercontent.com").replace(/\/$/, "");

/**
 * @param {{ repo?: string, ref?: string }} [o]
 * @returns {TemplateSource}
 */
export function githubSource({ repo = REPO, ref = DEFAULT_REF } = {}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new ReelclawError(`--repo must look like owner/name (got "${repo}")`);
  const base = `${rawBase()}/${repo}/${ref}`;
  return {
    label: `github:${repo}#${ref}`,
    from: `github:${repo}#${ref}`,
    async catalog() {
      const data = /** @type {any} */ (JSON.parse(await download(`${base}/${REGISTRY_FILE}`, { repo, ref }).then((b) => b.toString("utf8"))));
      if (!data || !Array.isArray(data.templates)) {
        throw new ReelclawError(`${repo}@${ref}/${REGISTRY_FILE} is not a reelclaw registry`, { hint: "check --repo / --ref" });
      }
      return { entries: data.templates, warnings: [] };
    },
    async fetch(entry, dest) {
      checkEntry(entry);
      await Promise.all(
        entry.files.map(async (file) => {
          const body = await download(`${base}/${entry.path}/${file}`, { repo, ref });
          await mkdir(dirname(join(dest, file)), { recursive: true });
          await writeFile(join(dest, file), body);
        }),
      );
    },
  };
}

/**
 * @param {string} dir  a reelclaw-templates checkout (contains templates/)
 * @param {{ label?: string }} [o]
 * @returns {TemplateSource}
 */
export function localSource(dir, { label } = {}) {
  const root = resolve(dir);
  if (!existsSync(join(root, "templates"))) {
    throw new ReelclawError(`${dir} is not a reelclaw-templates checkout (no templates/ folder)`, {
      hint: "git clone https://github.com/danielhangan/reelclaw-templates and pass --src <that folder>",
    });
  }
  return {
    label: label ?? root,
    from: `local:${root}`,
    async catalog() {
      const { registry, errors } = await buildRegistry(root);
      return { entries: registry.templates, warnings: errors.map((e) => `skipping ${e}`) };
    },
    async fetch(entry, dest) {
      checkEntry(entry);
      await Promise.all(
        entry.files.map(async (file) => {
          await mkdir(dirname(join(dest, file)), { recursive: true });
          await copyFile(join(root, entry.path, file), join(dest, file));
        }),
      );
    },
  };
}

const SAFE_ID = /^[a-z0-9][a-z0-9-]*$/;
const SAFE_FILE = /^(?!.*(?:^|\/)\.)[\w@+-][\w.@+-]*(?:\/[\w@+-][\w.@+-]*)*$/;

/**
 * Registry entries come from the network: refuse ids/paths that could write
 * outside templates/<id>/ (absolute paths, "..", dotfiles).
 * @param {RegistryEntry} entry
 */
export function checkEntry(entry) {
  const bad = !SAFE_ID.test(String(entry.id)) || entry.path !== `templates/${entry.id}` || !Array.isArray(entry.files) ||
    entry.files.some((f) => typeof f !== "string" || !SAFE_FILE.test(f));
  if (bad) throw new ReelclawError(`registry entry "${entry.id}" has unsafe paths — refusing to install it`, { hint: "report this at https://github.com/danielhangan/reelclaw-templates/issues" });
}

/**
 * GET a URL with a timeout and errors that say what to do.
 * @param {string} url
 * @param {{ repo: string, ref: string }} ctx
 * @returns {Promise<Buffer>}
 */
async function download(url, { repo, ref }) {
  /** @type {Response} */
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { "user-agent": "reelclaw" } });
  } catch (cause) {
    throw new ReelclawError(`could not reach ${new URL(url).host} (${/** @type {Error} */ (cause).message})`, {
      hint: "check your internet connection, or install from a local clone: git clone https://github.com/danielhangan/reelclaw-templates && npx reelclaw add <template> --src reelclaw-templates",
      cause,
    });
  }
  if (res.status === 404) {
    throw new ReelclawError(`not found: ${url}`, {
      hint: url.endsWith(REGISTRY_FILE)
        ? `${repo} has no ${REGISTRY_FILE} at "${ref}" — check --ref / --repo`
        : `the registry lists a file that is missing at "${ref}" — retry in a minute (GitHub's cache), or pass --ref <commit>`,
    });
  }
  if (!res.ok) throw new ReelclawError(`download failed (HTTP ${res.status}): ${url}`, { hint: "retry in a minute" });
  return Buffer.from(await res.arrayBuffer());
}
