#!/usr/bin/env node
// @ts-check
/**
 * reelclaw-templates: the v1 installer name, kept so old links and READMEs keep
 * working. Everything is forwarded to `reelclaw add` (the engine + CLI).
 */
import { translateArgs } from "./forward.mjs";

const [major] = process.versions.node.split(".").map(Number);
if (major < 22) {
  console.error(`✖ reelclaw needs Node.js 22 or newer (you have ${process.versions.node}).`);
  console.error("  → install it: https://nodejs.org  ·  brew install node  ·  nvm install 22");
  process.exit(1);
}

const note = "reelclaw-templates is now reelclaw: next time run  npx reelclaw@latest add <template>";
console.error(process.stderr.isTTY ? `\x1b[2m${note}\x1b[0m` : note);
const { main } = await import("reelclaw/cli");
process.exitCode = await main(translateArgs(process.argv.slice(2)));
