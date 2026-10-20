#!/usr/bin/env node
// @ts-check
/**
 * Which templates should CI smoke-render? Prints JSON (and writes GitHub
 * Actions outputs with --github).
 *
 *   node scripts/changed-templates.mjs --base origin/main     # PR: templates touched since the merge base
 *   node scripts/changed-templates.mjs --base <sha> --head <sha>
 *   node scripts/changed-templates.mjs --all                  # nightly: everything
 *   node scripts/changed-templates.mjs --only "a b"           # manual run: exactly these
 *
 * Rules: a change inside templates/<id>/ selects <id> (docs-only edits —
 * *.md, preview.* — do not). A change to anything every render depends on
 * (engine source, shared fonts, lockfile, fixtures/smoke scripts, the CI
 * workflow) selects all templates, thinned to --max for PRs; the nightly run
 * renders the rest. Output is split into shards of --shard-size for the
 * Actions matrix (which caps at 256 jobs).
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Paths every render depends on: touching one re-renders all templates. */
export const GLOBAL_TRIGGERS = [
  /^packages\/reelclaw\/(src|bin)\//,
  /^packages\/reelclaw\/package\.json$/,
  /^shared\//,
  /^package(-lock)?\.json$/,
  /^scripts\/(smoke-render|make-fixtures)\.mjs$/,
  /^\.github\/workflows\/ci\.ya?ml$/,
];

/** Files inside a template folder that never change its render. */
const DOCS_ONLY = /(^|\/)([^/]+\.md|preview\.[a-z0-9]+|preview-[^/]+)$/i;

/**
 * Decide what to render from a list of changed paths. Pure.
 * @param {string[]} files  repo-relative paths (git diff --name-only)
 * @param {string[]} ids    templates that exist at HEAD
 * @returns {{ ids: string[], all: boolean, reason: string }}
 */
export function selectTemplates(files, ids) {
  const trigger = files.find((f) => GLOBAL_TRIGGERS.some((re) => re.test(f)));
  if (trigger) return { ids: [...ids], all: true, reason: `${trigger} affects every render` };
  const known = new Set(ids);
  const picked = new Set();
  for (const f of files) {
    const m = /^templates\/([^/]+)\/(.+)$/.exec(f);
    if (m && known.has(m[1]) && !DOCS_ONLY.test(m[2])) picked.add(m[1]);
  }
  const list = [...picked].sort();
  return { ids: list, all: false, reason: list.length ? "templates changed" : "no template or engine changes" };
}

/**
 * Up to `max` ids spread evenly over the sorted list (deterministic). Pure.
 * @param {string[]} ids
 * @param {number} max
 */
export function sample(ids, max) {
  const sorted = [...ids].sort();
  if (!(max > 0) || sorted.length <= max) return sorted;
  const step = sorted.length / max;
  return Array.from({ length: max }, (_, i) => sorted[Math.floor(i * step)]);
}

/**
 * Split ids into matrix shards. A one-template shard is named after it so
 * artifact names stay readable on PRs. Pure.
 * @param {string[]} ids
 * @param {number} size
 * @returns {{ name: string, templates: string }[]}
 */
export function shard(ids, size) {
  const out = [];
  for (let i = 0; i < ids.length; i += size) {
    const part = ids.slice(i, i + size);
    out.push({ name: part.length === 1 ? part[0] : `shard-${out.length + 1}`, templates: part.join(" ") });
  }
  return out;
}

/** Valid template ids (kebab-case). Anything else is never passed on — ids end up in shell commands. */
export const TEMPLATE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Template ids present in the working tree (kebab-case folders with a template.mjs). */
export function listTemplates(root = ROOT) {
  const dir = join(root, "templates");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((id) => TEMPLATE_ID.test(id) && existsSync(join(dir, id, "template.mjs"))).sort();
}

/**
 * Changed paths between base and head, or null when git can't tell
 * (unknown/zero base after a force push or a new branch).
 * @param {string} base
 * @param {string} head
 */
function changedFiles(base, head) {
  if (!base || /^0+$/.test(base)) return null;
  const r = spawnSync("git", ["diff", "--name-only", `${base}...${head}`], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) {
    console.error(`git diff ${base}...${head} failed (${r.stderr.trim()}) — rendering everything`);
    return null;
  }
  return r.stdout.split("\n").filter(Boolean);
}

function main() {
  const { values } = parseArgs({
    options: {
      base: { type: "string" },
      head: { type: "string", default: "HEAD" },
      all: { type: "boolean" },
      only: { type: "string" },
      max: { type: "string" },
      "shard-size": { type: "string", default: "8" },
      github: { type: "boolean" },
    },
  });
  const ids = listTemplates();
  const only = values.only?.split(/[\s,]+/).filter(Boolean);
  const unknown = only?.filter((id) => !ids.includes(id)) ?? [];
  if (unknown.length) {
    console.error(`unknown template(s): ${unknown.join(", ")} — available: ${ids.join(", ")}`);
    process.exit(1);
  }
  const files = values.all || only ? null : changedFiles(values.base ?? "", values.head ?? "HEAD");
  const picked = only?.length
    ? { ids: only, all: false, reason: "--only" }
    : files ? selectTemplates(files, ids) : { ids, all: true, reason: values.all ? "--all" : "no usable base revision" };
  const max = Number(values.max ?? 0);
  const selected = picked.all && !values.all && max > 0 ? sample(picked.ids, max) : picked.ids;
  const thinned = selected.length < picked.ids.length ? ` (sampled ${selected.length}/${picked.ids.length}; the nightly run renders all)` : "";
  const shards = shard(selected, Math.max(1, Number(values["shard-size"])));
  const result = { templates: selected, shards, reason: picked.reason + thinned };
  console.log(JSON.stringify(result, null, 2));

  if (values.github) {
    const out = process.env.GITHUB_OUTPUT;
    if (out) appendFileSync(out, `templates=${JSON.stringify(selected)}\nshards=${JSON.stringify(shards)}\ncount=${selected.length}\n`);
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary) appendFileSync(summary, `### Smoke render plan\n\n${selected.length ? selected.map((id) => `\`${id}\``).join(", ") : "nothing to render"} — ${result.reason}\n`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
