// @ts-check
/**
 * Pacing helpers for text-driven formats: how long on-screen text needs, and
 * the `"text :: secs"` suffix that lets one list entry carry its own duration.
 */
import { ms } from "../timeline.mjs";

/**
 * Comfortable seconds to read `text` once on a phone: ~4 words/s plus a
 * 0.6s settle, clamped to [min, max]. Pure.
 * @param {string} text
 * @param {{ wordsPerSecond?: number, min?: number, max?: number }} [o]
 */
export function readingSeconds(text, { wordsPerSecond = 4, min = 1.5, max = 12 } = {}) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return ms(Math.min(max, Math.max(min, words / wordsPerSecond + 0.6)));
}

/**
 * Split `"perplexity :: 4"` into `{ text: "perplexity", secs: 4 }`. Without a
 * valid suffix `secs` is undefined and the text is returned trimmed. Pure.
 * @param {string} entry
 * @returns {{ text: string, secs?: number }}
 */
export function splitTimed(entry) {
  const m = /^([\s\S]*?)\s*::\s*(\d+(?:\.\d+)?)\s*s?\s*$/.exec(entry);
  if (!m) return { text: entry.trim() };
  const secs = Number(m[2]);
  return secs > 0 ? { text: m[1].trim(), secs } : { text: m[1].trim() };
}

/**
 * Clamp a number into [min, max].
 * @param {number} n
 * @param {number} min
 * @param {number} max
 */
export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
