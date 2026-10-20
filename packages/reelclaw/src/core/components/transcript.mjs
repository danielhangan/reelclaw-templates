// @ts-check
/**
 * Word-level transcripts for captions: load one the user already has (JSON,
 * SRT or VTT) or create one with `hyperframes transcribe` (whisper.cpp),
 * cached next to the staged asset so re-runs are instant and a misheard word
 * can be fixed by editing one JSON file.
 *
 *   async prepare({ inputs, root, hyperframes }) {
 *     const words = inputs.transcript
 *       ? await loadTranscript(inputs.transcript, { bases: [cwd, root] })
 *       : await transcribeMedia({ root, from: inputs.clip, hyperframes });
 *     return { words };   // Word[] in the source file's own seconds
 *   }
 *
 * Every Word is `{ text, start, end }` in seconds, sorted, non-overlapping.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import { ReelclawError } from "../errors.mjs";
import { projectPaths } from "../project.mjs";
import { ms } from "../timeline.mjs";

/** @typedef {import('../timeline.mjs').Word} Word */
/** @typedef {import('../types.mjs').MediaRef} MediaRef */

/** Whisper models `hyperframes transcribe` accepts (bigger = slower, more accurate). */
export const WHISPER_MODELS = /** @type {const} */ (["tiny.en", "base.en", "small.en", "medium.en", "large-v3"]);
/** @typedef {typeof WHISPER_MODELS[number]} WhisperModel */

/** Transcript file formats loadTranscript understands. */
export const TRANSCRIPT_FORMATS = /** @type {const} */ ([".json", ".srt", ".vtt"]);

/** Shortest a word may last (s); zero-length ASR words would never highlight. */
const MIN_WORD = 0.04;

/**
 * Parse transcript text. Pure.
 *
 * JSON shapes accepted: `[{ text|word, start, end }]` (HyperFrames / whisper
 * word lists), `{ words: [...] }`, and `{ segments: [{ text, start, end, words? }] }`
 * (OpenAI verbose_json, whisperX). `startMs`/`endMs` (milliseconds) work too.
 * SRT/VTT cues have no word timing, so each cue's span is shared out across its
 * words in proportion to their length.
 * @param {string} source
 * @param {'json'|'srt'|'vtt'} format
 * @returns {Word[]}
 */
export function parseTranscript(source, format) {
  if (format === "json") {
    let data;
    try {
      data = JSON.parse(source);
    } catch (cause) {
      throw new ReelclawError(`transcript is not valid JSON: ${/** @type {Error} */ (cause).message}`);
    }
    return normalizeWords(jsonWords(data));
  }
  return normalizeWords(parseCues(source).flatMap((c) => spreadWords(c.text, c.start, c.end)));
}

/**
 * @param {unknown} data
 * @returns {Word[]}
 */
function jsonWords(data) {
  const obj = /** @type {any} */ (data);
  if (Array.isArray(obj)) return obj.map(toWord);
  if (obj && Array.isArray(obj.words)) return obj.words.map(toWord);
  if (obj && Array.isArray(obj.segments)) {
    return obj.segments.flatMap((/** @type {any} */ s) => {
      if (Array.isArray(s.words) && s.words.length) return s.words.map(toWord);
      const seg = toWord(s);
      return spreadWords(seg.text, seg.start, seg.end);
    });
  }
  throw new ReelclawError("transcript JSON has no words", {
    hint: 'use [{ "text": "hello", "start": 0.1, "end": 0.4 }, …], { "words": [...] } or { "segments": [...] }',
  });
}

/** @param {any} w @returns {Word} */
function toWord(w) {
  const text = String(w?.text ?? w?.word ?? "").trim();
  const start = w?.start ?? (w?.startMs ?? w?.start_ms) / 1000;
  const end = w?.end ?? (w?.endMs ?? w?.end_ms) / 1000;
  if (!Number.isFinite(Number(start)) || !Number.isFinite(Number(end))) {
    throw new ReelclawError(`transcript word ${JSON.stringify(w)} needs numeric start and end (seconds)`);
  }
  return { text, start: Number(start), end: Number(end) };
}

/**
 * SRT / WebVTT cues. Pure.
 * @param {string} source
 * @returns {{ start: number, end: number, text: string }[]}
 */
export function parseCues(source) {
  const cues = [];
  for (const block of source.replace(/\r/g, "").split(/\n\s*\n/)) {
    const lines = block.split("\n");
    const at = lines.findIndex((l) => l.includes("-->"));
    if (at < 0) continue;
    const [a, b] = lines[at].split("-->").map((s) => parseTimecode(s.trim().split(/\s+/)[0]));
    const text = lines.slice(at + 1).join(" ").replace(/<[^>]+>/g, "").trim();
    if (text && Number.isFinite(a) && Number.isFinite(b)) cues.push({ start: a, end: b, text });
  }
  return cues;
}

/**
 * "01:02:03,450" | "02:03.450" | "3.45" → seconds (NaN when unreadable). Pure.
 * @param {string} s
 */
