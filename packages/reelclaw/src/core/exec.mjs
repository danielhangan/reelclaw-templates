// @ts-check
/** Child-process helpers with actionable "tool missing" errors. */
import { spawn, spawnSync } from "node:child_process";
import { ReelclawError } from "./errors.mjs";

/** Install hints for the external tools the engine shells out to. */
export const TOOLS = Object.freeze({
  ffmpeg: { versionArg: "-version", install: "brew install ffmpeg  |  sudo apt install ffmpeg  |  winget install ffmpeg" },
  ffprobe: { versionArg: "-version", install: "ships with ffmpeg: brew install ffmpeg  |  sudo apt install ffmpeg  |  winget install ffmpeg" },
  "yt-dlp": { versionArg: "--version", install: "brew install yt-dlp  |  pipx install yt-dlp  |  winget install yt-dlp" },
});

/** @typedef {keyof typeof TOOLS} Tool */

/** @type {Map<string, string | null>} */
const versions = new Map();

/**
 * Version line of a tool, or null when it is not on PATH. Cached per process.
 * @param {Tool} tool
 */
export function toolVersion(tool) {
  if (!versions.has(tool)) {
    const r = spawnSync(tool, [TOOLS[tool].versionArg], { encoding: "utf8", shell: process.platform === "win32" });
    const line = (r.stdout || "").split("\n")[0].trim();
    // "ffmpeg version 7.1.1 Copyright …" → "7.1.1"; yt-dlp prints the bare version
    versions.set(tool, r.status === 0 ? (/version (\S+)/.exec(line)?.[1] ?? line) : null);
  }
  return versions.get(tool) ?? null;
}

/**
 * Throw an actionable error unless `tool` is installed.
 * @param {Tool} tool
 * @param {string} why what it is needed for
 */
export function requireTool(tool, why) {
  if (toolVersion(tool) === null) {
    throw new ReelclawError(`${tool} is not installed — it is needed to ${why}`, { hint: `install it: ${TOOLS[tool].install}` });
  }
}

/**
 * Run a command to completion and capture output.
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ cwd?: string, inherit?: boolean }} [o] `inherit` streams output to the terminal
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
export function run(cmd, args, o = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: o.cwd, stdio: o.inherit ? "inherit" : ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => (stdout += d));
    child.stderr?.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}
