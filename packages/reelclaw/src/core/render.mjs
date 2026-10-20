// @ts-check
/**
 * Rendering via the pinned HyperFrames CLI. reelclaw depends on an exact
 * hyperframes version so a reel re-renders identically over time.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, symlinkSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { ReelclawError } from "./errors.mjs";
import { requireTool, run } from "./exec.mjs";
import { ffprobe } from "./media/probe.mjs";
import { projectPaths } from "./project.mjs";

/** @typedef {import('./log.mjs').Logger} Logger */

/** The HyperFrames version every reel is rendered with. Bump deliberately (and re-run CI renders). */
export const HYPERFRAMES_VERSION = "0.8.181";

/** @typedef {'draft'|'looks'|'delivery'} Quality */
export const QUALITIES = /** @type {const} */ (["draft", "looks", "delivery"]);

/**
 * Command + leading args that run the pinned HyperFrames CLI: the installed
 * dependency when present (fast, offline), else `npx hyperframes@<pin>`.
 * @returns {{ cmd: string, args: string[] }}
 */
export function hyperframesCommand() {
  try {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve("hyperframes/package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.hyperframes;
    if (pkg.version === HYPERFRAMES_VERSION && bin) return { cmd: process.execPath, args: [join(dirname(pkgPath), bin)] };
  } catch {
    // not installed next to the engine — fall through to npx
  }
  return { cmd: process.platform === "win32" ? "npx.cmd" : "npx", args: ["--yes", `hyperframes@${HYPERFRAMES_VERSION}`] };
}

/**
 * Run the pinned HyperFrames CLI in `cwd`, streaming its output (noise filtered).
 * @param {string[]} args
 * @param {{ cwd: string, onLine?: (line: string) => void }} o
 * @returns {Promise<number>} exit code
 */
export function runHyperframes(args, { cwd, onLine = (l) => process.stdout.write(`${l}\n`) }) {
  const hf = hyperframesCommand();
  return new Promise((resolve, reject) => {
    const child = spawn(hf.cmd, [...hf.args, ...args], { cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, FORCE_COLOR: "0" } });
    let lastDecile = -1;
    /** Progress bars are printed at most once per 10% so agent transcripts stay short. */
    const emit = (/** @type {string} */ line) => {
      if (isNoise(line)) return;
      const pct = /^\s*[█░]+\s+(\d+)%/.exec(line);
      if (pct) {
        const decile = Math.floor(Number(pct[1]) / 10);
        if (decile === lastDecile) return;
        lastDecile = decile;
      }
      onLine(line);
    };
    /** @param {NodeJS.ReadableStream} stream */
    const pump = (stream) => {
      let buf = "";
      stream.on("data", (d) => {
        buf += d;
        const lines = buf.split(/\r?\n|\r/);
        buf = lines.pop() ?? "";
        lines.forEach(emit);
      });
      stream.on("end", () => buf && emit(buf));
    };
    if (child.stdout) pump(child.stdout);
    if (child.stderr) pump(child.stderr);
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

/**
 * Machine-oriented lines HyperFrames prints that users don't need: structured
 * [INFO] logs, terminal control codes, and the project-root pre-check that
 * always fails for `render -c` ("No composition found … No index.html").
 * Errors, the failure summary text and progress bars still pass through.
 */
const NOISE = [
  /^$/, /^@hf-progress/, /^\[INFO\]/, /^\[initSession:/, /^\[BrowserManager\]/, /^\[HyperFrames\] render runtime fps/,
  /^\[hyperframes\] browserGpuMode/, /^GPU:/, /^Lint: \d+ error/, /^Continuing render despite lint/,
  /No composition found in/, /^No index\.html file found/, /^Run npx hyperframes init/,
  /Keep editing by chatting with Framey/, /hyperframes open/, /^[│◒◐◓◑◇]\s*(Checking browser|Browser:|$)/,
];

/** @param {string} line */
export function isNoise(line) {
  // eslint-disable-next-line no-control-regex
  const l = line.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "").trim();
  return NOISE.some((re) => re.test(l));
}

/** Render failures that come from a starved machine (parallel renders), not from the reel. */
const TRANSIENT = /not ready after|Capture failed|Parallel worker cancelled|Target closed|Protocol error|Navigation timeout|AudioContext encountered an error/;

/**
 * @typedef {object} RenderOptions
 * @property {string} root      reel project root
 * @property {string} name      reel name (reels/<name>.html)
 * @property {string} [output]  output path relative to root (default renders/<name>.mp4)
 * @property {Quality} [quality]  default "looks" (CRF 16); "draft" for fast previews
 * @property {number|'auto'} [workers]
 * @property {Logger} [log]
 * @property {(line: string) => void} [onLine]  receives HyperFrames output lines
 */

/**
 * Render a reel to MP4 and verify the output (exists, expected duration).
 * @param {RenderOptions} o
 * @returns {Promise<{ output: string, duration: number }>} absolute output path + probed duration
 */
export async function renderReel({ root, name, output, quality = "looks", workers, log, onLine }) {
  requireTool("ffmpeg", "encode the video");
  const reel = join("reels", `${name}.html`);
  if (!existsSync(join(root, reel))) {
    throw new ReelclawError(`no reel named "${name}" in ${root}`, { hint: `generate it first: reelclaw make <template> --name ${name}` });
  }
  const out = output ?? join("renders", `${name}.mp4`);
  const args = ["render", "-c", reel, "-o", out, "--quality", quality];
  if (workers !== undefined) args.push("--workers", String(workers));
  log?.step(`rendering ${out} (${quality})…`);
  let transient = false;
  const watch = (/** @type {string} */ line) => {
    if (TRANSIENT.test(line)) transient = true;
    (onLine ?? ((l) => process.stdout.write(`${l}\n`)))(line);
  };
  let code = await runHyperframes(args, { cwd: root, onLine: watch });
  if (code !== 0 && transient) {
    // one retry with a single worker: the usual cause is a busy machine timing out a browser worker
    log?.warn("render hit a browser timeout (busy machine?) — retrying once with 1 worker");
    const retry = [...args.filter((a, i) => a !== "--workers" && args[i - 1] !== "--workers"), "--workers", "1"];
    code = await runHyperframes(retry, { cwd: root, onLine });
  }
  const abs = join(root, out);
  if (code !== 0 || !existsSync(abs)) {
    throw new ReelclawError(`render failed for ${reel} (hyperframes exit ${code})`, {
      hint: `run \`reelclaw doctor\`, then \`reelclaw check ${name}\` to lint the composition`,
    });
  }
  const info = await ffprobe(abs);
  const expected = declaredDuration(readFileSync(join(root, reel), "utf8"));
  if (expected && Math.abs(info.duration - expected) > 0.15) {
    log?.warn(`rendered ${info.duration}s but the reel declares ${expected}s — inspect ${out}`);
  }
  return { output: abs, duration: info.duration };
}

/**
 * Root data-duration declared by a composition.
 * @param {string} html
 */
export function declaredDuration(html) {
  const m = /data-composition-id="[^"]*"[^>]*?data-duration="([\d.]+)"/s.exec(html);
  return m ? Number(m[1]) : null;
}

/**
 * @typedef {{ code: string, severity: 'error'|'warning'|'info', message: string, fixHint?: string, elementId?: string }} LintFinding
 */

/** Lint codes that are expected for reelclaw output and only add noise. */
const BENIGN_LINT = new Set(["nested_structure_needs_subcomposition"]);

/**
 * Lint one reel with `hyperframes lint`. HyperFrames lints project directories
 * (index.html), so the reel is mirrored into a scratch project whose assets/
 * links back to the real one.
 * @param {string} root
 * @param {string} name
 * @returns {Promise<LintFinding[]>}
 */
export async function lintReel(root, name) {
  const p = projectPaths(root);
  const html = await readReel(root, name);
  const scratch = join(p.cache, "lint", name);
  await rm(scratch, { recursive: true, force: true });
  await mkdir(scratch, { recursive: true });
  await writeFile(join(scratch, "index.html"), html.replaceAll('"../assets/', '"assets/').replaceAll("url(\"../assets/", 'url("assets/'));
  symlinkSync(p.assets, join(scratch, "assets"), "junction"); // absolute: junctions (Windows) require it
  const hf = hyperframesCommand();
  const r = await run(hf.cmd, [...hf.args, "lint", scratch, "--json"]);
  try {
    const json = JSON.parse(r.stdout.slice(r.stdout.indexOf("{")));
    return (json.findings ?? []).filter((/** @type {LintFinding} */ f) => !BENIGN_LINT.has(f.code));
  } catch {
    throw new ReelclawError(`hyperframes lint failed for ${name}`, { hint: (r.stderr || r.stdout).trim().split("\n").slice(-3).join(" ") });
  }
}

/** @param {string} root @param {string} name */
async function readReel(root, name) {
  const file = join(projectPaths(root).reels, `${name}.html`);
  if (!existsSync(file)) throw new ReelclawError(`no reel named "${name}"`, { hint: `ls ${relative(process.cwd(), projectPaths(root).reels) || "reels"}/` });
  return readFileSync(file, "utf8");
}
