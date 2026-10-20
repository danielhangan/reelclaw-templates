#!/usr/bin/env node
// @ts-check
const [major] = process.versions.node.split(".").map(Number);
if (major < 22) {
  console.error(`✖ reelclaw needs Node.js 22 or newer (you have ${process.versions.node}) — the HyperFrames renderer requires it.`);
  console.error("  → install it: https://nodejs.org  ·  brew install node  ·  nvm install 22");
  process.exit(1);
}
// `reelclaw list | head` closes stdout early: exit quietly instead of crashing on EPIPE
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (err) => {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === "EPIPE") process.exit(process.exitCode ?? 0);
    throw err;
  });
}
const { main } = await import("../src/cli/main.mjs");
process.exitCode = await main(process.argv.slice(2));
