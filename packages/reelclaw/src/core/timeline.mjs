// @ts-check
/**
 * Timeline IR: what a template's `build()` returns. A timeline is a canvas plus
 * a flat list of typed clips; clips paint in array order (later = on top).
 * Every clip has an absolute `start` and a `duration` in reel seconds.
 *
 *   return timeline([
 *     video(inputs.reaction, { duration: 3, trim: inputs.trim }),
 *     video(inputs.demo, { start: 3 }),
 *     caption(inputs.hook, { start: 0, duration: 3, position: "top" }),
 *     inputs.music && music(inputs.music, { volume: 0.8 }),   // falsy entries are dropped
 *   ]);
 *
 * Builders only fill in defaults — the compiler validates and emits HTML.
 */
import { CAPTION_DEFAULTS, REGION_PADDING } from "./captions.mjs";
import { ReelclawError } from "./errors.mjs";
import { CANVAS, SAFE_BAND } from "./geometry.mjs";

/** @typedef {import('./types.mjs').MediaRef} MediaRef */
/** @typedef {import('./geometry.mjs').Box} Box */
/** @typedef {import('./captions.mjs').CaptionStyle} CaptionStyle */
/** @typedef {import('./captions.mjs').CaptionPosition} CaptionPosition */

/**
 * GSAP-animatable properties of a clip's wrapper (videos/images) or text (captions).
 * @typedef {{ x?: number, y?: number, scale?: number, rotation?: number, opacity?: number, xPercent?: number, yPercent?: number }} TweenVars
 */

/**
 * One tween on a clip, in absolute reel time. The clip sits in its `from`
 * state from the start of the reel until `at` (so seeking anywhere is safe).
 * @typedef {object} Motion
 * @property {number} at
 * @property {number} duration
 * @property {TweenVars} [from] defaults to the clip's resting state
 * @property {TweenVars} to
 * @property {string} [ease] GSAP ease, default "power2.inOut"
 */

/**
 * @typedef {object} ClipBase
 * @property {string} [id]     element id in the composition (default: type + index); keep it unique
 * @property {number} start    seconds from the start of the reel
 * @property {number} duration seconds
 */

/**
 * @typedef {ClipBase & {
 *   type: 'video', src: MediaRef, trim: number, box: Box, fit: 'cover'|'contain',
 *   objectPosition?: string, volume: number, fadeIn: number, fadeOut: number,
 *   loop: boolean, mirror: boolean, crop?: Box, motion: Motion[], style?: string
 * }} VideoClip
 * `trim` = seconds into the source where playback starts. `volume` 0 = muted
 * (the house default). `crop` = region of the *source* frame (source px) to
 * show in `box`. `loop` repeats a short source to fill `duration`.
 */

/**
 * @typedef {ClipBase & {
 *   type: 'image', src: MediaRef, box: Box, fit: 'cover'|'contain',
 *   objectPosition?: string, motion: Motion[], style?: string
 * }} ImageClip
 */

/**
 * @typedef {ClipBase & {
 *   type: 'audio', src: MediaRef, trim: number, volume: number, fadeIn: number, fadeOut: number
 * }} AudioClip
 */

/** A transcript word in reel seconds (see karaokeCaptions()). @typedef {{ text: string, start: number, end: number }} Word */

/**
 * @typedef {ClipBase & {
 *   type: 'caption', text: string, style: CaptionStyle,
 *   position: CaptionPosition, align: 'center'|'left', size: number, minSize: number,
 *   region: Box, maxHeight: number, motion: Motion[], unsafe: boolean
 * }} CaptionClip
 * `region` = the box the caption must fit in (default: the safe band);
 * `position` aligns it vertically inside the region. `unsafe: true` silences
 * the "outside the safe band" warning for deliberate placements.
 */

/** @typedef {ClipBase & { type: 'solid', color: string, box: Box }} SolidClip */

