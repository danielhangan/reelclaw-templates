// @ts-check
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { ReelclawError } from "../../core/errors.mjs";
import { closest } from "../../core/inputs.mjs";
import { normalizeId } from "../../core/loader.mjs";
import { color, displayPath } from "../../core/log.mjs";
import { ensureProject, REPO_ROOT } from "../../core/project.mjs";
import { runChecks } from "./doctor.mjs";
import { formatCatalog, pickTemplates } from "../lib/picker.mjs";
import {
  engineSpec, installPlaybook, installTemplate, installedTemplates, readInstallRecords, syncSkills,
  updateGitignore, updatePackageJson, writeAgentDocs,
} from "../lib/project.mjs";
import { DEFAULT_REF, PLAYBOOK_ID, REPO } from "../lib/registry.mjs";
import { githubSource, localSource } from "../lib/sources.mjs";

/** @typedef {import('../lib/registry.mjs').RegistryEntry} RegistryEntry */
/** @typedef {import('../lib/sources.mjs').TemplateSource} TemplateSource */
/** @typedef {import('../lib/project.mjs').InstallStatus} InstallStatus */
/** @typedef {import('../../core/log.mjs').Logger} Logger */

const STATUS = /** @type {Record<InstallStatus, string>} */ ({
  added: color.green("+ added"),
  updated: color.green("↻ updated"),
  unchanged: color.dim("= up to date"),
  kept: color.yellow("! kept your local edits (re-run with --force to replace them)"),
});

