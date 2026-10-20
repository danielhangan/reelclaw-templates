// @ts-check
/**
 * Step captions for no-yapping: parse `--step` values and lay them out in time.
 *
 *   "go to claude"            sequential, default length
 *   "paste ur script :: 4"    sequential, 4s
 *   "buy now :: 10-15"        absolute window, reel seconds 10 → 15
 *
 * Sequential steps start at the split and run back to back (an absolute window
 * moves the cursor to its end). The last step, when sequential, holds to the end
 * of the reel — that's the payoff line. Pure: no I/O, unit-tested in
 * packages/reelclaw/test/templates/no-yapping.test.mjs.
 */
import { fail, ms } from "reelclaw";

/** @typedef {{ text: string, secs?: number } | { text: string, at: number, until: number }} Step */
/** @typedef {{ text: string, start: number, duration: number, step: number }} PlacedStep */

const NUMBER = /^\d+(?:\.\d+)?$/;
const RANGE = /^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/;

/**
 * Parse one `--step` value. The timing goes after the last `::`.
 * @param {string} raw
 * @param {number} n 1-based position, for error messages
 * @returns {Step}
 */
export function parseStep(raw, n) {
  const cut = raw.lastIndexOf("::");
  if (cut === -1) return { text: raw.trim() || emptyStep(n) };
  const text = raw.slice(0, cut).trim() || emptyStep(n);
  const time = raw.slice(cut + 2).trim();
  if (!time) return { text };
  if (NUMBER.test(time)) {
    const secs = Number(time);
    if (secs <= 0) fail(`--step ${n} ("${text}"): length must be > 0`, `e.g. --step "${text} :: 3"`);
    return { text, secs };
  }
  const range = RANGE.exec(time);
  if (!range) {
    fail(
      `--step ${n} ("${text}"): can't read the timing "${time}"`,
      `use "${text} :: 4" for a 4s step, or "${text} :: 10-15" to show it from second 10 to 15 of the reel`,
    );
  }
  const at = Number(range[1]);
  const until = Number(range[2]);
  if (until <= at) fail(`--step ${n} ("${text}"): window ${at}-${until} ends before it starts`, `use start-end with end > start, e.g. "${text} :: ${at}-${at + 3}"`);
  return { text, at, until };
}

/**
 * Lay steps out in time. Steps that would start after the reel ends are dropped
 * (with a warning); when two steps overlap, the earlier one is cut where the
 * next begins so captions never stack on the seam.
 *
 * @param {Step[]} steps
 * @param {object} o
 * @param {number} o.from  where sequential steps start (the split)
 * @param {number} o.end   reel length
 * @param {number} [o.secs] default length of a sequential step; when omitted the
 *   split is shared evenly between sequential steps without an explicit length
 *   (at least `o.minSecs`)
 * @param {number} [o.minSecs] floor for the shared length, default 1.5
 * @param {(message: string) => void} [o.warn]
 * @returns {PlacedStep[]}
 */
export function scheduleSteps(steps, { from, end, secs, minSecs = 1.5, warn = () => {} }) {
  const fallback = secs ?? sharedLength(steps, end - from, minSecs);
  /** @type {PlacedStep[]} */
  const placed = [];
  let cursor = from;
  steps.forEach((s, i) => {
    const isLast = i === steps.length - 1;
    const start = "at" in s ? s.at : cursor;
    if (start >= end - 0.05) {
      warn(`step ${i + 1} ("${s.text}") would start at ${ms(start)}s, after the reel ends (${ms(end)}s) — dropped; shorten earlier steps or use --demo-secs`);
      return; // a dropped step doesn't move the cursor
    }
    const stop = "at" in s ? Math.min(s.until, end) : isLast ? end : Math.min(cursor + (s.secs ?? fallback), end);
    cursor = "at" in s ? s.until : stop;
    placed.push({ text: s.text, start: ms(start), duration: ms(stop - start), step: i + 1 });
  });
  return trimOverlaps(placed, warn);
}

/**
 * @param {Step[]} steps
 * @param {number} span
 * @param {number} minSecs
 */
function sharedLength(steps, span, minSecs) {
  const sequential = steps.filter((s) => !("at" in s));
  const open = sequential.filter((s) => !("secs" in s) || s.secs === undefined);
  if (!open.length) return minSecs;
  const fixed = sequential.reduce((sum, s) => sum + ("secs" in s && s.secs ? s.secs : 0), 0);
  return Math.max(minSecs, ms((span - fixed) / open.length));
}

/**
 * @param {PlacedStep[]} placed
 * @param {(message: string) => void} warn
 */
function trimOverlaps(placed, warn) {
  const sorted = [...placed].sort((a, b) => a.start - b.start || a.step - b.step);
  return sorted.flatMap((p, i) => {
    const next = sorted[i + 1];
    if (!next || p.start + p.duration <= next.start + 0.001) return [p];
    const duration = ms(next.start - p.start);
    if (duration < 0.1) {
      warn(`step ${p.step} ("${p.text}") is fully covered by step ${next.step} — dropped`);
      return [];
    }
    return [{ ...p, duration }];
  });
}

/** @param {number} n @returns {never} */
function emptyStep(n) {
  return fail(`--step ${n} has no caption text`, 'write it as --step "caption" or --step "caption :: 3"');
}
