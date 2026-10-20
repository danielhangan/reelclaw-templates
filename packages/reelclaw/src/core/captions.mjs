// @ts-check
/**
 * Caption styles, positions and the auto-fit runtime (RULES.md §2, §3, §5).
 *
 * Captions are static by default: full visibility on their first frame, gone
 * after their last. Text auto-shrinks from `size` in 2px steps (floor `minSize`)
 * until it fits its region — measured in the browser with the real font, so
 * long "wall of text" hooks are fine.
 */

/**
 * Static caption looks. Word-by-word captions are a component: karaokeCaptions().
 * @typedef {'tiktok-outline'|'tiktok-box'|'tiktok-box-dark'|'plain'} CaptionStyle
 */
/** @typedef {'top'|'center'|'bottom'} CaptionPosition */

/** Default base font size (px) and the shrink floor, per RULES.md §5. */
export const CAPTION_DEFAULTS = Object.freeze({ size: 58, minSize: 26, step: 2, highlight: "#ffe500" });

/** Vertical slack kept free inside a region so strokes/shadows never touch its edge. */
export const REGION_PADDING = 50;

/** @type {readonly CaptionStyle[]} */
export const CAPTION_STYLES = Object.freeze(["tiktok-outline", "tiktok-box", "tiktok-box-dark", "plain"]);

/** @type {readonly CaptionPosition[]} */
export const CAPTION_POSITIONS = Object.freeze(["top", "center", "bottom"]);

/**
 * Largest font size in `base, base-step, …` (never below `min`) for which `fits(size)` is true.
 * Pure — the same function is serialized into every composition (see CAPTION_RUNTIME).
 * @param {number} base
 * @param {number} min
 * @param {number} step
 * @param {(size: number) => boolean} fits
 * @returns {number}
 */
export function fitFontSize(base, min, step, fits) {
  let size = Math.max(base, min);
  while (size > min && !fits(size)) size = Math.max(min, size - step);
  return size;
}

/**
 * Browser-side: fit every `.rc-cap` caption. Each caption is measured on an
 * off-screen clone, so captions whose time window has not started yet (and are
 * therefore hidden by the runtime) still get the right size.
 * Serialized with Function#toString — keep it self-contained (only fitFontSize).
 */
/* c8 ignore start */
function fitCaptions() {
  const caps = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll(".rc-cap"));
  caps.forEach((cap) => {
    const probe = /** @type {HTMLElement} */ (cap.cloneNode(true));
    probe.removeAttribute("id");
    probe.classList.remove("clip");
    for (const a of ["data-start", "data-duration", "data-track-index"]) probe.removeAttribute(a);
    probe.style.visibility = "hidden";
    probe.style.display = "flex";
    probe.style.left = "-20000px";
    document.body.appendChild(probe);
    const text = /** @type {HTMLElement} */ (probe.querySelector(".rc-cap-text"));
    const maxH = Number(cap.dataset.maxH);
    const maxW = probe.clientWidth;
    const size = fitFontSize(Number(cap.dataset.size), Number(cap.dataset.minSize), 2, (s) => {
      text.style.fontSize = s + "px";
      return text.getBoundingClientRect().height <= maxH && text.scrollWidth <= maxW + 1;
    });
    probe.remove();
    const target = /** @type {HTMLElement} */ (cap.querySelector(".rc-cap-text"));
    target.style.fontSize = size + "px";
  });
}
/* c8 ignore stop */

/** Inline script that fits captions now and again once the font has loaded. */
export const CAPTION_RUNTIME = [
  "(function () {",
  fitFontSize.toString(),
  fitCaptions.toString(),
  "fitCaptions();",
  "if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitCaptions);",
  "})();",
].join("\n");

/** CSS shared by every caption plus one block per style. */
export const CAPTION_CSS = `
      .rc-cap { position: absolute; display: flex; flex-direction: column; text-align: center; }
      .rc-cap[data-pos="top"] { justify-content: flex-start; }
      .rc-cap[data-pos="center"] { justify-content: center; }
      .rc-cap[data-pos="bottom"] { justify-content: flex-end; }
      .rc-cap-text {
        margin: 0;
        font-family: "TikTok Sans", sans-serif;
        font-weight: 700;
        line-height: 1.4;
        letter-spacing: -0.5px;
        white-space: pre-line;
        overflow-wrap: break-word;
      }
      /* classic TikTok caption: white fill, black outline, no pill (RULES.md §2) */
      .rc-cap--tiktok-outline .rc-cap-text {
        color: #fff;
        paint-order: stroke fill;
        -webkit-text-stroke: 0.14em #000;
        text-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
      }
      /* tiktok-box / tiktok-box-dark: TikTok's native merged text boxes (NATIVE_TEXT_CSS, components/native-text.mjs) */
      /* white text with a soft shadow, for busy footage where outlines feel heavy */
      .rc-cap--plain .rc-cap-text { color: #fff; text-shadow: 0 2px 6px rgba(0, 0, 0, 0.7), 0 0 2px rgba(0, 0, 0, 0.9); }
`;