/** @type {import('../main.mjs').Command} */
export default {
  summary: "install templates into a reel project (+ Claude Code / Codex instructions)",
  aliases: ["install"],
  usage: `
Usage
  npx reelclaw@latest add <template> [<template>…]   install into the current folder
  npx reelclaw@latest add                            pick from the catalog
  npx reelclaw@latest add --all                      every template
  npx reelclaw@latest add --list [--json]            show the catalog

Turns the folder into a reel project (or updates it): templates/<id>/,
package.json with the reelclaw engine, AGENTS.md + CLAUDE.md, the template
skills and the shared ${PLAYBOOK_ID} skill (the producer workflow: hooks,
footage, music, QA, variants) in .claude/skills/ and .agents/skills/, fonts in
assets/; then runs npm install and doctor. Safe to re-run: it adds new
templates, updates the ones you have not edited, keeps the ones you have, and
refreshes the playbook.

Templates and the playbook come from GitHub (registry.json on main), so new
templates need no reelclaw update.

Flags
  --all              install every template in the catalog
  --dir <path>       project folder (default: current folder; created if missing)
  --list             print the catalog and exit (--json for machine output)
  --force            replace templates even if you edited them
  --ref <ref>        GitHub branch, tag or commit to install from (default: ${DEFAULT_REF})
  --repo <owner/n>   GitHub repo to install from (default: ${REPO}; e.g. a fork)
  --src <path>       install from a local reelclaw-templates checkout (development)
  --no-install       skip npm install
  --json             with --list: print the catalog as JSON

Examples
  npx reelclaw@latest add reaction-demo
  npx reelclaw@latest add reaction-demo no-yapping --dir my-reels
  npx github:${REPO} add reaction-demo      (before/without the npm package)
  npx reelclaw add my-template --repo me/reelclaw-templates --ref my-branch`,
  options: {
    all: { type: "boolean" },
    dir: { type: "string" },
    list: { type: "boolean" },
    force: { type: "boolean" },
    ref: { type: "string" },
    repo: { type: "string" },
    src: { type: "string" },
    install: { type: "boolean" },
    json: { type: "boolean" },
  },
  async run(ctx) {
    const v = /** @type {{ all?: boolean, dir?: string, list?: boolean, force?: boolean, ref?: string, repo?: string, src?: string, install?: boolean, json?: boolean }} */ (ctx.args.values);
    const root = resolve(ctx.cwd, v.dir ?? ctx.root);
    const { source, entries } = await openCatalog(v, ctx.log);

    if (v.list) {
      if (v.json) console.log(JSON.stringify(entries, null, 2));
      else console.log(`${formatCatalog(entries).text}\n\n${color.dim(`${entries.length} templates from ${source.label} · install: npx reelclaw@latest add <id>`)}`);
      return 0;
    }

    const ids = await chooseTemplates(ctx.args.positionals, entries, Boolean(v.all));
    if (resolve(root) === resolve(homedir())) {
      throw new ReelclawError("refusing to turn your home folder into a reel project", { hint: "mkdir my-reels && cd my-reels, then run add again (or pass --dir my-reels)" });
    }
    await mkdir(root, { recursive: true });
    const where = displayPath(ctx.cwd, root);
    ctx.log.step(`installing ${ids.join(", ")} from ${source.label} into ${where}`);

    // 1. templates
    const records = readInstallRecords(root);
    /** @type {Record<string, import('../lib/project.mjs').InstallRecord>} */
    const newRecords = {};
    /** @type {string[]} */
    const touched = [];
    for (const id of ids) {
      const entry = /** @type {RegistryEntry} */ (entries.find((e) => e.id === id));
      const { status, record } = await installTemplate({ root, source, entry, record: records[id], force: v.force });
      if (record) newRecords[id] = record;
      if (status === "added" || status === "updated") touched.push(id);
      console.log(`  ${color.bold(id.padEnd(24))} ${STATUS[status]}`);
    }

    // 2. project files
    await ensureProject(root);
    const pkg = await updatePackageJson(root, { engine: engineSpec({ src: v.src, repo: v.repo, ref: v.ref }), records: newRecords });
    await updateGitignore(root);
    const all = installedTemplates(root);
    await syncSkills(root, touched, { overwrite: true });
    await syncSkills(root, all, { overwrite: false });
    try {
      const pb = await installPlaybook({ root, source });
      const note = pb.status === "missing" ? color.yellow("! not found in this source") : `${STATUS[pb.status]}${pb.bundled ? color.dim(" (bundled with this reelclaw)") : ""}`;
      console.log(`  ${color.bold(PLAYBOOK_ID.padEnd(24))} ${note}`);
    } catch (err) {
      ctx.log.warn(`could not install the ${PLAYBOOK_ID} skill: ${/** @type {Error} */ (err).message} (templates are fine; run add again later)`);
    }
    await writeAgentDocs(root);
    ctx.log.success(`project files: package.json (reelclaw ${pkg.engine}), AGENTS.md, CLAUDE.md, .claude/skills, .agents/skills`);

    // 3. engine install
    const installed = existsSync(join(root, "node_modules", "reelclaw", "package.json"));
    if (v.install === false) ctx.log.step("skipped npm install (--no-install)");
    else if (installed && !pkg.changed) ctx.log.step("engine already installed (node_modules/reelclaw)");
    else await npmInstall(root, ctx.log);

    // 4. machine check
    await printDoctor(root);
    printNext(where, ids, all);
    return 0;
  },
};

/**
 * Pick the template source and load its catalog. Order: --src; the checkout
 * this engine runs from (contributors); GitHub — falling back to the templates
 * bundled with a GitHub snapshot (`npx github:…`) when GitHub is unreachable.
 * @param {{ src?: string, ref?: string, repo?: string }} v
 * @param {Logger} log
 * @returns {Promise<{ source: TemplateSource, entries: RegistryEntry[] }>}
 */
async function openCatalog(v, log) {
  const explicitRemote = Boolean(v.ref || v.repo);
  const devCheckout = REPO_ROOT && existsSync(join(REPO_ROOT, ".git")) ? REPO_ROOT : null;
  /** @type {TemplateSource} */
  let source = v.src ? localSource(v.src) : devCheckout && !explicitRemote ? localSource(devCheckout) : githubSource({ repo: v.repo, ref: v.ref });
  /** @type {{ entries: RegistryEntry[], warnings: string[] }} */
  let catalog;
  try {
    catalog = await source.catalog();
  } catch (err) {
    if (!(err instanceof ReelclawError) || v.src || explicitRemote || !REPO_ROOT) throw err;
    log.warn(`${err.message} — using the templates bundled with this reelclaw instead`);
    source = localSource(REPO_ROOT, { label: "the templates bundled with this reelclaw" });
    catalog = await source.catalog();
  }
  for (const w of catalog.warnings) log.warn(w);
  return { source, entries: catalog.entries };
}

