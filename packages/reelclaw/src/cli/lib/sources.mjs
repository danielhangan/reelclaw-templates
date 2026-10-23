// @ts-check
/**
 * Where `reelclaw add` gets templates from:
 *
 *   github  registry.json + each template file over raw.githubusercontent.com at
 *           a ref (default main) — the normal path, no npm release needed for new templates
 *   local   a reelclaw-templates checkout (--src, or the checkout this engine runs from)
 *
 * Both expose the same calls: catalog(), fetch(entry, dest) and playbook(dest)
 * (the shared reelclaw-playbook skill, from the same repo and ref).
 */
import { existsSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { ReelclawError } from "../../core/errors.mjs";
import { DEFAULT_REF, PLAYBOOK_PATH, REGISTRY_FILE, REPO, buildRegistry, templateFiles } from "./registry.mjs";

/** @typedef {import('./registry.mjs').RegistryEntry} RegistryEntry */
/** @typedef {import('./registry.mjs').PlaybookEntry} PlaybookEntry */

/**
 * @typedef {object} TemplateSource
 * @property {string} label    shown to the user ("github:owner/repo#main", a path)
 * @property {string} from     recorded in the project's package.json per template
 * @property {() => Promise<{ entries: RegistryEntry[], warnings: string[] }>} catalog
 * @property {(entry: RegistryEntry, dest: string) => Promise<void>} fetch  write the template's files into dest/
 * @property {(dest: string) => Promise<boolean>} playbook  write the playbook skill's files into dest/; false when the source has none
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
  /** @type {any} */
  let registry;
  const loadRegistry = async () => {
    if (registry) return registry;
    const data = /** @type {any} */ (JSON.parse(await download(`${base}/${REGISTRY_FILE}`, { repo, ref }).then((b) => b.toString("utf8"))));
    if (!data || !Array.isArray(data.templates)) {
      throw new ReelclawError(`${repo}@${ref}/${REGISTRY_FILE} is not a reelclaw registry`, { hint: "check --repo / --ref" });
    }
    return (registry = data);
  };
  return {
    label: `github:${repo}#${ref}`,
    from: `github:${repo}#${ref}`,
    async catalog() {
      return { entries: (await loadRegistry()).templates, warnings: [] };
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
    async playbook(dest) {
      const entry = /** @type {PlaybookEntry | undefined} */ ((await loadRegistry()).playbook);
      if (!entry) return false; // a registry from before the playbook existed
      checkPlaybook(entry);
      await Promise.all(
        entry.files.map(async (file) => {
          const body = await download(`${base}/${entry.path}/${file}`, { repo, ref });
          await mkdir(dirname(join(dest, file)), { recursive: true });
          await writeFile(join(dest, file), body);
        }),
      );
      return true;
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
    async playbook(dest) {
      return copyPlaybook(join(root, PLAYBOOK_PATH), dest);
    },
  };
}

/**
 * Copy a playbook folder (SKILL.md + references/) into dest/. False when `dir`
 * has no SKILL.md.
 * @param {string} dir
 * @param {string} dest
 */
export async function copyPlaybook(dir, dest) {
  if (!existsSync(join(dir, "SKILL.md"))) return false;
  for (const file of templateFiles(dir)) {
    await mkdir(dirname(join(dest, file)), { recursive: true });
    await copyFile(join(dir, file), join(dest, file));
  }
  return true;
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
 * Same guard for the playbook entry: it must live in playbook/ and only name
 * plain relative files, SKILL.md among them.
 * @param {PlaybookEntry} entry
 */
export function checkPlaybook(entry) {
  const bad = entry.path !== PLAYBOOK_PATH || !Array.isArray(entry.files) || !entry.files.includes("SKILL.md") ||
    entry.files.some((f) => typeof f !== "string" || !SAFE_FILE.test(f));
  if (bad) throw new ReelclawError("the registry's playbook entry has unsafe paths — refusing to install it", { hint: "report this at https://github.com/danielhangan/reelclaw-templates/issues" });
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
