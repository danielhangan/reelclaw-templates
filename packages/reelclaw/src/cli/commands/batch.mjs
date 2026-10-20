// @ts-check
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ReelclawError } from "../../core/errors.mjs";
import { cliOptions, flagName, parseValues } from "../../core/inputs.mjs";
import { loadTemplate } from "../../core/loader.mjs";
import { color, displayPath } from "../../core/log.mjs";
import { makeReel, readProps } from "../../core/make.mjs";
import { kebab, nextReelName } from "../../core/project.mjs";
import { QUALITIES, renderReel } from "../../core/render.mjs";
import { numberFlag, parseFlags } from "../args.mjs";

/** @typedef {import('../../core/render.mjs').Quality} Quality */
/** @typedef {{ name: string, inputs: Record<string, unknown> }} Row */
/** @typedef {{ name: string, ok: boolean, duration?: number, output?: string, html?: string, warnings: string[], error?: string }} RowResult */

const BATCH_OPTIONS = /** @type {const} */ ({
  props: { type: "string", description: "base inputs shared by every row (e.g. reels/<name>.json from a previous make)" },
  prefix: { type: "string", description: "name rows without a \"name\" <prefix>-N (default: the template id)" },
  render: { type: "boolean", description: "render every reel after generating" },
  draft: { type: "boolean", description: "fast draft-quality renders (implies --render)" },
  quality: { type: "string", description: `render quality: ${QUALITIES.join(" | ")}` },
  workers: { type: "string", description: "render workers per reel (number or auto)" },
  parallel: { type: "string", description: "reels rendered at the same time (default 1; renders are CPU-heavy)" },
  "dry-run": { type: "boolean", description: "validate every row and print the plan, make nothing" },
  json: { type: "boolean", description: "print results as JSON" },
  help: { type: "boolean", short: "h", description: "show this help" },
});

/** @type {import('../main.mjs').Command} */
export default {
  summary: "make many variants of a template from a rows file (e.g. one reel per hook)",
  usage: `
Usage
  reelclaw batch <template> rows.json [--<input> value …] [--props base.json] [--draft]

rows.json is an array; each row is that reel's inputs (+ an optional "name"):
  [
    { "name": "hook-a", "hook": "i was about to hit it and this app talked me out of it" },
    { "name": "hook-b", "hook": "nobody told me quitting could feel this easy" }
  ]
or { "template": "<id>", "base": { …shared inputs }, "rows": [ … ] }.

Each reel's inputs = --props file < "base" < template flags on the command line < the row.
Every row is validated before anything is made; a failing render does not stop the others.

Flags
${Object.entries(BATCH_OPTIONS).map(([k, o]) => `  --${k.padEnd(10)} ${o.description}`).join("\n")}

Example (same footage, five hooks, draft renders)
  reelclaw make reaction-demo --reaction r.mp4 --demo d.mov --hook "first try" --name base
  reelclaw batch reaction-demo hooks.json --props reels/base.json --draft`,
  rawArgs: true,
  async run(ctx) {
    const [templateArg, ...rest] = ctx.argv;
    if (!templateArg || templateArg.startsWith("-")) {
      ctx.help("batch");
      return templateArg === "--help" || templateArg === "-h" ? 0 : 1;
    }
    const { template } = await loadTemplate(templateArg, ctx.root);
    const args = parseFlags(rest, { ...cliOptions(template.inputs), ...BATCH_OPTIONS });
    const v = args.values;
    if (v.help) { ctx.help("batch"); return 0; }
    const rowsFile = args.positionals[0];
    if (!rowsFile) throw new ReelclawError("which rows file?", { hint: `reelclaw batch ${template.id} rows.json` });
    if (args.positionals.length > 1) throw new ReelclawError(`unexpected argument "${args.positionals[1]}"`, { hint: 'quote text values: --hook "two words"' });

    /** @type {Record<string, unknown>} */
    const shared = {};
    if (typeof v.props === "string") Object.assign(shared, (await readProps(v.props)).inputs);
    const file = await readRows(rowsFile);
    if (file.template && kebab(file.template) !== template.id) {
      throw new ReelclawError(`${rowsFile} is for template "${file.template}", not "${template.id}"`);
    }
    Object.assign(shared, file.base);
    for (const key of Object.keys(template.inputs)) {
      const flag = v[flagName(key)];
      if (flag !== undefined) shared[key] = flag;
    }
    const rows = nameRows(file.rows, { prefix: typeof v.prefix === "string" ? kebab(v.prefix) : kebab(template.id), firstFree: (p) => nextReelName(ctx.root, p) });

    // validate everything up front: one message listing every bad row
    const problems = [];
    for (const row of rows) {
      try {
        parseValues(template.inputs, { ...shared, ...row.inputs }, { templateId: template.id });
      } catch (err) {
        const e = /** @type {Error & { hint?: string }} */ (err);
        const hint = e.hint && !e.hint.includes("--help") ? ` (${e.hint})` : "";
        problems.push(`${row.name}: ${e.message.replace(/^invalid inputs:\n\s*-\s*/, "").replace(/\n\s*-\s*/g, "; ")}${hint}`);
      }
    }
    if (problems.length) {
      throw new ReelclawError(`${problems.length} of ${rows.length} row(s) are invalid:\n  - ${problems.join("\n  - ")}`, { hint: `run \`reelclaw make ${template.id} --help\` to see every input` });
    }
    if (v["dry-run"]) {
      console.log(`${rows.length} reel(s) would be made: ${rows.map((r) => r.name).join(", ")}`);
      return 0;
    }

    const quality = /** @type {Quality | undefined} */ (v.draft ? "draft" : v.quality);
    if (quality && !QUALITIES.includes(quality)) throw new ReelclawError(`--quality must be one of ${QUALITIES.join(", ")}`);
    const workers = v.workers === "auto" ? "auto" : numberFlag(v.workers, "workers");
    const parallel = Math.max(1, Math.floor(numberFlag(v.parallel, "parallel") ?? 1));

    // --json keeps stdout for the result; progress goes to stderr
    const log = v.json ? stderrLogger : ctx.log;
    const stream = v.json ? process.stderr : process.stdout;

    /** @type {RowResult[]} */
    const results = [];
    for (const [i, row] of rows.entries()) {
      log.step(`[${i + 1}/${rows.length}] ${row.name}`);
      try {
        const r = await makeReel({ root: ctx.root, template, values: { ...shared, ...row.inputs }, name: row.name, log });
        results.push({ name: r.name, ok: true, duration: r.duration, html: r.html, warnings: r.warnings });
      } catch (err) {
        results.push({ name: row.name, ok: false, warnings: [], error: errorText(err) });
        log.error(`${row.name}: ${errorText(err)}`);
      }
    }

    if (v.render || v.draft) {
      const queue = results.filter((r) => r.ok);
      const renderOne = async (/** @type {RowResult} */ r) => {
        try {
          const out = await renderReel({
            root: ctx.root, name: r.name, quality: quality ?? "looks", workers, log,
            onLine: (l) => stream.write(`${color.dim(`[${r.name}]`)} ${l}\n`),
          });
          r.output = out.output;
        } catch (err) {
          r.ok = false;
          r.error = errorText(err);
          log.error(`${r.name}: ${r.error}`);
        }
      };
      await pool(queue, parallel, renderOne);
    }

    const failed = results.filter((r) => !r.ok);
    if (v.json) console.log(JSON.stringify(results, null, 2));
    else printSummary(results, ctx.cwd);
    return failed.length ? 1 : 0;
  },
};