/**
 * Template ids from the command line, --all, or the interactive picker.
 * @param {string[]} positionals
 * @param {RegistryEntry[]} entries
 * @param {boolean} all
 */
async function chooseTemplates(positionals, entries, all) {
  const known = entries.map((e) => e.id);
  if (all) return known;
  if (!positionals.length) {
    if (process.stdin.isTTY && process.stdout.isTTY) return pickTemplates(entries);
    console.log(formatCatalog(entries).text);
    throw new ReelclawError("which template(s)?", { hint: "npx reelclaw@latest add <id> [<id>…]   ·   --all for every template" });
  }
  const ids = [...new Set(positionals.map(normalizeId))];
  const unknown = ids.filter((id) => !known.includes(id));
  if (unknown.length) {
    const guess = closest(unknown[0], known);
    throw new ReelclawError(`unknown template${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}`, {
      hint: `${guess ? `did you mean "${guess}"? · ` : ""}see the catalog: npx reelclaw@latest add --list`,
    });
  }
  return ids;
}

/**
 * @param {string} root
 * @param {Logger} log
 */
async function npmInstall(root, log) {
  log.step("installing the reelclaw engine (npm install, first time takes a minute)…");
  /** @type {{ code: number, output: string }} */
  const r = await new Promise((done) => {
    // Windows needs a shell to run npm.cmd; the arguments are fixed, so this is safe
    const child = spawn("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: root, shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("error", (err) => done({ code: -1, output: err.message }));
    child.on("close", (code) => done({ code: code ?? 1, output }));
  });
  if (r.code === 0) return log.success("engine installed: node_modules/reelclaw");
  log.warn(`npm install failed (${r.code === -1 ? "could not run npm" : `exit ${r.code}`}):\n    ${r.output.trim().split("\n").slice(-8).join("\n    ")}`);
  log.warn(`the templates are installed; fix the error above, then run \`npm install\` in ${root}`);
}

/** Compact doctor: one line when all is well, the fixes otherwise. @param {string} root */
async function printDoctor(root) {
  const checks = await runChecks(root);
  const bad = checks.filter((c) => !c.ok);
  const required = bad.filter((c) => !c.optional);
  if (!bad.length) return console.log(`${color.green("✓")} doctor: ${checks.map((c) => c.name).join(", ")} ok`);
  console.log(required.length ? `${color.red("✖")} doctor: install these before making reels` : `${color.green("✓")} doctor: required tools ok`);
  for (const c of bad) console.log(`  ${c.optional ? color.yellow("○") : color.red("✖")} ${c.name}: ${c.detail}${c.hint ? `\n    ${color.cyan("→")} ${c.hint}` : ""}`);
}

/**
 * @param {string} where  project folder as shown to the user
 * @param {string[]} ids  templates from this run
 * @param {string[]} all  every template in the project
 */
function printNext(where, ids, all) {
  const cd = where === "." ? "" : `cd ${/\s/.test(where) ? JSON.stringify(where) : where} && `;
  const id = ids[0];
  console.log(`
${color.bold("Ready.")} ${all.length} template${all.length === 1 ? "" : "s"} in ${where}: ${all.join(", ")}

${color.bold("Next")}
  ${cd}claude        ${color.dim("# Claude Code")}
  ${cd}codex         ${color.dim("# Codex")}
  then ask: ${color.cyan(`"make a ${id} reel with my footage: <files or links>"`)}
       or:  ${color.cyan(`"plan 5 reels for my app"`)} ${color.dim(`(the agent loads the ${PLAYBOOK_ID} skill)`)}

  by hand:  ${cd}npx reelclaw make ${id} --help

${color.dim("No footage yet? Use your own clips or links. Optional: real-creator UGC clips at https://dansugc.com")}`);
}
