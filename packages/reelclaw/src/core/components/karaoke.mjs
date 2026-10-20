// @ts-check
/**
 * karaokeCaptions — word-by-word "auto captions" the way top talking-head
 * reels look: 1–4 words at a time, big heavy TikTok Sans, the spoken word lit
 * up as it is said.
 *
 *   karaokeCaptions(words, { region: karaokeRegion("lower"), style: "pop", end: reel.duration })
 *
 * `words` are `{ text, start, end }` in REEL seconds (map source times first,
 * e.g. with mapWords() from speech.mjs). Returns one html() clip per chunk, so
 * every chunk is its own timed element (`cap-1`, `cap-2`…) that an agent can
 * retime or retype in the generated HTML: each word is a
 * `<span class="rk-w" data-t0 data-t1>` and one tiny script turns
 * `data-on="1"` on during [t0, t1) — seek-safe `tl.set`s, no clocks.
 *
 * Chunk text auto-fits like caption() (it reuses the `.rc-cap` fit runtime).
 * Chunks appear and disappear instantly (RULES.md §3); only the highlight moves.
 */
import { CAPTION_DEFAULTS, REGION_PADDING } from "../captions.mjs";
import { attr, text as escapeText } from "../escape.mjs";
import { ReelclawError } from "../errors.mjs";
import { SAFE_BAND, isInside } from "../geometry.mjs";
import { html, ms } from "../timeline.mjs";
import { cleanWord } from "./transcript.mjs";

/** @typedef {import('../timeline.mjs').Word} Word */
/** @typedef {import('../timeline.mjs').HtmlClip} HtmlClip */
/** @typedef {import('../geometry.mjs').Box} Box */
/** @typedef {import('../captions.mjs').CaptionPosition} CaptionPosition */

/**
 * - `pop`   white + black outline, spoken word in the highlight colour and 8% bigger (default)
 * - `box`   white with a soft shadow, spoken word on a highlight-coloured rounded box
 * - `color` white + black outline, spoken word recoloured only (classic karaoke)
 */
export const KARAOKE_STYLES = /** @type {const} */ (["pop", "box", "color"]);
/** @typedef {typeof KARAOKE_STYLES[number]} KaraokeStyle */

export const LETTER_CASES = /** @type {const} */ (["upper", "lower", "as-spoken"]);
/** @typedef {typeof LETTER_CASES[number]} LetterCase */

/** Caption strips inside the safe band: under the chin (default), mid-frame, or up top. */
export const KARAOKE_REGIONS = Object.freeze({
  upper: Object.freeze({ x: SAFE_BAND.x, y: 300, w: SAFE_BAND.w, h: 360 }),
  center: Object.freeze({ x: SAFE_BAND.x, y: 640, w: SAFE_BAND.w, h: 360 }),
  lower: Object.freeze({ x: SAFE_BAND.x, y: 1010, w: SAFE_BAND.w, h: 360 }),
});

/** @param {keyof typeof KARAOKE_REGIONS} name @returns {Box} */
export const karaokeRegion = (name) => ({ ...KARAOKE_REGIONS[name] });

/**
 * Group words into on-screen chunks. A new chunk starts when the current one
 * has `maxWords`, would exceed `maxChars`, after a pause longer than `maxGap`,
 * or after punctuation (sentence or clause end). Pure.
 * @param {Word[]} words
 * @param {{ maxWords?: number, maxChars?: number, maxGap?: number }} [o]
 * @returns {Word[][]}
 */
