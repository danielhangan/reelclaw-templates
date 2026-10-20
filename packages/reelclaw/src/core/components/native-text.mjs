// @ts-check
/**
 * nativeText — TikTok's in-app "text with background" look: one rounded box
 * per line, merged into a single soft shape where lines touch (the inner
 * corners fill in, like the app). Black text on white by default.
 *
 *   nativeText("pov: you finally found an app that…", { id: "card", start: 0, duration: 6 })
 *
 * How: the text is drawn twice in one grid cell — a background copy whose
 * per-line boxes go through an SVG "goo" filter (blur + alpha threshold), and
 * a crisp foreground copy on top. Both copies live in one `.rc-cap-text`, so
 * the caption auto-fit runtime (captions.mjs) sizes them together: walls of
 * text shrink to fit their region exactly like `caption()`.
 *
 * Static by default (RULES.md §3). Returns an `html()` clip.
 */
import { CAPTION_DEFAULTS, REGION_PADDING } from "../captions.mjs";
import { attr, text as escapeText } from "../escape.mjs";
import { ReelclawError } from "../errors.mjs";
import { SAFE_BAND, isInside } from "../geometry.mjs";
import { html } from "../timeline.mjs";

/** @typedef {import('../geometry.mjs').Box} Box */
/** @typedef {import('../captions.mjs').CaptionPosition} CaptionPosition */

/**
 * Built-in looks. `box` is the background colour, `ink` the text colour,
 * `opacity` applies to the merged background shape.
 * @type {Readonly<Record<string, { box: string, ink: string, opacity: number }>>}
 */
export const NATIVE_TEXT_THEMES = Object.freeze({
  white: { box: "#ffffff", ink: "#000000", opacity: 1 },
  dark: { box: "#000000", ink: "#ffffff", opacity: 0.72 },
  black: { box: "#000000", ink: "#ffffff", opacity: 1 },
  red: { box: "#fe2c55", ink: "#ffffff", opacity: 1 },
  yellow: { box: "#ffe500", ink: "#000000", opacity: 1 },
});

/** @typedef {keyof typeof NATIVE_TEXT_THEMES} NativeTextTheme */

/**
 * @typedef {object} NativeTextOptions
 * @property {string} [id]
 * @property {number} start
 * @property {number} duration
 * @property {Box} [region]              box the text must fit in (default: the safe band)
 * @property {CaptionPosition} [position] vertical alignment inside the region (default "center")
 * @property {'center'|'left'} [align]   text alignment (default "center", like the app)
 * @property {number} [size]             base font size px (default 50); long text shrinks
 * @property {number} [minSize]          shrink floor px (default 26)
 * @property {number} [maxHeight]        default region.h - 50
 * @property {NativeTextTheme | { box: string, ink: string, opacity?: number }} [theme] default "white"
 * @property {number} [weight]           font weight (default 600, TikTok's "Classic")
 * @property {boolean} [unsafe]          allow a region outside the safe band
 */

/**
 * @param {string} text  newlines are kept
 * @param {NativeTextOptions} o
 */
export function nativeText(text, o) {
  if (!text.trim()) throw new ReelclawError(`nativeText${o.id ? ` "${o.id}"` : ""}: empty text`);
  const region = o.region ?? { ...SAFE_BAND };
  if (!o.unsafe && !isInside(region, SAFE_BAND, 1)) {
    throw new ReelclawError(`nativeText${o.id ? ` "${o.id}"` : ""}: region ${JSON.stringify(region)} leaves the safe band (x 180–900, y 220–1420)`, {
      hint: "keep text inside SAFE_BAND, or pass unsafe: true for a deliberate placement",
    });
  }
  const theme = typeof o.theme === "object" ? { opacity: 1, ...o.theme } : NATIVE_TEXT_THEMES[o.theme ?? "white"];
  if (!theme) throw new ReelclawError(`nativeText: unknown theme "${o.theme}" (use ${Object.keys(NATIVE_TEXT_THEMES).join(", ")} or { box, ink })`);
  const id = o.id ?? `ntext-${Math.round(o.start * 1000)}`;
  const size = o.size ?? 50;
  const minSize = o.minSize ?? CAPTION_DEFAULTS.minSize;
  const maxHeight = o.maxHeight ?? Math.max(40, region.h - REGION_PADDING);

  return html({
    id,
    start: o.start,
    duration: o.duration,
    box: region,
    css: NATIVE_TEXT_CSS,
    html: [
      `<div id="${id}-cap" class="rc-cap rc-nt" data-pos="${o.position ?? "center"}" data-size="${size}" data-min-size="${minSize}" data-max-h="${maxHeight}"`,
      ` style="left: 0; top: 0; width: ${Math.round(region.w)}px; height: ${Math.round(region.h)}px; text-align: ${o.align ?? "center"};">`,
      nativeTextMarkup(text, { id, size, theme, weight: o.weight }),
      `</div>`,
    ].join(""),
  });
}

/**
 * The inside of a native-text caption: the goo filter plus the text drawn twice
 * (merged background boxes, crisp text on top) in one `.rc-cap-text` (id
 * `<id>-text`) so the caption fit runtime sizes both. Shared with caption()'s
 * `tiktok-box` / `tiktok-box-dark` styles; the container needs class `rc-nt`.
 * @param {string} text
 * @param {{ id: string, size: number, theme: { box: string, ink: string, opacity: number }, weight?: number }} o
 */
export function nativeTextMarkup(text, { id, size, theme, weight = 600 }) {
  // one box run per paragraph, so blank lines stay empty (no bridge between paragraphs)
  const paragraphs = text.trim().split(/\n\s*\n/).map((p) => escapeText(p.trim()));
  const runs = (/** @type {string} */ style) => paragraphs.map((p) => `<span${style}>${p}</span>`).join("\n\n");
  const goo = `${id}-goo`;
  return [
    `<svg class="rc-nt-defs" width="0" height="0" aria-hidden="true"><filter id="${goo}" color-interpolation-filters="sRGB">`,
    `<feGaussianBlur in="SourceGraphic" stdDeviation="${GOO_BLUR}" result="b" />`,
    `<feColorMatrix in="b" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -11" /></filter></svg>`,
    `<p id="${id}-text" class="rc-cap-text rc-nt-text" style="font-size: ${size}px; font-weight: ${weight};">`,
    `<span class="rc-nt-bg" style="filter: url(#${goo}); opacity: ${theme.opacity};">${runs(` style="background: ${attr(theme.box)};"`)}</span>`,
    `<span class="rc-nt-fg" style="color: ${attr(theme.ink)};">${runs("")}</span>`,
    `</p>`,
  ].join("");
}

/** Blur radius (px) of the goo filter: ≈ the corner radius of the merged boxes. */
const GOO_BLUR = 7;

/** Shared by every nativeText clip (identical, so duplicates are harmless). */
export const NATIVE_TEXT_CSS = `/* nativeText(): TikTok in-app text with background */
.rc-html:has(> .rc-nt) { overflow: visible; }
.rc-nt-defs { position: absolute; width: 0; height: 0; }
.rc-nt .rc-nt-text { display: grid; line-height: 1.34; letter-spacing: 0; padding: 0.16em 0.42em; }
.rc-nt .rc-nt-text > span { grid-area: 1 / 1; }
.rc-nt .rc-nt-bg { color: transparent; }
.rc-nt .rc-nt-fg { position: relative; } /* the filtered background is a stacking context: keep the text above it */
.rc-nt .rc-nt-text > span > span { padding: 0.08em 0.36em; -webkit-box-decoration-break: clone; box-decoration-break: clone; }`;