/**
 * Read a rows file: an array of rows, or { template?, base?, rows }.
 * @param {string} file
 * @returns {Promise<{ template?: string, base: Record<string, unknown>, rows: unknown[] }>}
 */
export async function readRows(file) {
  const abs = resolve(file);
  if (!existsSync(abs)) throw new ReelclawError(`rows file not found: ${file}`);
  let data;
  try {
    data = JSON.parse(await readFile(abs, "utf8"));
  } catch (cause) {
    throw new ReelclawError(`${file} is not valid JSON: ${/** @type {Error} */ (cause).message}`);
  }
  if (Array.isArray(data)) return { base: {}, rows: data };
  if (data && typeof data === "object" && Array.isArray(data.rows)) {
    return { template: data.template, base: isObject(data.base) ? data.base : {}, rows: data.rows };
  }
  throw new ReelclawError(`${file} must be a JSON array of rows, or { "rows": [...] }`);
}

/**
 * Give every row a unique, valid reel name. Rows may be flat inputs with an
 * optional "name", or { name?, inputs }. Unnamed rows get <prefix>-N, N
 * counting up from the first free number in reels/.
 * @param {unknown[]} raw
 * @param {{ prefix: string, firstFree: (prefix: string) => string }} o
 * @returns {Row[]}
 */
export function nameRows(raw, { prefix, firstFree }) {
  if (!raw.length) throw new ReelclawError("the rows file has no rows");
  let next = Number(/-(\d+)$/.exec(firstFree(prefix))?.[1] ?? 1);
  const seen = new Set();
  return raw.map((r, i) => {
    if (!isObject(r)) throw new ReelclawError(`row ${i + 1} must be a JSON object`);
    const { name, inputs, ...flat } = /** @type {Record<string, any>} */ (r);
    const values = isObject(inputs) ? inputs : flat;
    const reelName = name === undefined ? `${prefix}-${next++}` : String(name);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(reelName)) throw new ReelclawError(`row ${i + 1}: invalid name "${reelName}"`, { hint: "use kebab-case: lowercase letters, digits and dashes" });
    if (seen.has(reelName)) throw new ReelclawError(`row ${i + 1}: duplicate name "${reelName}"`);
    seen.add(reelName);
    return { name: reelName, inputs: values };
  });
}

/**
 * Run `fn` over `items` with at most `limit` in flight.
 * @template T
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<void>} fn
 */
async function pool(items, limit, fn) {
  let i = 0;
  const worker = async () => {
    while (i < items.length) await fn(items[i++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/** @param {RowResult[]} results @param {string} cwd */
function printSummary(results, cwd) {
  console.log(`\n${color.bold("Batch")}`);
  for (const r of results) {
    const mark = r.ok ? color.green("✓") : color.red("✖");
    const what = r.ok ? `${r.duration}s  ${displayPath(cwd, r.output ?? r.html ?? "")}${r.warnings.length ? color.yellow(`  ${r.warnings.length} warning(s)`) : ""}` : color.red(r.error ?? "failed");
    console.log(`  ${mark} ${r.name.padEnd(24)} ${what}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\n${color.red(`${failed} of ${results.length} failed`)}` : `\n${color.green(`${results.length} reel(s) done`)}`);
}

/** @type {import('../../core/log.mjs').Logger} */
const stderrLogger = {
  info: (m) => console.error(m),
  step: (m) => console.error(color.dim(`• ${m}`)),
  success: (m) => console.error(`${color.green("✓")} ${m}`),
  warn: (m) => console.error(`${color.yellow("⚠")} ${m}`),
  error: (m) => console.error(`${color.red("✖")} ${m}`),
};

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

/** @param {unknown} err */
const errorText = (err) => {
  const e = /** @type {Error & { hint?: string }} */ (err);
  return `${e.message}${e.hint ? ` (${e.hint})` : ""}`;
};
