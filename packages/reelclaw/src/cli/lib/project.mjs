// @ts-check
/**
 * Reel-project scaffolding for `reelclaw add`: template folders, package.json
 * (the "reelclaw" engine dependency + install records), .gitignore, AGENTS.md /
 * CLAUDE.md and the per-agent skill copies. Every step is idempotent.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ReelclawError } from "../../core/errors.mjs";
import { SAFE_BAND } from "../../core/geometry.mjs";
import { ENGINE_ROOT, REPO_ROOT } from "../../core/project.mjs";
import { parseFrontmatter } from "../../core/validate.mjs";
import { DEFAULT_REF, ENGINE_VERSION, REPO, templateFiles } from "./registry.mjs";

/** @typedef {import('./registry.mjs').RegistryEntry} RegistryEntry */
/** @typedef {import('./sources.mjs').TemplateSource} TemplateSource */
/** @typedef {{ from: string, hash: string }} InstallRecord  what `add` installed, to detect local edits later */
/** @typedef {'added' | 'updated' | 'unchanged' | 'kept'} InstallStatus */

const SCAFFOLD = join(dirname(fileURLToPath(import.meta.url)), "scaffold");
export const DANSUGC_MCP = "https://dansugc.com/mcp";
/** Agent skill folders: Claude Code reads .claude/skills, Codex (and other Agent Skills tools) .agents/skills. */
export const SKILL_DIRS = [join(".claude", "skills"), join(".agents", "skills")];

/* ───────────────────────── engine dependency ───────────────────────── */

/**
 * The "reelclaw" dependency spec matching the engine that is running `add`:
 * a checkout links itself (file:), a GitHub snapshot (`npx github:…`) points at
 * GitHub, an npm install pins a caret range.
 * @param {{ src?: string, repo?: string, ref?: string }} [o]
 */
export function engineSpec({ src, repo = REPO, ref } = {}) {
  if (src) {
    const pkg = join(resolve(src), "packages", "reelclaw");
    if (existsSync(join(pkg, "package.json"))) return `file:${pkg}`;
  }
  if (REPO_ROOT && existsSync(join(REPO_ROOT, ".git"))) return `file:${ENGINE_ROOT}`;
  if (REPO_ROOT) return `github:${repo}${ref && ref !== DEFAULT_REF ? `#${ref}` : ""}`;
  return `^${ENGINE_VERSION}`;
}

/**
 * Which spec a project should end up with. Local links (file:/link:) are a
 * deliberate dev setup and stay; semver ranges never go backwards (an old
 * cached `npx reelclaw` must not downgrade a project); otherwise the running
 * engine wins, so `npx reelclaw@latest add` also upgrades the engine.
 * @param {string | undefined} existing
 * @param {string} wanted
 */
export function engineDependency(existing, wanted) {
  if (!existing || existing === wanted) return wanted;
  if (/^(file|link):/.test(existing)) return existing;
  const a = minVersion(existing);
  const b = minVersion(wanted);
  if (a && b && compareVersions(a, b) > 0) return existing;
  return wanted;
}