/**
 * Escape hatch for custom motion graphics. `html` is placed in a timed box;
 * `css` goes in the page <style>; `script` is a function body run once at load
 * with `(tl, el, start, duration)` — add tweens to `tl` at absolute times.
 * Must stay deterministic (no clocks, Math.random or network).
 * @typedef {ClipBase & { type: 'html', html: string, css: string, script: string, box: Box }} HtmlClip
 */

/** @typedef {VideoClip|ImageClip|AudioClip|CaptionClip|SolidClip|HtmlClip} Clip */

/**
 * @typedef {object} Timeline
 * @property {{ width: number, height: number, fps: number }} canvas
 * @property {number} duration  render length in seconds
 * @property {string} background
 * @property {Clip[]} clips
 */

/** Round to the millisecond so emitted numbers stay readable and stable. */
export const ms = (/** @type {number} */ n) => Math.round(n * 1000) / 1000;

/**
 * Playable seconds of a source from `trim`, rounded down to 0.1s with a small
 * safety margin so the last frame is never past the end of the file.
 * @param {MediaRef} ref
 * @param {number} [trim]
 */
export function clipLength(ref, trim = 0) {
  return Math.max(0, Math.floor((ref.duration - trim - 0.05) * 10) / 10);
}

/** End time of a clip. */
export const end = (/** @type {{ start: number, duration: number }} */ c) => ms(c.start + c.duration);

/**
 * @param {MediaRef} src
 * @param {Partial<Omit<VideoClip, 'type'|'src'>>} [o]
 * @returns {VideoClip}
 */
export function video(src, o = {}) {
  assertMedia(src, "video");
  const trim = o.trim ?? 0;
  const duration = o.duration ?? clipLength(src, trim);
  return {
    type: "video",
    src,
    id: o.id,
    start: o.start ?? 0,
    duration,
    trim,
    box: o.box ?? fullBox(),
    fit: o.fit ?? "cover",
    objectPosition: o.objectPosition,
    volume: o.volume ?? 0,
    fadeIn: o.fadeIn ?? 0,
    fadeOut: o.fadeOut ?? 0,
    loop: o.loop ?? false,
    mirror: o.mirror ?? false,
    crop: o.crop,
    motion: o.motion ?? [],
    style: o.style,
  };
}

/**
 * @param {MediaRef} src
 * @param {Partial<Omit<ImageClip, 'type'|'src'>> & { duration: number }} o
 * @returns {ImageClip}
 */
export function image(src, o) {
  assertMedia(src, "image");
  return {
    type: "image",
    src,
    id: o.id,
    start: o.start ?? 0,
    duration: o.duration,
    box: o.box ?? fullBox(),
    fit: o.fit ?? "cover",
    objectPosition: o.objectPosition,
    motion: o.motion ?? [],
    style: o.style,
  };
}

/**
 * A sound clip (voiceover, sfx, music). Defaults to the whole file at full volume.
 * @param {MediaRef} src
 * @param {Partial<Omit<AudioClip, 'type'|'src'>>} [o]
 * @returns {AudioClip}
 */
export function audio(src, o = {}) {
  assertMedia(src, "audio");
  const trim = o.trim ?? 0;
  return {
    type: "audio",
    src,
    id: o.id,
    start: o.start ?? 0,
    duration: o.duration ?? clipLength(src, trim),
    trim,
    volume: o.volume ?? 1,
    fadeIn: o.fadeIn ?? 0,
    fadeOut: o.fadeOut ?? 0,
  };
}

/**
 * Background music under the whole reel (RULES.md §6): starts at 0, runs to the
 * end of the timeline (`duration: "reel"`, resolved by `timeline()`), fades out
 * over the last 0.8s. If the track is shorter than the reel it simply ends early
 * (the compiler warns).
 * @param {MediaRef} src
 * @param {{ trim?: number, volume?: number, fadeOut?: number, start?: number, id?: string }} [o]
 *   `trim` = offset into the track (pick the drop)
 * @returns {AudioClip}
 */
export function music(src, o = {}) {
  return {
    ...audio(src, { id: o.id ?? "music", start: o.start ?? 0, trim: o.trim ?? 0, volume: o.volume ?? 1, fadeOut: o.fadeOut ?? 0.8 }),
    duration: TO_END,
  };
}