export function chunkWords(words, { maxWords = 3, maxChars = 16, maxGap = 0.5 } = {}) {
  /** @type {Word[][]} */
  const chunks = [];
  /** @type {Word[]} */
  let cur = [];
  for (const w of words) {
    const prev = cur[cur.length - 1];
    const chars = cur.reduce((n, x) => n + x.text.length + 1, 0) + w.text.length;
    const split = prev && (
      cur.length >= maxWords || chars > maxChars || w.start - prev.end > maxGap || /[.?!…,;:]["”’']?$/.test(prev.text)
    );
    if (split) {
      chunks.push(cur);
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

/**
 * On-screen window of each chunk: from its first word until the next chunk
 * starts — or, across a longer pause, `hold` seconds after its last word (so
 * captions vanish during silence instead of lingering). Gaps shorter than
 * `bridge` are bridged so captions never flicker off between chunks. Pure.
 * @param {Word[][]} chunks
 * @param {{ hold?: number, bridge?: number, end?: number }} [o] `end` clips the last window (reel end)
 * @returns {{ start: number, end: number }[]}
 */
export function chunkWindows(chunks, { hold = 0.35, bridge = 0.5, end = Infinity } = {}) {
  return chunks.map((c, i) => {
    const start = c[0].start;
    const next = chunks[i + 1]?.[0].start ?? Infinity;
    const last = c[c.length - 1].end;
    const stop = next - last <= bridge ? next : Math.min(next, last + hold);
    return { start: ms(start), end: ms(Math.min(stop, end)) };
  });
}

/**
 * @typedef {object} KaraokeOptions
 * @property {string} [id]            id prefix: chunks are `<id>-1`, `<id>-2`… (default "cap")
 * @property {Box} [region]           strip the text fits in (default KARAOKE_REGIONS.lower)
 * @property {CaptionPosition} [position]  vertical alignment inside the region (default center)
 * @property {KaraokeStyle} [style]   default "pop"
 * @property {string} [highlight]     colour of the spoken word / its box (default #ffe500)
 * @property {number} [size]          base font size px (default 84); long chunks shrink
 * @property {number} [minSize]       shrink floor (default 40)
 * @property {LetterCase} [letterCase] default "upper"
 * @property {number} [maxWords]      words per chunk, 1–4 (default 3)
 * @property {number} [maxChars]      characters per chunk (default 16)
 * @property {number} [maxGap]        a pause longer than this starts a new chunk (default 0.5s)
 * @property {number} [hold]          seconds a chunk stays after its last word before a pause (default 0.35)
 * @property {number} [end]           reel end; later windows are clipped
 * @property {boolean} [unsafe]       allow a region outside the safe band
 */

/**
 * @param {Word[]} words  reel-time words
 * @param {KaraokeOptions} [o]
 * @returns {HtmlClip[]}
 */
export function karaokeCaptions(words, o = {}) {
  const region = o.region ?? karaokeRegion("lower");
  if (!o.unsafe && !isInside(region, SAFE_BAND, 1)) {
    throw new ReelclawError(`karaokeCaptions: region ${JSON.stringify(region)} leaves the safe band (x 180–900, y 220–1420)`, {
      hint: "use karaokeRegion('upper'|'center'|'lower'), or pass unsafe: true for a deliberate placement",
    });
  }
  const style = o.style ?? "pop";
  if (!KARAOKE_STYLES.includes(style)) throw new ReelclawError(`karaokeCaptions: unknown style "${style}" (use ${KARAOKE_STYLES.join(", ")})`);
  const highlight = o.highlight ?? CAPTION_DEFAULTS.highlight;
  const size = o.size ?? 84;
  const minSize = o.minSize ?? 40;
  const prefix = o.id ?? "cap";
  const letterCase = o.letterCase ?? "upper";

  // chunk on the raw words (punctuation drives the breaks), display the cleaned form
  const shown = words.filter((w) => cleanWord(w.text, letterCase));
  const chunks = chunkWords(shown, { maxWords: o.maxWords ?? 3, maxChars: o.maxChars ?? 16, maxGap: o.maxGap ?? 0.5 });
  const windows = chunkWindows(chunks, { hold: o.hold, end: o.end });
  const pad = 28; // room for the outline and the scaled-up spoken word
  const vars = `--rk-hl: ${attr(highlight)}; --rk-ink: ${inkOn(highlight)};`;

  /** @type {HtmlClip[]} */
  const clips = [];
  chunks.forEach((chunk, i) => {
    const win = windows[i];
    if (!(win.end - win.start > 0.02)) return;
    const spans = chunk.map((w, k) => {
      const t1 = k + 1 < chunk.length ? chunk[k + 1].start : win.end;
      return `<span class="rk-w" data-on="0" data-t0="${ms(w.start)}" data-t1="${ms(Math.max(t1, w.start + 0.02))}">${escapeText(cleanWord(w.text, letterCase))}</span>`;
    });
    clips.push(html({
      id: `${prefix}-${i + 1}`,
      start: win.start,
      duration: ms(win.end - win.start),
      box: region,
      css: clips.length ? "" : KARAOKE_CSS,
      html:
        `<div class="rc-cap rk rk--${style}" data-pos="${o.position ?? "center"}" data-size="${size}" data-min-size="${minSize}" data-max-h="${Math.max(40, region.h - REGION_PADDING)}"` +
        ` style="left: ${pad}px; top: 0; width: ${Math.round(region.w - 2 * pad)}px; height: ${Math.round(region.h)}px; ${vars}">` +
        `<p class="rc-cap-text" style="font-size: ${size}px">${spans.join(" ")}</p></div>`,
      script: KARAOKE_SCRIPT,
    }));
  });
  return clips;
}

/**
 * Black or white, whichever reads better on `color` (hex only; else black). Pure.
 * @param {string} color
 */
export function inkOn(color) {
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())?.[1];
  if (!hex) return "#000";
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? "#000" : "#fff";
}

/** Lights each word during [data-t0, data-t1). Same for every chunk; runs once at load. */
const KARAOKE_SCRIPT = `el.querySelectorAll(".rk-w").forEach(function (w) {
  tl.set(w, { attr: { "data-on": "1" } }, Number(w.dataset.t0));
  tl.set(w, { attr: { "data-on": "0" } }, Number(w.dataset.t1));
});`;

export const KARAOKE_CSS = `/* karaokeCaptions(): word-by-word captions */
.rc-html:has(> .rk) { overflow: visible; }
.rk .rc-cap-text { color: #fff; font-weight: 900; line-height: 1.12; letter-spacing: -0.01em; }
.rk .rk-w { display: inline-block; margin: 0 0.1em; transform-origin: 50% 60%; } /* outlines of neighbours must not merge, even when one word pops */
.rk--pop .rc-cap-text, .rk--color .rc-cap-text { paint-order: stroke fill; -webkit-text-stroke: 0.16em #000; text-shadow: 0 0.06em 0.2em rgba(0, 0, 0, 0.5); }
.rk--pop .rk-w[data-on="1"], .rk--color .rk-w[data-on="1"] { color: var(--rk-hl); }
.rk--pop .rk-w[data-on="1"] { transform: scale(1.08); }
.rk--box .rc-cap-text { text-shadow: 0 0.04em 0.16em rgba(0, 0, 0, 0.75), 0 0 0.04em rgba(0, 0, 0, 0.9); }
.rk--box .rk-w { border-radius: 0.14em; }
.rk--box .rk-w[data-on="1"] { background: var(--rk-hl); color: var(--rk-ink); box-shadow: 0 0 0 0.09em var(--rk-hl); text-shadow: none; }`;
