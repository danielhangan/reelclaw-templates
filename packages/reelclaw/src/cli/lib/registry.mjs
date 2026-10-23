// @ts-check
/**
 * registry.json — the template catalog `reelclaw add` reads from GitHub at
 * runtime, so new templates ship without an npm release. Generated from every
 * templates/<id>/template.mjs by `reelclaw registry` (CI: `--check`).
 *
 * The same pass writes .claude-plugin/marketplace.json, which (a) makes the repo
 * a Claude Code plugin marketplace and (b) points `npx skills add` at the
 * per-template SKILL.md files and the shared playbook skill, which live outside
 * the skills CLI's default search folders.
 *
 * The playbook (playbook/, skill "reelclaw-playbook") is the producer workflow
 * shared by every template. It is listed in the registry so `add` installs it
 * from the same source and ref as the templates.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ReelclawError } from "../../core/errors.mjs";
import { loadTemplate } from "../../core/loader.mjs";
import { summarizeTemplate } from "../../core/manifest.mjs";
import { ENGINE_ROOT } from "../../core/project.mjs";
import { parseFrontmatter } from "../../core/validate.mjs";

export const REPO = "danielhangan/reelclaw-templates";
export const DEFAULT_REF = "main";
export const REGISTRY_FILE = "registry.json";
export const MARKETPLACE_FILE = join(".claude-plugin", "marketplace.json");
export const PLUGIN_NAME = "reelclaw-templates";
/** The shared playbook skill: its folder in the repo and its skill name (= its folder in a project's skill dirs). */
export const PLAYBOOK_PATH = "playbook";
export const PLAYBOOK_ID = "reelclaw-playbook";
export const ENGINE_VERSION = /** @type {string} */ (JSON.parse(readFileSync(join(ENGINE_ROOT, "package.json"), "utf8")).version);

/** Optional preview media in a template folder; listed in the registry, never copied by `add`. */
export const PREVIEW_FILES = ["preview.gif", "preview.webp", "preview.mp4", "preview.jpg", "preview.png"];

/**
 * @typedef {import('../../core/manifest.mjs').InputSummary} InputSummary
 *
 * @typedef {object} InstallCommands
 * @property {string} reelclaw  npm one-liner (primary)
 * @property {string} github    works before/without an npm release
 * @property {string} skills    Agent Skills CLI (skill only; it bootstraps the engine)
 *
 * @typedef {object} RegistryEntry
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} category
 * @property {string[]} tags
 * @property {{ url?: string, notes?: string }} [source]
 * @property {InputSummary[]} inputs
 * @property {string[]} media      keys of media inputs (the footage a user needs)
 * @property {string} path         "templates/<id>"
 * @property {string[]} files      files `add` copies, relative to `path`
 * @property {Record<string, string>} [preview]  extension → raw URL
 * @property {InstallCommands} install
 *
 * @typedef {object} PlaybookEntry
 * @property {string} id           skill name ("reelclaw-playbook")
 * @property {string} description  from its SKILL.md frontmatter
 * @property {string} path         "playbook"
 * @property {string[]} files      files `add` copies, relative to `path`
 * @property {{ skills: string }} install
 *
 * @typedef {object} Registry
 * @property {1} version
 * @property {string} repo
 * @property {string} ref
 * @property {RegistryEntry[]} templates
 * @property {PlaybookEntry} [playbook]  the shared producer skill every install gets
 */

/**
 * @param {string} id
 * @param {string} [repo]
 * @returns {InstallCommands}
 */
export function installCommands(id, repo = REPO) {
  return {
    reelclaw: `npx reelclaw@latest add ${id}`,
    github: `npx github:${repo} add ${id}`,
    skills: `npx skills add ${repo} --skill ${id}`,
  };
}

/**
 * Files that make up a template (what `add` copies): everything in the folder
 * except previews, dotfiles and node_modules. Sorted, posix-style relative paths.
 * @param {string} dir
 * @returns {string[]}
 */
export function templateFiles(dir) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} rel */
  const walk = (rel) => {
    for (const entry of readdirSync(join(dir, rel), { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && !(rel === "" && PREVIEW_FILES.includes(entry.name))) out.push(path);
    }
  };
  walk("");
  return out.sort();
}

/**
 * Build the catalog from a checkout's templates/. Templates that fail to load
 * are reported in `errors` (the registry command fails on them; `add --src`
 * skips them with a warning).
 * @param {string} repoRoot  directory containing templates/
 * @param {{ repo?: string, ref?: string }} [o]
 * @returns {Promise<{ registry: Registry, errors: string[] }>}
 */