/**
 * A text caption. Static (no transitions) and auto-fitted to its region.
 * @param {string} text
 * @param {Partial<Omit<CaptionClip, 'type'|'text'|'maxHeight'>> & { start: number, duration: number, maxHeight?: number }} o
 * @returns {CaptionClip}
 */
export function caption(text, o) {
  const region = o.region ?? { ...SAFE_BAND };
  return {
    type: "caption",
    text,
    id: o.id,
    start: o.start,
    duration: o.duration,
    style: o.style ?? "tiktok-outline",
    position: o.position ?? "center",
    align: o.align ?? "center",
    size: o.size ?? CAPTION_DEFAULTS.size,
    minSize: o.minSize ?? CAPTION_DEFAULTS.minSize,
    region,
    maxHeight: o.maxHeight ?? Math.max(40, region.h - REGION_PADDING),
    motion: o.motion ?? [],
    unsafe: o.unsafe ?? false,
  };
}

/**
 * A flat colour box (e.g. a white panel behind a letterboxed screen recording).
 * @param {string} color any CSS colour
 * @param {Partial<Omit<SolidClip, 'type'|'color'>> & { start: number, duration: number }} o
 * @returns {SolidClip}
 */
export function solid(color, o) {
  return { type: "solid", color, id: o.id, start: o.start, duration: o.duration, box: o.box ?? fullBox() };
}

/**
 * Custom HTML/CSS/GSAP — see {@link HtmlClip}.
 * @param {Partial<Omit<HtmlClip, 'type'>> & { start: number, duration: number, html: string }} o
 * @returns {HtmlClip}
 */
export function html(o) {
  return {
    type: "html",
    id: o.id,
    start: o.start,
    duration: o.duration,
    html: o.html,
    css: o.css ?? "",
    script: o.script ?? "",
    box: o.box ?? fullBox(),
  };
}

/** Sentinel duration: "until the end of the reel" (used by music()). */
export const TO_END = -1;

/**
 * Assemble a timeline. Falsy entries are dropped so optional clips can be
 * written inline (`inputs.hook2 && caption(...)`); nested arrays are flattened.
 * The duration defaults to the end of the last visual clip (audio never
 * extends a reel), and `music()` clips are stretched to it.
 * @param {Array<Clip | Clip[] | false | null | undefined | 0 | "">} clips
 * @param {{ duration?: number, background?: string }} [o]
 * @returns {Timeline}
 */
export function timeline(clips, o = {}) {
  /** @type {Clip[]} */
  const list = /** @type {any[]} */ (clips.flat()).filter(Boolean);
  const visualEnds = list.filter((c) => c.type !== "audio").map(end);
  const duration = ms(o.duration ?? Math.max(0, ...visualEnds));
  if (!(duration > 0)) {
    throw new ReelclawError("timeline has no visual clips, so its duration is 0", {
      hint: "add at least one video/image/caption clip, or pass timeline(clips, { duration })",
    });
  }
  const resolved = list.map((c) =>
    c.type === "audio" && c.duration === TO_END ? { ...c, duration: ms(Math.max(0, duration - c.start)) } : c,
  );
  return {
    canvas: { width: CANVAS.width, height: CANVAS.height, fps: CANVAS.fps },
    duration,
    background: o.background ?? "#000",
    clips: resolved,
  };
}

/** @returns {Box} */
function fullBox() {
  return { x: 0, y: 0, w: CANVAS.width, h: CANVAS.height };
}

/**
 * @param {unknown} src
 * @param {string} builder
 */
function assertMedia(src, builder) {
  const ok = typeof src === "object" && src !== null && "src" in src && "duration" in src;
  if (!ok) {
    throw new ReelclawError(`${builder}() expects a media input (MediaRef), got ${JSON.stringify(src)}`, {
      hint: "pass the input itself, e.g. video(inputs.reaction) — media inputs arrive in build() already staged and probed",
    });
  }
}
