// @ts-check
/**
 * Optional audio analysis through the pinned HyperFrames CLI:
 *   transcript — `hyperframes transcribe` (word timings; downloads a Whisper model on first use)
 *   beats      — `hyperframes beats` (beat grid of the soundtrack)
 * Both run on a WAV extracted from the reference, in a scratch folder that is
 * removed afterwards.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ReelclawError } from "../core/errors.mjs";
import { requireTool, run } from "../core/exec.mjs";
import { runHyperframes } from "../core/render.mjs";
import { bpmOf } from "./scenes.mjs";

/** @typedef {import('../core/timeline.mjs').Word} Word */
/** @typedef {{ text: string, words: Word[] }} Transcript */
/** @typedef {{ bpm: number | null, times: number[] }} BeatGrid */

/**
 * Extract the soundtrack as 44.1kHz mono WAV.
 * @param {string} file
 * @param {string} out
 */
async function extractWav(file, out) {
  requireTool("ffmpeg", "extract the reference's audio");
  const r = await run("ffmpeg", ["-v", "error", "-y", "-i", file, "-vn", "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", out]);
  if (r.code !== 0) throw new ReelclawError("could not extract the reference's audio", { hint: r.stderr.trim().split("\n").pop() ?? "" });
}

/**
 * Run `fn` in a scratch folder holding `audio.wav`, then delete the folder.
 * @template T
 * @param {string} file reference video
 * @param {string} scratch
 * @param {(wav: string) => Promise<T>} fn
 */
async function withWav(file, scratch, fn) {
  await rm(scratch, { recursive: true, force: true });
  await mkdir(scratch, { recursive: true });
  const wav = join(scratch, "audio.wav");
  try {
    await extractWav(file, wav);
    return await fn(wav);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

/**
 * Run HyperFrames, keeping its output for the error message only.
 * @param {string[]} args
 * @param {string} cwd
 * @param {string} what
 * @param {string} hint
 */
async function hyperframes(args, cwd, what, hint) {
  /** @type {string[]} */
  const lines = [];
  const code = await runHyperframes(args, { cwd, onLine: (l) => lines.push(l) });
  if (code !== 0) {
    throw new ReelclawError(`${what} failed (hyperframes exit ${code}): ${lines.slice(-3).join(" · ") || "no output"}`, { hint });
  }
}

/**
 * Word-level transcript of the reference.
 * @param {string} file
 * @param {string} dir analysis folder
 * @param {{ model?: string }} [o] Whisper model (default: HyperFrames' default)
 * @returns {Promise<Transcript>}
 */
export async function transcribe(file, dir, { model } = {}) {
  return withWav(file, join(dir, ".transcribe"), async (wav) => {
    const args = ["transcribe", wav, "--dir", dir];
    if (model) args.push("--model", model);
    await hyperframes(args, dir, "transcription", "run `npx hyperframes@0.8.181 transcribe --help`; or skip --transcribe and read the speech from the frames");
    const path = join(dir, "transcript.json");
    /** @type {Word[]} */
    const raw = existsSync(path) ? JSON.parse(await readFile(path, "utf8")) : [];
    const words = raw.map((w) => ({ text: String(w.text).trim(), start: w.start, end: w.end })).filter((w) => w.text);
    return { text: words.map((w) => w.text).join(" "), words };
  });
}

/**
 * Beat grid of the reference's soundtrack. Null when there is no steady beat
 * (talking, ambient) — HyperFrames refuses those, which is an answer, not an error.
 * @param {string} file
 * @param {string} dir analysis folder
 * @returns {Promise<BeatGrid | null>}
 */
export async function beatGrid(file, dir) {
  return withWav(file, join(dir, ".beats"), async (wav) => {
    const project = join(wav, "..");
    // `hyperframes beats` analyzes a project's music track: a one-tag project is enough
    await writeFile(join(project, "index.html"), '<!doctype html><audio id="music" data-timeline-role="music" src="audio.wav"></audio>\n');
    const code = await runHyperframes(["beats", project, "--json"], { cwd: project, onLine: () => {} });
    const out = join(project, "beats", "audio.wav.json");
    if (code !== 0 || !existsSync(out)) return null;
    /** @type {{ beats: { time: number }[] }} */
    const data = JSON.parse(await readFile(out, "utf8"));
    const times = data.beats.map((b) => b.time);
    return { bpm: bpmOf(times), times };
  });
}