export async function buildRegistry(repoRoot, { repo = REPO, ref = DEFAULT_REF } = {}) {
  const dir = join(repoRoot, "templates");
  if (!existsSync(dir)) {
    throw new ReelclawError(`${repoRoot} has no templates/ folder`, { hint: "point --src / --project at a reelclaw-templates checkout" });
  }
  const ids = readdirSync(dir).filter((id) => existsSync(join(dir, id, "template.mjs"))).sort();
  /** @type {RegistryEntry[]} */
  const templates = [];
  /** @type {string[]} */
  const errors = [];
  for (const id of ids) {
    const folder = join(dir, id);
    try {
      const { template } = await loadTemplate(folder, repoRoot);
      if (template.id !== id) throw new Error(`id "${template.id}" does not match its folder templates/${id}/`);
      if (!existsSync(join(folder, "SKILL.md"))) throw new Error("SKILL.md is missing (agents and `npx skills add` need it)");
      const { schema: _schema, install: _install, ...summary } = summarizeTemplate(template);
      /** @type {Record<string, string>} */
      const preview = {};
      for (const f of PREVIEW_FILES) {
        if (existsSync(join(folder, f))) preview[f.slice(f.lastIndexOf(".") + 1)] = `https://raw.githubusercontent.com/${repo}/${ref}/templates/${id}/${f}`;
      }
      templates.push({
        ...summary,
        path: `templates/${id}`,
        files: templateFiles(folder),
        ...(Object.keys(preview).length ? { preview } : {}),
        install: installCommands(id, repo),
      });
    } catch (err) {
      errors.push(`templates/${id}: ${/** @type {Error} */ (err).message}`);
    }
  }
  /** @type {Registry} */
  const registry = { version: 1, repo, ref, templates };
  try {
    const playbook = playbookEntry(repoRoot, repo);
    if (playbook) registry.playbook = playbook;
  } catch (err) {
    errors.push(`${PLAYBOOK_PATH}: ${/** @type {Error} */ (err).message}`);
  }
  return { registry, errors };
}

/**
 * The shared playbook skill in a checkout (playbook/SKILL.md + references/),
 * or null when the checkout has none.
 * @param {string} repoRoot
 * @param {string} [repo]
 * @returns {PlaybookEntry | null}
 */
export function playbookEntry(repoRoot, repo = REPO) {
  const dir = join(repoRoot, PLAYBOOK_PATH);
  if (!existsSync(join(dir, "SKILL.md"))) return null;
  const fm = parseFrontmatter(readFileSync(join(dir, "SKILL.md"), "utf8"));
  if (fm?.name !== PLAYBOOK_ID) throw new Error(`SKILL.md name must be "${PLAYBOOK_ID}" (got "${fm?.name ?? ""}")`);
  if (!fm.description || fm.description.length < 40 || fm.description.length > 1024) throw new Error("SKILL.md description must be 40–1024 characters");
  return {
    id: PLAYBOOK_ID,
    description: fm.description,
    path: PLAYBOOK_PATH,
    files: templateFiles(dir),
    install: { skills: `npx skills add ${repo} --skill ${PLAYBOOK_ID}` },
  };
}

/**
 * Claude Code plugin marketplace manifest: one plugin whose skills are the
 * shared playbook plus the template SKILL.md folders. Also read by
 * `npx skills add` for discovery.
 * @param {Registry} registry
 */
export function marketplaceManifest(registry) {
  return {
    name: PLUGIN_NAME,
    owner: { name: "Daniel Hangan (DansUGC)", url: "https://dansugc.com" },
    metadata: {
      description: "Viral short-form video templates (TikTok / Reels / Shorts) you make and edit with Claude Code or Codex.",
    },
    plugins: [
      {
        name: PLUGIN_NAME,
        description: `${registry.templates.length} viral short-form video templates (TikTok / Reels / Shorts, 1080x1920). Each template is a skill that sets up the reelclaw engine in your folder and walks you from footage to a rendered MP4${registry.playbook ? `; the ${registry.playbook.id} skill is the producer workflow they share (brief, hooks, footage, music, QA, variants)` : ""}.`,
        source: "./",
        strict: false,
        homepage: `https://github.com/${registry.repo}`,
        repository: `https://github.com/${registry.repo}`,
        license: "MIT",
        keywords: ["tiktok", "reels", "shorts", "video", "ugc", "templates", "hyperframes"],
        skills: [...(registry.playbook ? [`./${registry.playbook.path}`] : []), ...registry.templates.map((t) => `./${t.path}`)],
      },
    ],
  };
}

const GALLERY_RE = /(<!-- gallery:start[^>]*-->\n)[\s\S]*?(\n<!-- gallery:end -->)/;

/**
 * The README template gallery: one row per template (preview, name, what it
 * makes, install line). Pure.
 * @param {Registry} registry
 */
export function galleryMarkdown(registry) {
  const cell = (/** @type {string} */ s) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const rows = registry.templates.map((t) => {
    const gif = t.preview?.gif ? `<img src="${t.path}/preview.gif" width="120" alt="${t.id} preview">` : "";
    const needs = t.media.length ? `<br><sub>media: ${t.media.map((m) => `\`--${m.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}\``).join(", ")}</sub>` : "";
    return `| ${gif} | **[${cell(t.name)}](${t.path}/)**<br>\`${t.id}\` · ${t.category} | ${cell(t.description)}${needs} | \`${t.install.reelclaw}\` |`;
  });
  return ["| Preview | Template | What it makes | Install |", "| :---: | --- | --- | --- |", ...rows].join("\n");
}

/**
 * Replace the generated gallery block in a README (between `<!-- gallery:start -->`
 * and `<!-- gallery:end -->`). Text without the markers is returned unchanged.
 * @param {string} readme
 * @param {Registry} registry
 */
export function withGallery(readme, registry) {
  return readme.replace(GALLERY_RE, (_, open, close) => `${open}${galleryMarkdown(registry)}${close}`);
}

/** Stable JSON text for generated files (2-space indent, trailing newline). */
export const toJson = (/** @type {unknown} */ value) => `${JSON.stringify(value, null, 2)}\n`;