/** "^0.2.1" / "~0.2.1" / "0.2.1" / ">=0.2.1" → [0,2,1]; anything else → null. */
const minVersion = (/** @type {string} */ spec) => {
  const m = /^(?:\^|~|>=)?\s*v?(\d+)\.(\d+)\.(\d+)$/.exec(spec.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

/** @param {number[]} a @param {number[]} b */
const compareVersions = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/* ───────────────────────── templates ───────────────────────── */

/**
 * Content hash of a template folder (same file set `add` copies).
 * @param {string} dir
 */
export function hashDir(dir) {
  const h = createHash("sha256");
  for (const f of templateFiles(dir)) {
    h.update(`${f}\0`);
    h.update(readFileSync(join(dir, f)));
    h.update("\0");
  }
  return `sha256-${h.digest("hex").slice(0, 16)}`;
}

/**
 * Fetch a template into templates/<id>/ without clobbering local edits:
 * new → added; identical → unchanged; edited since the last add → kept
 * (unless `force`); otherwise → updated (files removed upstream are removed).
 * @param {{ root: string, source: TemplateSource, entry: RegistryEntry, record?: InstallRecord, force?: boolean }} o
 * @returns {Promise<{ status: InstallStatus, record?: InstallRecord }>}
 */
export async function installTemplate({ root, source, entry, record, force = false }) {
  const target = join(root, "templates", entry.id);
  const staging = join(root, ".reelclaw", "tmp", `${entry.id}-${process.pid}-${Date.now()}`);
  try {
    await source.fetch(entry, staging);
    const incoming = { from: source.from, hash: hashDir(staging) };
    if (!existsSync(target)) {
      await mkdir(dirname(target), { recursive: true });
      await rename(staging, target);
      return { status: "added", record: incoming };
    }
    const current = hashDir(target);
    if (current === incoming.hash) return { status: "unchanged", record: incoming };
    if (record?.hash !== current && !force) return { status: "kept", record };
    await rm(target, { recursive: true, force: true });
    await rename(staging, target);
    return { status: "updated", record: incoming };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

/**
 * Ids of templates installed in a project (folders with a template.mjs).
 * @param {string} root
 */
export function installedTemplates(root) {
  const dir = join(root, "templates");
  return existsSync(dir) ? readdirSync(dir).filter((id) => existsSync(join(dir, id, "template.mjs"))).sort() : [];
}

/**
 * Copy templates/<id>/SKILL.md to every agent skill folder. `overwrite: false`
 * only fills in missing copies.
 * @param {string} root
 * @param {string[]} ids
 * @param {{ overwrite: boolean }} o
 */
export async function syncSkills(root, ids, { overwrite }) {
  for (const id of ids) {
    const src = join(root, "templates", id, "SKILL.md");
    if (!existsSync(src)) continue;
    for (const dir of SKILL_DIRS) {
      const dest = join(root, dir, id, "SKILL.md");
      if (!overwrite && existsSync(dest)) continue;
      await mkdir(dirname(dest), { recursive: true });
      await copyFile(src, dest);
    }
  }
}

/* ───────────────────────── project files ───────────────────────── */

/**
 * Create or update package.json: the "reelclaw" dependency and the
 * `reelclaw.templates` install records. Other fields are left alone.
 * @param {string} root
 * @param {{ engine: string, records: Record<string, InstallRecord> }} o
 * @returns {Promise<{ engine: string, changed: boolean }>} the resulting engine spec, and whether it changed
 */
export async function updatePackageJson(root, { engine, records }) {
  const file = join(root, "package.json");
  /** @type {Record<string, any>} */
  let pkg = {};
  if (existsSync(file)) {
    try {
      pkg = JSON.parse(await readFile(file, "utf8"));
    } catch (cause) {
      throw new ReelclawError(`${file} is not valid JSON`, { hint: "fix or delete it, then run add again", cause });
    }
  }
  const before = JSON.stringify(pkg);
  pkg.name ??= packageName(basename(root));
  pkg.private ??= true;
  pkg.description ??= "Short-form video reels made with reelclaw templates";
  const section = pkg.devDependencies?.reelclaw && !pkg.dependencies?.reelclaw ? "devDependencies" : "dependencies";
  pkg[section] ??= {};
  const previous = pkg[section].reelclaw;
  pkg[section].reelclaw = engineDependency(previous, engine);
  const all = { ...pkg.reelclaw?.templates, ...records };
  pkg.reelclaw = { ...pkg.reelclaw, templates: Object.fromEntries(Object.keys(all).sort().map((k) => [k, all[k]])) };
  if (JSON.stringify(pkg) !== before) await writeFile(file, `${JSON.stringify(pkg, null, 2)}\n`);
  return { engine: pkg[section].reelclaw, changed: previous !== pkg[section].reelclaw };
}

/** @param {string} root */
export function readInstallRecords(root) {
  try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    return /** @type {Record<string, InstallRecord>} */ (pkg.reelclaw?.templates ?? {});
  } catch {
    return {};
  }
}

/** A valid npm package name from a folder name. */
export const packageName = (/** @type {string} */ dir) => dir.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[-._]+|-+$/g, "") || "reels";

/**
 * Append the scaffold's ignore lines that are missing.
 * @param {string} root
 */
export async function updateGitignore(root) {
  const file = join(root, ".gitignore");
  const existing = existsSync(file) ? await readFile(file, "utf8") : "";
  const have = new Set(existing.split(/\r?\n/).map((l) => l.trim()));
  const missing = (await readFile(join(SCAFFOLD, "gitignore"), "utf8")).split("\n").filter((l) => l.trim() && !have.has(l.trim()));
  if (!missing.length) return;
  const sep = existing && !existing.endsWith("\n") ? "\n" : "";
  await writeFile(file, `${existing}${sep}${existing ? "\n# reelclaw\n" : ""}${missing.join("\n")}\n`);
}

const BLOCK_START = "<!-- reelclaw:start (generated by `reelclaw add`; edits inside this block are replaced on the next add) -->";
const BLOCK_END = "<!-- reelclaw:end -->";
const BLOCK_RE = /<!-- reelclaw:start[^>]*-->[\s\S]*?<!-- reelclaw:end -->/;

/**
 * Put `body` inside the generated block of a markdown file: replace the block
 * when present, append it otherwise (user text outside the block is kept).
 * @param {string} existing  current file text ("" when new)
 * @param {string} body
 */
export function upsertBlock(existing, body) {
  const block = `${BLOCK_START}\n${body.trim()}\n${BLOCK_END}`;
  if (BLOCK_RE.test(existing)) return existing.replace(BLOCK_RE, () => block);
  return existing.trim() ? `${existing.trimEnd()}\n\n${block}\n` : `${block}\n`;
}

/**
 * Write AGENTS.md (Codex and most agents) and CLAUDE.md (imports AGENTS.md)
 * listing every installed template and its SKILL.md.
 * @param {string} root
 */
export async function writeAgentDocs(root) {
  const lines = installedTemplates(root).map((id) => {
    const skill = join(root, "templates", id, "SKILL.md");
    const fm = existsSync(skill) ? parseFrontmatter(readFileSync(skill, "utf8")) : null;
    return `- **${id}**: ${fm?.description ?? "(no SKILL.md)"}\n  Playbook: [templates/${id}/SKILL.md](templates/${id}/SKILL.md)`;
  });
  const vars = {
    TEMPLATES: lines.join("\n") || "_None yet: `npx reelclaw@latest add <template>`._",
    DANSUGC_MCP,
    SAFE_X: `${SAFE_BAND.x}–${SAFE_BAND.x + SAFE_BAND.w}`,
    SAFE_Y: `${SAFE_BAND.y}–${SAFE_BAND.y + SAFE_BAND.h}`,
  };
  for (const name of ["AGENTS.md", "CLAUDE.md"]) {
    const body = (await readFile(join(SCAFFOLD, name), "utf8")).replace(/\{\{(\w+)\}\}/g, (m, k) => /** @type {Record<string, string>} */ (vars)[k] ?? m);
    const file = join(root, name);
    const existing = existsSync(file) ? await readFile(file, "utf8") : "";
    const next = upsertBlock(existing, body);
    if (next !== existing) await writeFile(file, next);
  }
}
