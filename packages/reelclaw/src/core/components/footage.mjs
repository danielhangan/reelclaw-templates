// @ts-check
/**
 * Footage helpers: put any video or still on screen so it looks native, and
 * cut a list of them into back-to-back slots with no gaps.
 *
 *   visual(ref, { start: 0, duration: 3 })                 // one clip, smart-framed
 *   sequence(inputs.broll, { start: 0, duration: 8 })      // cycle b-roll to fill 8s
 *
 * Smart framing (`fill: "auto"`): sources close to 9:16 fill the frame
 * (`cover`); landscape/square sources are shown whole over a blurred, darkened
 * copy of themselves (the native "blur fill" look) instead of being cropped to
 * a sliver. Stills get a slow push-in so the frame never looks frozen.
 */
import { CANVAS } from "../geometry.mjs";
import { clipLength, image, ms, video } from "../timeline.mjs";

/** @typedef {import('../types.mjs').MediaRef} MediaRef */
/** @typedef {import('../timeline.mjs').Clip} Clip */
/** @typedef {import('../geometry.mjs').Box} Box */

/** Framing modes. */
export const FILLS = /** @type {const} */ (["auto", "cover", "blur"]);
/** @typedef {typeof FILLS[number]} Fill */

/** Focus presets → CSS object-position (which part of a cropped source stays in frame). */
export const FOCUS = Object.freeze({
  center: "50% 50%",
  top: "50% 20%",
  bottom: "50% 80%",
  left: "20% 50%",
  right: "80% 50%",
});
/** @typedef {keyof typeof FOCUS} Focus */

/**
 * Wider than this (w/h) and `fill: "auto"` switches from cover to blur fill.
 * 0.75 = 3:4; anything up to 3:4 crops acceptably to 9:16.
 */
export const COVER_MAX_ASPECT = 0.75;

/**
 * @typedef {object} VisualOptions
 * @property {string} [id]
 * @property {number} start
 * @property {number} duration
 * @property {number} [trim]      seconds into a video source (ignored for stills)
 * @property {Fill} [fill]        default "auto"
 * @property {Focus | string} [focus]  preset or any CSS object-position (default center)
 * @property {number} [volume]    video sound (default 0 = muted, RULES.md §6)
 * @property {number} [fadeOut]   fade the video's sound out over its last n seconds
 * @property {number} [zoom]      push-in on stills: end scale (default 1.08; 1 = static)
 * @property {Box} [box]          default full frame
 */

/**
 * Resolve `fill: "auto"` for a source.
 * @param {MediaRef} ref
 * @param {Fill} [fill]
 * @returns {'cover'|'blur'}
 */
export function framing(ref, fill = "auto") {
  if (fill !== "auto") return fill;
  const aspect = ref.width && ref.height ? ref.width / ref.height : 9 / 16;
  return aspect > COVER_MAX_ASPECT ? "blur" : "cover";
}

/**
 * One video or still, framed to look native. Videos shorter than `duration`
 * loop seamlessly (back-to-back segments, no black frames).
 * @param {MediaRef} ref
 * @param {VisualOptions} o
 * @returns {Clip[]}  one clip, or two for blur fill (background + foreground)
 */
export function visual(ref, o) {
  const id = o.id ?? `visual-${Math.round(o.start * 1000)}`;
  const box = o.box ?? { x: 0, y: 0, w: CANVAS.width, h: CANVAS.height };
  const objectPosition = o.focus ? (FOCUS[/** @type {Focus} */ (o.focus)] ?? o.focus) : undefined;
  const mode = framing(ref, o.fill);
  const timing = { start: o.start, duration: o.duration };

  if (ref.isImage) {
    const zoom = o.zoom ?? 1.08;
    const motion = zoom === 1 ? [] : [{ at: o.start, duration: o.duration, from: { scale: 1 }, to: { scale: zoom }, ease: "none" }];
    if (mode === "cover") return [image(ref, { id, ...timing, box, objectPosition, motion })];
    return [
      image(backdrop(ref), { id: `${id}-bg`, ...timing, box, style: BLUR_STYLE }),
      image(ref, { id, ...timing, box, fit: "contain", motion }),
    ];
  }

  const trim = Math.min(o.trim ?? 0, Math.max(0, ref.duration - 0.3));
  const loop = o.duration > clipLength(ref, trim);
  const base = { ...timing, trim, loop, box };
  const sound = { volume: o.volume, fadeOut: o.fadeOut };
  if (mode === "cover") return [video(ref, { id, ...base, objectPosition, ...sound })];
  return [
    video(backdrop(ref), { id: `${id}-bg`, ...base, style: BLUR_STYLE }),
    video(ref, { id, ...base, fit: "contain", ...sound }),
  ];
}

