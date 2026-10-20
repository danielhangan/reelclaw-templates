// @ts-check
/**
 * Canvas, safe zones and layout boxes. All units are canvas pixels on the
 * 1080x1920 frame; see RULES.md §1 and §4.
 */

/** @typedef {{ x: number, y: number, w: number, h: number }} Box */

/** Output canvas: 9:16 portrait at 30fps. */
export const CANVAS = Object.freeze({ width: 1080, height: 1920, fps: 30 });

/**
 * Pixels of platform UI on each edge (worst case of TikTok + IG Reels + Shorts).
 * Text must stay inside the band left over: RULES.md §4.
 */
export const SAFE_ZONE = Object.freeze({ top: 220, bottom: 500, left: 180, right: 180 });

/** The cross-platform text band: 720x1200 at (180, 220). */
export const SAFE_BAND = Object.freeze(
  /** @type {Box} */ ({
    x: SAFE_ZONE.left,
    y: SAFE_ZONE.top,
    w: CANVAS.width - SAFE_ZONE.left - SAFE_ZONE.right,
    h: CANVAS.height - SAFE_ZONE.top - SAFE_ZONE.bottom,
  }),
);

/** @typedef {'top-left'|'top-center'|'top-right'|'center-left'|'center'|'center-right'|'bottom-left'|'bottom-center'|'bottom-right'} Anchor */

/** @type {readonly Anchor[]} */
export const ANCHORS = Object.freeze([
  "top-left", "top-center", "top-right",
  "center-left", "center", "center-right",
  "bottom-left", "bottom-center", "bottom-right",
]);

/**
 * Place a w×h box on the canvas at an anchor, inset by `margin` from the edges.
 * @param {number} w
 * @param {number} h
 * @param {Anchor} anchor
 * @param {number} [margin]
 * @returns {Box}
 */
export function place(w, h, anchor, margin = 0) {
  const [v, hz = "center"] = anchor === "center" ? ["center", "center"] : anchor.split("-");
  const x = hz === "left" ? margin : hz === "right" ? CANVAS.width - w - margin : (CANVAS.width - w) / 2;
  const y = v === "top" ? margin : v === "bottom" ? CANVAS.height - h - margin : (CANVAS.height - h) / 2;
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/** Common layout boxes. Functions so templates can't mutate shared objects. */
export const layout = {
  /** @returns {Box} the whole frame */
  full: () => ({ x: 0, y: 0, w: CANVAS.width, h: CANVAS.height }),
  /** @returns {Box} the cross-platform text band */
  safe: () => ({ ...SAFE_BAND }),
  /**
   * Horizontal split: the top `ratio` of the frame and the rest.
   * @param {number} [ratio] 0..1, default 0.5
   * @returns {{ top: Box, bottom: Box }}
   */
  split(ratio = 0.5) {
    const cut = Math.round(CANVAS.height * ratio);
    return {
      top: { x: 0, y: 0, w: CANVAS.width, h: cut },
      bottom: { x: 0, y: cut, w: CANVAS.width, h: CANVAS.height - cut },
    };
  },
  /**
   * Picture-in-picture box sized by width (% of canvas width) and aspect (w/h).
   * @param {{ anchor?: Anchor, widthPct?: number, aspect?: number, margin?: number }} [o]
   * @returns {Box}
   */
  pip({ anchor = "bottom-right", widthPct = 35, aspect = 9 / 16, margin = 40 } = {}) {
    const w = (CANVAS.width * widthPct) / 100;
    return place(w, w / aspect, anchor, margin);
  },
  /**
   * A horizontal strip centred on y (e.g. a caption straddling a split seam).
   * @param {number} centerY
   * @param {number} height
   * @param {{ x?: number, w?: number }} [o] defaults to the safe band's horizontal extent
   * @returns {Box}
   */
  band(centerY, height, { x = SAFE_BAND.x, w = SAFE_BAND.w } = {}) {
    return { x, y: Math.round(centerY - height / 2), w, h: height };
  },
};

/**
 * True when `inner` lies fully inside `outer` (with `tolerance` px of slack).
 * @param {Box} inner
 * @param {Box} outer
 * @param {number} [tolerance]
 */
export function isInside(inner, outer, tolerance = 0) {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.w <= outer.x + outer.w + tolerance &&
    inner.y + inner.h <= outer.y + outer.h + tolerance
  );
}

/**
 * True when two boxes overlap by more than `slack` px on both axes.
 * @param {Box} a
 * @param {Box} b
 * @param {number} [slack]
 */
export function overlaps(a, b, slack = 0) {
  return (
    a.x + slack < b.x + b.w && a.x + a.w - slack > b.x &&
    a.y + slack < b.y + b.h && a.y + a.h - slack > b.y
  );
}
