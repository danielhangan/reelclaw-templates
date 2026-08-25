#!/usr/bin/env node
// reelclaw-templates — install one TikTok/Reels video template into the current directory.
//
//   npx reelclaw-templates                    interactive picker
//   npx reelclaw-templates <template>         install into ./<template>
//   npx reelclaw-templates <template> <dir>   install into <dir>
//   npx reelclaw-templates --list             list available templates
//
// Templates are fetched from the GitHub repo at install time, so new templates
// are available without republishing this package.

import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const REPO = "danielhangan/reelclaw-templates";
const DEFAULT_REF = "main";

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

function fail(msg) {
  console.error(`${c.red("✖")} ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { _: [], ref: DEFAULT_REF, list: false, src: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list" || a === "-l") args.list = true;
    else if (a === "--ref") args.ref = argv[++i] ?? fail("--ref needs a value");
    else if (a === "--src") args.src = argv[++i] ?? fail("--src needs a value");
    else if (a === "--help" || a === "-h") args.help = true;
    else if (a.startsWith("-")) fail(`Unknown flag: ${a}`);
    else args._.push(a);
  }
  return args;
}

function printHelp() {
  console.log(`
${c.bold("reelclaw-templates")} — TikTok/Reels video templates, one command.

Usage:
  npx reelclaw-templates${c.dim("@latest")}                    interactive picker
  npx reelclaw-templates${c.dim("@latest")} <template>         install into ./<template>
  npx reelclaw-templates${c.dim("@latest")} <template> <dir>   install into <dir>

Flags:
  --list        list available templates
  --ref <ref>   git branch/tag to fetch (default: ${DEFAULT_REF})
  --src <path>  copy from a local checkout instead of GitHub (for development)
  --help        this message

Repo: https://github.com/${REPO}
`);
}

function checkCmd(cmd, versionArg = "-version") {
  const r = spawnSync(cmd, [versionArg], { stdio: "ignore", shell: process.platform === "win32" });
  return r.status === 0;
}

function printEnvReport() {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const rows = [
    [nodeMajor >= 18, `Node ${process.versions.node}`, "Node 18+ is required"],
    [checkCmd("ffmpeg"), "ffmpeg", "required to probe/stage media — install: brew install ffmpeg | sudo apt install ffmpeg | winget install ffmpeg"],
    [checkCmd("ffprobe"), "ffprobe", "required (ships with ffmpeg)"],
    [checkCmd("yt-dlp", "--version"), "yt-dlp", "optional — lets you pass TikTok/IG/YouTube page links as inputs (brew install yt-dlp)"],
  ];
  console.log(c.bold("\nEnvironment check"));
  let missingRequired = false;
  for (const [ok, name, hint] of rows) {
    const optional = hint.startsWith("optional");
    if (ok) console.log(`  ${c.green("✓")} ${name}`);
    else {
      console.log(`  ${optional ? c.yellow("○") : c.red("✖")} ${name} ${c.dim(`— ${hint}`)}`);
      if (!optional) missingRequired = true;
    }
  }
  if (missingRequired) {
    console.log(`\n${c.yellow("!")} Install the missing requirements above before generating a reel.`);
  }
  return !missingRequired;
}

async function downloadRepo(ref) {
  const url = `https://codeload.github.com/${REPO}/tar.gz/${ref}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reelclaw-"));
  const tarball = path.join(tmp, "repo.tar.gz");
  process.stdout.write(`${c.dim(`Fetching ${REPO}@${ref}…`)} `);
  const res = await fetch(url);
  if (!res.ok) fail(`download failed (HTTP ${res.status}) from ${url}`);
  fs.writeFileSync(tarball, Buffer.from(await res.arrayBuffer()));
  const r = spawnSync("tar", ["-xzf", tarball, "-C", tmp], { stdio: "inherit" });
  if (r.status !== 0) fail("could not extract tarball — is `tar` on your PATH?");
  const rootDir = fs
    .readdirSync(tmp)
    .map((n) => path.join(tmp, n))
    .find((p) => fs.statSync(p).isDirectory());
  if (!rootDir) fail("unexpected tarball layout");
  console.log(c.green("done"));
  return rootDir;
}

function listTemplates(repoRoot) {
  const dir = path.join(repoRoot, "templates");
  if (!fs.existsSync(dir)) fail(`no templates/ directory found in ${repoRoot}`);
  return fs
    .readdirSync(dir)
    .filter((n) => !n.startsWith(".") && fs.statSync(path.join(dir, n)).isDirectory())
    .sort();
}

function templateBlurb(repoRoot, name) {
  const readme = path.join(repoRoot, "templates", name, "README.md");
  if (!fs.existsSync(readme)) return "";
  const lines = fs.readFileSync(readme, "utf8").split("\n");
  const first = lines.find((l) => l.trim() && !l.startsWith("#"));
  return first ? first.replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").trim() : "";
}

async function pickTemplate(repoRoot, names) {
  console.log(c.bold("\nAvailable templates:\n"));
  names.forEach((n, i) => {
    const blurb = templateBlurb(repoRoot, n);
    console.log(`  ${c.cyan(String(i + 1))}. ${c.bold(n)}`);
    if (blurb) console.log(`     ${c.dim(blurb.slice(0, 120))}`);
  });
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`\nPick a template ${c.dim(`(1-${names.length})`)}: `)).trim();
  rl.close();
  const byNumber = names[Number(answer) - 1];
  const byName = names.find((n) => n === answer);
  const chosen = byName ?? byNumber;
  if (!chosen) fail(`"${answer}" is not a valid choice`);
  return chosen;
}

