// @ts-check
/**
 * wipeReveal — reveal one clip over whatever is under it with a moving edge
 * (the before → after "swipe"). Tweens `clip-path` on the target element and
 * slides a white divider bar with a handle along the edge.
 *
 *   video(after, { id: "after", start: 3, crop: focusCrop(after, box) }),
 *   wipeReveal({ target: "after", box, at: 3, duration: 0.7 }),
 *
 * Seek-safe: one fromTo per element on the paused timeline, so the target is
 * fully hidden before `at` and fully shown after `at + duration` at any seek.
 * The target must be ONE element carrying that id: an image(), or a video()
 * with `crop` or `motion` (those get a wrapper element). Don't put a scale
 * motion on the target during the wipe — the mask would scale with it.
 */
import { ReelclawError } from "../errors.mjs";
import { html, ms } from "../timeline.mjs";

/** @typedef {import('../geometry.mjs').Box} Box */
/** @typedef {import('../timeline.mjs').HtmlClip} HtmlClip */

/** Direction the edge travels: "right" = revealed from the left edge towards the right. */
export const WIPE_DIRECTIONS = /** @type {const} */ (["right", "left", "down", "up"]);
/** @typedef {typeof WIPE_DIRECTIONS[number]} WipeDirection */

/** clip-path insets (top right bottom left) that hide the target before the wipe. */
const HIDDEN = {
  right: "inset(0% 100% 0% 0%)",
  left: "inset(0% 0% 0% 100%)",
  down: "inset(0% 0% 100% 0%)",
  up: "inset(100% 0% 0% 0%)",
};
const SHOWN = "inset(0% 0% 0% 0%)";

/**
 * @param {object} o
 * @param {string} o.target        id of the clip to reveal
 * @param {Box} o.box              the target's box (the divider travels across it)
 * @param {number} o.at            reel seconds the wipe starts
 * @param {number} o.duration      seconds
 * @param {WipeDirection} [o.direction]  default "right"
 * @param {string} [o.ease]        GSAP ease (default "power2.inOut")
 * @param {boolean} [o.divider]    draw the bar + handle (default true)
 * @param {string} [o.id]          default `<target>-wipe`
 * @returns {HtmlClip}
 */
export function wipeReveal({ target, box, at, duration, direction = "right", ease = "power2.inOut", divider = true, id }) {
  if (!HIDDEN[direction]) throw new ReelclawError(`wipeReveal: unknown direction "${direction}" (use ${WIPE_DIRECTIONS.join(", ")})`);
  if (!(duration > 0)) throw new ReelclawError("wipeReveal: duration must be > 0");
  const horizontal = direction === "right" || direction === "left";
  // the bar moves by transform (x/y in px): layout properties like `left` snap to whole pixels and stutter
  const axis = horizontal ? "x" : "y";
  const span = Math.round(horizontal ? box.w : box.h);
  const [from, to] = direction === "right" || direction === "down" ? [0, span] : [span, 0];
  const tween = (/** @type {string} */ sel, /** @type {object} */ a, /** @type {object} */ b) =>
    `tl.fromTo(${sel}, ${JSON.stringify(a)}, ${JSON.stringify({ ...b, duration: ms(duration), ease })}, ${ms(at)});`;
  return html({
    id: id ?? `${target}-wipe`,
    start: ms(at),
    duration: ms(duration),
    box,
    css: WIPE_CSS,
    html: divider ? `<div class="rc-wipe-bar rc-wipe-bar--${horizontal ? "v" : "h"}"><div class="rc-wipe-handle"></div></div>` : "",
    script: [
      tween(JSON.stringify(`#${target}`), { clipPath: HIDDEN[direction] }, { clipPath: SHOWN }),
      divider ? tween('el.querySelector(".rc-wipe-bar")', { [axis]: from }, { [axis]: to }) : "",
    ].filter(Boolean).join("\n"),
  });
}

/** Identical for every wipe (duplicates are harmless). */
const WIPE_CSS = `/* wipeReveal(): divider bar + handle */
.rc-html:has(> .rc-wipe-bar) { overflow: visible; }
.rc-wipe-bar { position: absolute; background: #fff; box-shadow: 0 0 18px rgba(0, 0, 0, 0.45); }
.rc-wipe-bar--v { left: 0; top: 0; bottom: 0; width: 8px; margin-left: -4px; }
.rc-wipe-bar--h { top: 0; left: 0; right: 0; height: 8px; margin-top: -4px; }
.rc-wipe-handle { position: absolute; left: 50%; top: 50%; width: 84px; height: 84px; margin: -42px 0 0 -42px; border-radius: 50%; background: #fff; box-shadow: 0 4px 18px rgba(0, 0, 0, 0.4); }
.rc-wipe-handle::before, .rc-wipe-handle::after { content: ""; position: absolute; top: 50%; margin-top: -11px; border: 11px solid transparent; }
.rc-wipe-handle::before { left: 10px; border-right: 14px solid #111; border-left-width: 0; }
.rc-wipe-handle::after { right: 10px; border-left: 14px solid #111; border-right-width: 0; }
.rc-wipe-bar--h .rc-wipe-handle { transform: rotate(90deg); }`;
