// @ts-check
import { isAbsolute, relative } from "node:path";

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
/** @param {string} code */
const paint = (code) => (/** @type {string} */ s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);

export const color = {
  dim: paint("2"),
  bold: paint("1"),
  red: paint("31"),
  green: paint("32"),
  yellow: paint("33"),
  cyan: paint("36"),
};

/**
 * Minimal logger passed through the engine so library callers (batch, tests)
 * can silence or capture output. Warnings are also collected by the callers
 * that need them (see make.mjs), never only printed.
 *
 * @typedef {object} Logger
 * @property {(msg: string) => void} info
 * @property {(msg: string) => void} step     progress line ("Staging reaction…")
 * @property {(msg: string) => void} success
 * @property {(msg: string) => void} warn
 * @property {(msg: string) => void} error
 */

/** @type {Logger} */
export const consoleLogger = {
  info: (m) => console.log(m),
  step: (m) => console.log(color.dim(`• ${m}`)),
  success: (m) => console.log(`${color.green("✓")} ${m}`),
  warn: (m) => console.warn(`${color.yellow("⚠")} ${m}`),
  error: (m) => console.error(`${color.red("✖")} ${m}`),
};

/** @type {Logger} */
export const silentLogger = { info() {}, step() {}, success() {}, warn() {}, error() {} };

/**
 * A path as the user should see it: relative to cwd when it is inside it, else absolute.
 * @param {string} cwd
 * @param {string} path absolute
 */
export function displayPath(cwd, path) {
  const rel = relative(cwd, path);
  return !rel ? "." : rel.startsWith("..") || isAbsolute(rel) ? path : rel;
}