// Mirrors the repo's .gitignore so a --src install matches a GitHub tarball
// install: skip generated reels, staged media (fonts kept), and tooling junk.
const SKIP = [
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)\.DS_Store$/,
  /(^|\/)\.hyperframes(\/|$)/,
  /\.log$/,
  /(^|\/)renders(\/|$)/,
  /(^|\/)snapshots[^/]*(\/|$)/,
  /^host-[^/]+\.html$/,
  /^compositions\/.+\.html$/,
  /^assets\/(?!fonts(\/|$))./,
];

function keepPath(rel) {
  const p = rel.split(path.sep).join("/");
  return !SKIP.some((re) => re.test(p));
}

function install(repoRoot, name, destArg) {
  const src = path.join(repoRoot, "templates", name);
  if (!fs.existsSync(src)) {
    fail(`template "${name}" not found. Available: ${listTemplates(repoRoot).join(", ")}`);
  }
  const dest = path.resolve(destArg ?? name);
  if (fs.existsSync(dest) && fs.readdirSync(dest).length > 0) {
    fail(`${dest} already exists and is not empty — pick another directory`);
  }
  fs.cpSync(src, dest, { recursive: true, filter: (s) => keepPath(path.relative(src, s)) });
  const rules = path.join(repoRoot, "RULES.md");
  if (fs.existsSync(rules)) fs.copyFileSync(rules, path.join(dest, "RULES.md"));
  return dest;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

const repoRoot = args.src ? path.resolve(args.src) : await downloadRepo(args.ref);
if (args.src && !fs.existsSync(path.join(repoRoot, "templates"))) {
  fail(`--src ${repoRoot} does not look like the templates repo (no templates/ dir)`);
}
const names = listTemplates(repoRoot);

if (args.list) {
  for (const n of names) {
    const blurb = templateBlurb(repoRoot, n);
    console.log(`${c.bold(n)}${blurb ? c.dim(` — ${blurb.slice(0, 120)}`) : ""}`);
  }
  process.exit(0);
}

const name = args._[0] ?? (await pickTemplate(repoRoot, names));
const dest = install(repoRoot, name, args._[1]);
const rel = path.relative(process.cwd(), dest) || ".";

console.log(`\n${c.green("✓")} Installed ${c.bold(name)} into ${c.bold(rel)}`);
printEnvReport();

console.log(`
${c.bold("Next steps")}

  cd ${rel}

  ${c.dim("# with Claude Code (recommended — CLAUDE.md teaches it the whole workflow):")}
  claude
  ${c.dim('> "make me a reel with <your clips>"')}

  ${c.dim("# or run the generator directly (full flag reference in README.md):")}
  node new-reel.mjs ...

${c.dim(`Need creator footage? UGC reaction videos from $5 at https://dansugc.com`)}
`);
