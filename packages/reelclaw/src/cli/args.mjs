// @ts-check
/** Flag parsing on top of node:util parseArgs, with friendlier errors. */
import { parseArgs } from "node:util";
import { ReelclawError } from "../core/errors.mjs";
import { closest } from "../core/inputs.mjs";

/**
 * @typedef {{ type: 'string'|'boolean', multiple?: boolean, short?: string, description?: string }} OptionSpec
 * @typedef {{ values: Record<string, string | boolean | string[] | boolean[] | undefined>, positionals: string[] }} ParsedArgs
 */

/**
 * Parse argv against option specs. Accepts `--flag value`, `--flag=value`,
 * `--no-flag` for booleans, and negative numbers as values (`--x -20`).
 * @param {string[]} argv
 * @param {Record<string, OptionSpec>} options
 * @returns {ParsedArgs}
 */
export function parseFlags(argv, options) {
  const fixed = joinNegativeValues(argv, options);
  /** @type {Record<string, { type: 'string'|'boolean', multiple?: boolean, short?: string }>} */
  const spec = {};
  for (const [k, o] of Object.entries(options)) {
    spec[k] = { type: o.type };
    if (o.multiple) spec[k].multiple = true;
    if (o.short) spec[k].short = o.short;
  }
  try {
    const { values, positionals } = parseArgs({ args: fixed, options: spec, allowPositionals: true, allowNegative: true, strict: true });
    return { values: /** @type {ParsedArgs['values']} */ ({ ...values }), positionals };
  } catch (cause) {
    const err = /** @type {Error & { code?: string }} */ (cause);
    const unknown = /Unknown option '(-{1,2}[^']+)'/.exec(err.message)?.[1];
    if (unknown) {
      const guess = closest(unknown.replace(/^-+/, ""), Object.keys(options));
      throw new ReelclawError(`unknown flag ${unknown}`, { hint: guess ? `did you mean --${guess}?` : "see --help for the available flags" });
    }
    throw new ReelclawError(err.message.split("\n")[0]);
  }
}

/**
 * `--x -20` → `--x=-20` for string options, so negative numbers are values, not flags.
 * @param {string[]} argv
 * @param {Record<string, OptionSpec>} options
 */
function joinNegativeValues(argv, options) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    const name = a.startsWith("--") && !a.includes("=") ? a.slice(2) : null;
    if (name && options[name]?.type === "string" && next !== undefined && /^-\d/.test(next)) {
      out.push(`${a}=${next}`);
      i++;
    } else out.push(a);
  }
  return out;
}

/**
 * Pull a numeric flag value.
 * @param {unknown} v
 * @param {string} flag
 * @returns {number | undefined}
 */
export function numberFlag(v, flag) {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new ReelclawError(`--${flag} needs a number (got "${v}")`);
  return n;
}
