// @ts-check
/**
 * CLI entry. Commands are auto-discovered: every src/cli/commands/<name>.mjs
 * that default-exports a {@link Command} becomes `reelclaw <name>`. To add a
 * command, drop a file in — no registration needed.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ReelclawError } from "../core/errors.mjs";
import { closest } from "../core/inputs.mjs";
import { color, consoleLogger } from "../core/log.mjs";
import { parseFlags } from "./args.mjs";

/** @typedef {import('./args.mjs').OptionSpec} OptionSpec */
/** @typedef {import('./args.mjs').ParsedArgs} ParsedArgs */
/** @typedef {import('../core/log.mjs').Logger} Logger */

/**
 * @typedef {object} CommandContext
 * @property {string[]} argv      raw args after the command name (global flags removed)
 * @property {ParsedArgs} args    argv parsed with the command's `options` (empty when `rawArgs`)
 * @property {string} root        reel project root: --project <dir> or the current directory
 * @property {string} cwd
 * @property {Logger} log
 * @property {(name: string) => void} help  print a command's usage
 */

/**
 * @typedef {object} Command
 * @property {string} summary     one line for `reelclaw --help`
 * @property {string} usage       full help text (usage line, flags, examples)
 * @property {Record<string, OptionSpec>} [options]  flags; parsed into ctx.args
 * @property {boolean} [rawArgs]  parse ctx.argv yourself (e.g. flags that depend on a template)
 * @property {string[]} [aliases]
 * @property {boolean} [hidden]   omit from the command list
 * @property {(ctx: CommandContext) => Promise<number | void>} run  resolve to an exit code (default 0)
 */

const COMMANDS_DIR = join(dirname(fileURLToPath(import.meta.url)), "commands");
const PKG = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json"), "utf8"));

/** @returns {Promise<Map<string, Command>>} name → command (aliases included) */
export async function loadCommands() {
  /** @type {Map<string, Command>} */
  const map = new Map();
  for (const file of readdirSync(COMMANDS_DIR).filter((f) => f.endsWith(".mjs")).sort()) {
    const name = file.replace(/\.mjs$/, "");
    const mod = await import(pathToFileURL(join(COMMANDS_DIR, file)).href);
    /** @type {Command} */
    const cmd = mod.default;
    if (!cmd || typeof cmd.run !== "function") throw new Error(`src/cli/commands/${file} must default-export a command { summary, usage, run }`);
    map.set(name, cmd);
    for (const alias of cmd.aliases ?? []) map.set(alias, cmd);
  }
  return map;
}

/** @param {Map<string, Command>} commands */
function printOverview(commands) {
  const seen = new Set();
  const rows = [];
  for (const [name, cmd] of commands) {
    if (seen.has(cmd) || cmd.hidden) continue;
    seen.add(cmd);
    rows.push(`  ${color.cyan(name.padEnd(10))} ${cmd.summary}`);
  }
  console.log(`${color.bold("reelclaw")} ${color.dim(`v${PKG.version}`)} — viral short-form video templates for Claude Code & Codex

${color.bold("Usage")}
  reelclaw <command> [flags]      ${color.dim("global: --project <dir>  (default: current directory)")}

${color.bold("Commands")}
${rows.join("\n")}

${color.bold("Start")}
  npx reelclaw@latest add reaction-demo     ${color.dim("# install a template into this folder")}
  reelclaw make reaction-demo --help        ${color.dim("# see its inputs")}

Run ${color.cyan("reelclaw <command> --help")} for details · https://github.com/danielhangan/reelclaw-templates`);
}

/**
 * Run the CLI.
 * @param {string[]} argv process.argv.slice(2)
 * @returns {Promise<number>} exit code
 */
export async function main(argv) {
  const log = consoleLogger;
  try {
    const commands = await loadCommands();
    const { rest, project } = extractGlobal(argv);
    const [name, ...args] = rest;
    if (!name || name === "--help" || name === "-h" || name === "help") {
      if (name === "help" && args[0] && commands.has(args[0])) return printHelp(commands, args[0]);
      printOverview(commands);
      return 0;
    }
    if (name === "--version" || name === "-v") {
      console.log(PKG.version);
      return 0;
    }
    const cmd = commands.get(name);
    if (!cmd) {
      const guess = closest(name, [...commands.keys()]);
      throw new ReelclawError(`unknown command "${name}"`, { hint: guess ? `did you mean \`reelclaw ${guess}\`?` : "run `reelclaw --help`" });
    }
    if (!cmd.rawArgs && (args.includes("--help") || args.includes("-h"))) return printHelp(commands, name);
    const parsed = cmd.rawArgs ? { values: {}, positionals: [] } : parseFlags(args, cmd.options ?? {});
    const code = await cmd.run({
      argv: args,
      args: parsed,
      root: resolve(project ?? process.cwd()),
      cwd: process.cwd(),
      log,
      help: (n) => printHelp(commands, n),
    });
    return code ?? 0;
  } catch (err) {
    return reportError(err, log);
  }
}

/** @param {Map<string, Command>} commands @param {string} name */
function printHelp(commands, name) {
  const cmd = commands.get(name);
  if (!cmd) return 1;
  console.log(`${color.bold(`reelclaw ${name}`)} — ${cmd.summary}\n\n${cmd.usage.trim()}`);
  return 0;
}

/**
 * Strip global flags (--project) from argv.
 * @param {string[]} argv
 */
function extractGlobal(argv) {
  /** @type {string[]} */
  const rest = [];
  /** @type {string | undefined} */
  let project;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project") project = argv[++i] ?? missing("--project");
    else if (a.startsWith("--project=")) project = a.slice("--project=".length);
    else rest.push(a);
  }
  return { rest, project };
}

/** @param {string} flag @returns {never} */
function missing(flag) {
  throw new ReelclawError(`${flag} needs a value`);
}

/**
 * Print an error: expected failures as message + fix, bugs with a stack.
 * @param {unknown} err
 * @param {Logger} log
 */
export function reportError(err, log) {
  if (err instanceof ReelclawError) {
    log.error(err.message);
    if (err.hint) console.error(`  ${color.cyan("→")} ${err.hint}`);
    return 1;
  }
  console.error(err instanceof Error ? err.stack : err);
  log.error("unexpected error — this is a reelclaw bug. Please report it: https://github.com/danielhangan/reelclaw-templates/issues");
  return 1;
}
