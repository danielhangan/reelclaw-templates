// @ts-check
/** Terminal catalog + interactive template picker for `reelclaw add` (node:readline, no deps). */
import { createInterface } from "node:readline/promises";
import { ReelclawError } from "../../core/errors.mjs";
import { closest } from "../../core/inputs.mjs";
import { color } from "../../core/log.mjs";

/** @typedef {import('./registry.mjs').RegistryEntry} RegistryEntry */

/**
 * Catalog lines grouped by category, numbered in display order.
 * @param {RegistryEntry[]} entries
 * @returns {{ text: string, order: RegistryEntry[] }}
 */
export function formatCatalog(entries) {
  /** @type {Map<string, RegistryEntry[]>} */
  const groups = new Map();
  for (const e of [...entries].sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id))) {
    groups.set(e.category, [...(groups.get(e.category) ?? []), e]);
  }
  /** @type {RegistryEntry[]} */
  const order = [];
  const lines = [];
  const width = String(entries.length).length;
  for (const [category, list] of groups) {
    lines.push(color.bold(category));
    for (const e of list) {
      order.push(e);
      const desc = e.description.length > 90 ? `${e.description.slice(0, 89)}…` : e.description;
      lines.push(`  ${color.dim(`${String(order.length).padStart(width)}.`)} ${color.cyan(e.id)}  ${e.name}\n     ${" ".repeat(width)}${color.dim(desc)}`);
    }
  }
  return { text: lines.join("\n"), order };
}

/**
 * Parse an answer like "1, 3 reaction-demo" or "all" against the numbered list.
 * @param {string} answer
 * @param {string[]} ids  in display order (1-based numbers refer to these)
 * @returns {{ ids: string[], invalid: string[] }}
 */
export function parseSelection(answer, ids) {
  const tokens = answer.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean);
  if (tokens.some((t) => t.toLowerCase() === "all")) return { ids: [...ids], invalid: [] };
  /** @type {Set<string>} */
  const picked = new Set();
  /** @type {string[]} */
  const invalid = [];
  for (const t of tokens) {
    const range = /^(\d+)-(\d+)$/.exec(t);
    if (range) {
      const [a, b] = [Number(range[1]), Number(range[2])].sort((x, y) => x - y);
      if (a < 1 || b > ids.length) invalid.push(t);
      else for (let i = a; i <= b; i++) picked.add(ids[i - 1]);
    } else if (/^\d+$/.test(t)) {
      const n = Number(t);
      if (n >= 1 && n <= ids.length) picked.add(ids[n - 1]);
      else invalid.push(t);
    } else {
      const id = t.toLowerCase().replace(/_/g, "-");
      if (ids.includes(id)) picked.add(id);
      else invalid.push(t);
    }
  }
  return { ids: [...picked], invalid };
}

/**
 * Show the catalog and ask which templates to add.
 * @param {RegistryEntry[]} entries
 * @returns {Promise<string[]>}
 */
export async function pickTemplates(entries) {
  if (!entries.length) throw new ReelclawError("the catalog is empty");
  const { text, order } = formatCatalog(entries);
  const ids = order.map((e) => e.id);
  console.log(`${text}\n`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const answer = await rl.question(`${color.bold("Add which templates?")} ${color.dim("(numbers, ranges like 1-3, ids, or all)")} `);
      const { ids: picked, invalid } = parseSelection(answer, ids);
      if (picked.length && !invalid.length) return picked;
      if (invalid.length) {
        const guess = closest(invalid[0], ids);
        console.log(color.yellow(`not in the list: ${invalid.join(", ")}${guess ? ` (did you mean ${guess}?)` : ""}`));
      }
    }
  } finally {
    rl.close();
  }
  throw new ReelclawError("no templates picked", { hint: "npx reelclaw@latest add <template>  ·  npx reelclaw@latest add --list" });
}