/**
 * The same file under an equivalent path ("assets/../assets/x.mp4"). HyperFrames
 * lint flags two media elements with identical src/start/duration as a
 * discovery risk; the blur-fill backdrop is a deliberate duplicate.
 * @param {MediaRef} ref
 * @returns {MediaRef}
 */
const backdrop = (ref) => ({ ...ref, src: ref.src.replace(/^assets\//, "assets/../assets/") });

/**
 * Blurred, darkened, slightly enlarged copy behind a contained source. The
 * clip-path trims the enlarged copy back to its own box (inset = (1 - 1/1.18) / 2),
 * so blur fill also works in a split half or a PiP box, and the soft blur
 * fringe at the element's edges is never visible.
 */
const BLUR_STYLE = "filter: blur(38px) brightness(0.62) saturate(1.15); transform: scale(1.18); clip-path: inset(7.63%);";

/**
 * @typedef {object} SequenceOptions
 * @property {string} [id]        id prefix (default "broll") → broll-1, broll-2…
 * @property {number} start
 * @property {number} duration    total seconds to fill
 * @property {number} [slot]      seconds per cut; default: an equal share per source
 * @property {number[]} [cuts]    explicit absolute cut times (overrides slot), e.g. snapped to beats
 * @property {Fill} [fill]
 * @property {Focus | string} [focus]
 * @property {number} [volume]
 * @property {number} [zoom]
 */

/**
 * Cut a list of sources into back-to-back slots filling [start, start+duration).
 * Sources are used in order and cycle when there are more slots than sources;
 * a video reused later continues from where it left off (fresh footage), and
 * loops only when it runs out.
 * @param {MediaRef[]} refs
 * @param {SequenceOptions} o
 * @returns {Clip[]}
 */
export function sequence(refs, o) {
  if (!refs.length) return [];
  const bounds = slotBounds(o.start, o.duration, o.cuts ?? evenCuts(o.start, o.duration, o.slot ?? o.duration / refs.length));
  /** @type {Map<MediaRef, number>} */
  const used = new Map();
  return bounds.flatMap(([a, b], i) => {
    const ref = refs[i % refs.length];
    const duration = ms(b - a);
    let trim = used.get(ref) ?? 0;
    if (!ref.isImage && trim + duration > clipLength(ref, 0)) trim = 0;
    used.set(ref, ms(trim + duration));
    return visual(ref, { id: `${o.id ?? "broll"}-${i + 1}`, start: a, duration, trim, fill: o.fill, focus: o.focus, volume: o.volume, zoom: o.zoom });
  });
}

/**
 * Cut times that split [start, start+duration) into equal slots of about
 * `slot` seconds (the count is rounded, so there is never a short sliver at
 * the end). Returns only the interior cuts. Pure.
 * @param {number} start
 * @param {number} duration
 * @param {number} slot
 * @returns {number[]}
 */
export function evenCuts(start, duration, slot) {
  if (!(slot > 0) || !(duration > 0)) return [];
  const n = Math.max(1, Math.round(duration / slot));
  return Array.from({ length: n - 1 }, (_, k) => ms(start + ((k + 1) * duration) / n));
}

/**
 * Turn cut times into [from, to) slot pairs covering the window exactly;
 * cuts outside the window or closer than 0.3s to a neighbour are ignored.
 * @param {number} start
 * @param {number} duration
 * @param {number[]} cuts
 * @returns {Array<[number, number]>}
 */
export function slotBounds(start, duration, cuts) {
  const endT = ms(start + duration);
  const points = [ms(start)];
  for (const c of [...cuts].sort((a, b) => a - b)) {
    if (c - points[points.length - 1] >= 0.3 && endT - c >= 0.3) points.push(ms(c));
  }
  points.push(endT);
  return points.slice(1).map((p, i) => /** @type {[number, number]} */ ([points[i], p]));
}
