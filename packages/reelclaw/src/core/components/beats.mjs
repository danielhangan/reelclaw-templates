// @ts-check
/**
 * Beat sync: detect a music track's beats once (pinned `hyperframes beats`,
 * cached per staged file) and snap cut times onto them.
 *
 *   async prepare({ inputs, root }) {
 *     return { beats: inputs.music ? await detectBeats({ root, music: inputs.music }) : [] };
 *   },
 *   build({ prepared }) {
 *     const cuts = snapToBeats([3, 6, 9], toReelTime(prepared.beats, inputs.musicStart));
 *   }
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, symlink, copyFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { ReelclawError } from "../errors.mjs";
import { projectPaths } from "../project.mjs";
import { runHyperframes } from "../render.mjs";
import { ms } from "../timeline.mjs";

/** @typedef {import('../types.mjs').MediaRef} MediaRef */

/**
 * Beat times (seconds into the source file) of a staged music track. Cached in
 * `.reelclaw/cache/beats/<asset>.json`, so only the first run pays (~0.5s).
 * Returns [] (never throws) when no beats are found — callers fall back to fixed timing.
 * @param {{ root: string, music: MediaRef, onWarn?: (message: string) => void }} o
 * @returns {Promise<number[]>}
 */
export async function detectBeats({ root, music, onWarn }) {
  const paths = projectPaths(root);
  const name = basename(music.path);
  const cacheFile = join(paths.cache, "beats", `${name}.json`);
  try {
    const cached = JSON.parse(await readFile(cacheFile, "utf8"));
    if (!cached.length) onWarn?.(`no beats found in ${music.label} (ambient track?) — cuts use fixed timing`);
    return cached;
  } catch {
    // not cached yet
  }
  // `hyperframes beats` analyses the <audio id="music"> of a project folder
  const dir = join(paths.cache, "beats", `${name}.work`);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  try {
    try {
      await symlink(music.path, join(dir, name));
    } catch {
      await copyFile(music.path, join(dir, name));
    }
    await writeFile(join(dir, "index.html"), `<!doctype html><html><body><div id="root" data-composition-id="beats" data-start="0" data-width="1080" data-height="1920" data-duration="${Math.max(1, music.duration)}"><audio id="music" src="${name}" data-start="0" data-duration="${Math.max(1, music.duration)}" data-track-index="0"></audio></div></body></html>\n`);
    /** @type {string[]} */
    const output = [];
    const code = await runHyperframes(["beats", dir, "--json"], { cwd: root, onLine: (l) => output.push(l) });
    const result = join(dir, "beats", `${name}.json`);
    const noBeats = output.some((l) => /no beats detected/i.test(l));
    if (!noBeats && (code !== 0 || !existsSync(result))) {
      onWarn?.(`beat detection failed for ${music.label} — using fixed timing (${output.slice(-1)[0] ?? `exit ${code}`})`);
      return [];
    }
    // "no beats" is a real answer for ambient tracks: cache it too
    const times = noBeats ? [] : parseBeats(JSON.parse(await readFile(result, "utf8")));
    if (noBeats) onWarn?.(`no beats found in ${music.label} (ambient track?) — cuts use fixed timing`);
    await mkdir(join(paths.cache, "beats"), { recursive: true });
    await writeFile(cacheFile, JSON.stringify(times));
    return times;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Beat times from a `hyperframes beats` JSON file. Pure.
 * @param {unknown} json `{ beats: [{ time, strength }] }`
 * @returns {number[]} sorted seconds
 */
export function parseBeats(json) {
  const beats = /** @type {any} */ (json)?.beats;
  if (!Array.isArray(beats)) throw new ReelclawError("unexpected `hyperframes beats` output (no beats array)");
  return beats.map((b) => Number(b?.time)).filter((t) => Number.isFinite(t) && t >= 0).sort((a, b) => a - b);
}

/**
 * Convert source beat times to reel time for music started at `trim` seconds into the track.
 * @param {number[]} beats
 * @param {number} [trim]
 */
export function toReelTime(beats, trim = 0) {
  return beats.map((b) => ms(b - trim)).filter((t) => t > 0);
}

/**
 * Move each cut to the nearest beat within `tolerance` seconds, keeping cuts in
 * order and at least `minGap` apart (from each other and from `start`). Cuts
 * with no beat close enough stay where they are. Pure.
 * @param {number[]} cuts  absolute, ascending
 * @param {number[]} beats absolute, ascending
 * @param {{ tolerance?: number, minGap?: number, start?: number }} [o]
 * @returns {number[]}
 */
export function snapToBeats(cuts, beats, { tolerance = 0.45, minGap = 0.8, start = 0 } = {}) {
  /** @type {number[]} */
  const out = [];
  for (const cut of cuts) {
    const prev = out.length ? out[out.length - 1] : start;
    let best = cut;
    let bestDist = tolerance + 1e-9;
    for (const b of beats) {
      const d = Math.abs(b - cut);
      if (d <= bestDist && b - prev >= minGap) { best = b; bestDist = d; }
    }
    out.push(ms(Math.max(best, prev + minGap)));
  }
  return out;
}
