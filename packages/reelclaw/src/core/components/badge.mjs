// @ts-check
/**
 * numberBadge — a solid circle with a number ("1", "#2", "3/5"), the
 * consistent marker of list formats. Static (RULES.md §3); returns an html() clip.
 *
 *   numberBadge(1, { start: 2.5, duration: 3, center: { x: 540, y: 300 } })
 */
import { attr, text } from "../escape.mjs";
import { html } from "../timeline.mjs";

/**
 * @typedef {object} BadgeOptions
 * @property {string} [id]
 * @property {number} start
 * @property {number} duration
 * @property {{ x: number, y: number }} center  canvas px
 * @property {number} [size]   diameter px (default 116)
 * @property {string} [color]  fill (default TikTok red #fe2c55)
 * @property {string} [ink]    number colour (default #fff)
 */

/**
 * @param {number | string} label
 * @param {BadgeOptions} o
 */
export function numberBadge(label, o) {
  const size = o.size ?? 116;
  const value = String(label);
  // shrink long labels ("10", "3/5") so they stay inside the circle
  const font = Math.round(size * (value.length <= 1 ? 0.6 : value.length === 2 ? 0.5 : 0.36));
  return html({
    id: o.id,
    start: o.start,
    duration: o.duration,
    box: { x: Math.round(o.center.x - size / 2), y: Math.round(o.center.y - size / 2), w: size, h: size },
    css: BADGE_CSS,
    html: `<div class="rc-badge" style="background: ${attr(o.color ?? "#fe2c55")}; color: ${attr(o.ink ?? "#fff")}; font-size: ${font}px;">${text(value)}</div>`,
  });
}

const BADGE_CSS = `/* numberBadge() */
.rc-badge { width: 100%; height: 100%; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-family: "TikTok Sans", sans-serif; font-weight: 800; letter-spacing: -0.02em; line-height: 1;
  font-variant-numeric: tabular-nums; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28); }`;
