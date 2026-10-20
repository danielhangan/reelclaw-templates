// @ts-check
/**
 * Speech pacing for talking-head formats, driven by a word-level transcript:
 * tighten long pauses (jump cuts), split at sentence starts for punch-in
 * zooms, and map source times (words, b-roll windows) onto the edited reel.
 *
 *   const ranges = speechRanges(words, { from: 0.4, to: 31.2, maxPause: 0.6 });
 *   const segments = layoutSegments(splitRanges(ranges, sentenceBreaks(words)), { zoom: 1.12 });
 *   segments.map((s) => video(clip, { start: s.at, trim: s.from, duration: s.to - s.from, ... }));
 *   karaokeCaptions(mapWords(words, segments));
 *
 * Everything here is pure. Times: `from`/`to` = source seconds, `at` = reel seconds.
 */
import { ms } from "../timeline.mjs";
import { parseTimecode } from "./transcript.mjs";

/** @typedef {import('../timeline.mjs').Word} Word */
/** @typedef {{ start: number, end: number }} Range */

/**
 * A piece of the source placed on the reel.
 * @typedef {object} Segment
 * @property {number} from   source seconds
 * @property {number} to     source seconds
 * @property {number} at     reel seconds where it starts
 * @property {number} zoom   1 = as framed; > 1 = punched in
 * @property {boolean} cut   true when footage jumps here (a pause was removed), so audio needs a tiny fade
 */

/**
 * Source ranges to keep from [from, to]: every pause between words longer
 * than `maxPause` is shortened to `2 × pad` (the words keep `pad` of air on each
 * side). `maxPause <= 0` keeps everything.
 * @param {Word[]} words  source-time words, sorted
 * @param {{ from: number, to: number, maxPause?: number, pad?: number }} o
 * @returns {Range[]}
 */
export function speechRanges(words, { from, to, maxPause = 0.6, pad = 0.15 }) {
  if (!(maxPause > 0)) return [{ start: ms(from), end: ms(to) }];
  /** @type {Range[]} */
  const out = [];
  let cur = from;
  for (let i = 0; i + 1 < words.length; i++) {
    const gapA = words[i].end;
    const gapB = words[i + 1].start;
    if (gapB - gapA <= Math.max(maxPause, 2 * pad)) continue;
    const a = Math.max(gapA + pad, from);
    const b = Math.min(gapB - pad, to);
    if (b <= a || a < cur) continue;
    if (a - cur >= 0.1) out.push({ start: ms(cur), end: ms(a) });
    cur = b;
  }
  if (to - cur >= 0.1) out.push({ start: ms(cur), end: ms(to) });
  return out;
}

/**
 * Source times between sentences (midpoint of the gap after a word ending in
 * . ? or !) — natural places for a punch-in zoom.
 * @param {Word[]} words
 * @returns {number[]}
 */
export function sentenceBreaks(words) {
  const out = [];
  for (let i = 0; i + 1 < words.length; i++) {
    if (/[.?!…]["”’']?$/.test(words[i].text)) out.push(ms((words[i].end + words[i + 1].start) / 2));
  }
  return out;
}

/**
 * Split ranges at `points` (source seconds), never leaving a piece shorter than `minLength`.
 * @param {Range[]} ranges
 * @param {number[]} points
 * @param {number} [minLength] default 1s — punch-ins faster than this feel jittery
 * @returns {Range[]}
 */
export function splitRanges(ranges, points, minLength = 1) {
  const sorted = [...points].sort((a, b) => a - b);
  return ranges.flatMap((r) => {
    /** @type {Range[]} */
    const pieces = [];
    let start = r.start;
    for (const p of sorted) {
      if (p - start >= minLength && r.end - p >= minLength) {
        pieces.push({ start: ms(start), end: ms(p) });
        start = p;
      }
    }
    pieces.push({ start: ms(start), end: ms(r.end) });
    return pieces;
  });
}

/**
 * Place ranges back to back on the reel. Zoom alternates 1, `zoom`, 1, …;
 * after a jump cut it always changes, which hides the jump (the classic edit).
 * @param {Range[]} ranges
 * @param {{ zoom?: number, at?: number }} [o]
 * @returns {Segment[]}
 */
export function layoutSegments(ranges, { zoom = 1, at = 0 } = {}) {
  let t = at;
  let zoomed = false;
  return ranges.map((r, i) => {
    if (i > 0) zoomed = !zoomed;
    const seg = { from: r.start, to: r.end, at: ms(t), zoom: zoomed ? zoom : 1, cut: i > 0 && Math.abs(r.start - ranges[i - 1].end) > 0.001 };
    t += r.end - r.start;
    return seg;
  });
}

/** Total reel length of segments. @param {Segment[]} segments */
export const segmentsLength = (segments) => (segments.length ? ms(segments[segments.length - 1].at + segments[segments.length - 1].to - segments[segments.length - 1].from) : 0);

/**
 * Reel time of a source time. Times inside a removed pause snap to the next
 * kept moment; times outside the kept span clamp to its ends.
 * @param {Segment[]} segments
 * @param {number} t
 */
export function toReel(segments, t) {
  for (const s of segments) {
    if (t < s.from) return s.at;
    if (t <= s.to) return ms(s.at + t - s.from);
  }
  return segmentsLength(segments);
}

/**
 * Words in reel time; words outside the kept footage are dropped.
 * @param {Word[]} words
 * @param {Segment[]} segments
 * @returns {Word[]}
 */
export function mapWords(words, segments) {
  if (!segments.length) return [];
  const first = segments[0].from;
  const last = segments[segments.length - 1].to;
  return words
    .filter((w) => w.end > first + 0.02 && w.start < last - 0.02)
    .map((w) => ({ text: w.text, start: toReel(segments, Math.max(w.start, first)), end: toReel(segments, Math.min(w.end, last)) }))
    .filter((w) => w.end > w.start);
}

/**
 * Parse a time window: "4.2-6", "0:04-0:06.5", "4.2+3" (start + length) or
 * "4.2" (start, `fallback` seconds long). Returns null when unreadable. Pure.
 * @param {string} s
 * @param {number} [fallback] default length for a bare start
 * @returns {Range | null}
 */
export function parseTimeRange(s, fallback = 2) {
  const m = /^\s*([\d:.,]+)\s*s?\s*(?:([-–+]|to)\s*([\d:.,]+)\s*s?)?\s*$/.exec(s);
  if (!m) return null;
  const start = parseTimecode(m[1]);
  const second = m[3] === undefined ? NaN : parseTimecode(m[3]);
  const end = m[2] === "+" ? start + second : m[2] ? second : start + fallback;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { start: ms(start), end: ms(end) };
}