export function parseTimecode(s) {
  const parts = s.replace(",", ".").split(":").map(Number);
  if (!parts.length || parts.some((p) => !Number.isFinite(p))) return NaN;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

/**
 * Share [start, end) across the words of `text`, weighted by length.
 * @param {string} text
 * @param {number} start
 * @param {number} end
 * @returns {Word[]}
 */
function spreadWords(text, start, end) {
  const words = text.split(/\s+/).filter(Boolean);
  const total = words.reduce((n, w) => n + w.length + 1, 0);
  let t = start;
  return words.map((w) => {
    const d = ((end - start) * (w.length + 1)) / total;
    const word = { text: w, start: ms(t), end: ms(t + d) };
    t += d;
    return word;
  });
}

/**
 * Sort, drop empty words, enforce a minimum length and remove overlaps. Pure.
 * @param {Word[]} words
 * @returns {Word[]}
 */
export function normalizeWords(words) {
  const sorted = words.filter((w) => w.text.trim()).sort((a, b) => a.start - b.start);
  return sorted.map((w, i) => {
    const next = sorted[i + 1];
    const start = Math.max(0, w.start);
    let end = Math.max(w.end, start + MIN_WORD);
    if (next && end > next.start) end = Math.max(start + MIN_WORD / 2, next.start);
    return { text: w.text.trim(), start: ms(start), end: ms(end) };
  });
}

/**
 * Display form of a spoken word: drops trailing `. , ; :` (captions read
 * cleaner without them) but keeps `? !`, then applies the case. Pure.
 * @param {string} text
 * @param {'upper'|'lower'|'as-spoken'} [letterCase]
 */
export function cleanWord(text, letterCase = "as-spoken") {
  const t = text.trim().replace(/^["“”'‘]+|["“”'‘]+$/g, "").replace(/(?<=\S)[.,;:]+$/, "");
  return letterCase === "upper" ? t.toUpperCase() : letterCase === "lower" ? t.toLowerCase() : t;
}

/**
 * Read a transcript file. Relative paths are tried against each of `bases`.
 * @param {string} file
 * @param {{ bases?: string[] }} [o]
 * @returns {Promise<Word[]>}
 */
export async function loadTranscript(file, { bases = [process.cwd()] } = {}) {
  const candidates = isAbsolute(file) ? [file] : bases.map((b) => resolve(b, file));
  const path = candidates.find((p) => existsSync(p));
  if (!path) throw new ReelclawError(`transcript not found: ${file}`, { hint: `looked in ${candidates.join(", ")}` });
  const ext = extname(path).toLowerCase();
  if (!(/** @type {readonly string[]} */ (TRANSCRIPT_FORMATS).includes(ext))) {
    throw new ReelclawError(`transcript ${file}: unsupported format "${ext || "no extension"}"`, { hint: `use ${TRANSCRIPT_FORMATS.join(", ")}` });
  }
  const words = parseTranscript(await readFile(path, "utf8"), /** @type {'json'|'srt'|'vtt'} */ (ext.slice(1)));
  if (!words.length) throw new ReelclawError(`transcript ${file} contains no words`);
  return words;
}

/**
 * Word-level transcript of a staged clip via `hyperframes transcribe`, cached as
 * `assets/<clip>.words-<model>[-<lang>].json` (edit that file to fix a word).
 * The first run downloads the whisper runtime + model (~75MB tiny.en … ~470MB small.en).
 * @param {object} o
 * @param {string} o.root
 * @param {MediaRef} o.from  staged video/audio with an audio stream
 * @param {(args: string[]) => Promise<void>} o.hyperframes  PrepareContext.hyperframes
 * @param {WhisperModel} [o.model]  default "small.en"
 * @param {string} [o.language]     e.g. "es"; picks the multilingual model
 * @param {{ step: (m: string) => void }} [o.log]
 * @returns {Promise<{ words: Word[], file: string }>} `file` is the cache, relative to the project
 */
export async function transcribeMedia({ root, from, hyperframes, model = "small.en", language, log }) {
  if (!from.hasAudio) {
    throw new ReelclawError(`${from.label} has no audio track to transcribe`, { hint: "pass a clip with speech, or a word-timed --transcript file (.json/.srt/.vtt)" });
  }
  const paths = projectPaths(root);
  const stem = basename(from.src, extname(from.src));
  const name = `${stem}.words-${model.replace(/\./g, "-")}${language ? `-${language.toLowerCase()}` : ""}.json`;
  const cache = join(paths.assets, name);
  if (existsSync(cache)) return { words: parseTranscript(await readFile(cache, "utf8"), "json"), file: `assets/${name}` };

  log?.step(`transcribing ${from.label} (whisper ${model}; first run downloads the model)…`);
  // its own folder: `transcribe` writes transcript.json there and patches any .html it finds
  const tmp = join(paths.cache, "tmp", `transcribe-${randomUUID()}`);
  await mkdir(tmp, { recursive: true });
  try {
    await hyperframes(["transcribe", from.path, "--dir", tmp, "--model", model, ...(language ? ["--language", language] : [])]);
    const out = join(tmp, "transcript.json");
    if (!existsSync(out)) throw new ReelclawError(`hyperframes transcribe wrote no transcript for ${from.label}`);
    const words = parseTranscript(await readFile(out, "utf8"), "json");
    const partial = `${cache}.${randomUUID()}.partial`;
    await writeFile(partial, `${JSON.stringify(words, null, 1)}\n`);
    await rename(partial, cache);
    return { words, file: `assets/${name}` };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
