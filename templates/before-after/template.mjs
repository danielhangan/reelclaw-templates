// @ts-check
/**
 * before-after — the transformation reveal. Two photos or clips, labelled,
 * either revealed with a swipe (wipe) or stacked top/bottom (split).
 *
 *   wipe:  [ before · full screen ] ──swipe──▶ [ after · full screen ]      hook on top the whole time
 *   split: [ before (top half) ]                                            hook on the seam
 *          [ after (bottom half) ]  ← optionally swiped in after a beat (--reveal)
 *
 * Stills get a slow push-in so nothing looks frozen; short clips loop.
 */
import {
  clamp, clipLength, defineTemplate, focusCrop, image, input, layout, ms, music, nativeText, NATIVE_TEXT_THEMES,
  SAFE_BAND, solid, timeline, video, wipeReveal, WIPE_DIRECTIONS,
} from "reelclaw";

/** @typedef {import('reelclaw').MediaRef} MediaRef */
/** @typedef {import('reelclaw').Box} Box */

const THEMES = /** @type {(keyof typeof NATIVE_TEXT_THEMES)[]} */ (Object.keys(NATIVE_TEXT_THEMES));
const PUSH_IN = 1.06;

export default defineTemplate({
  id: "before-after",
  name: "Before / After",
  description:
    "Before/after transformation reveal from two photos or clips: a full-screen swipe from before to after, or a labelled top/bottom split. For glow-ups, makeovers, results, edits and app redesigns.",
  category: "before-after",
  tags: ["before-after", "transformation", "glow-up", "reveal", "wipe", "split-screen", "results"],
  source: { notes: "Swipe-reveal transformation posts: hook on top, lowercase before/after labels in TikTok's native text box." },

  inputs: {
    before: input.visual({ required: true, description: "Before photo or clip" }),
    after: input.visual({ required: true, description: "After photo or clip" }),
    layout: input.enum(["wipe", "split"], { default: "wipe", description: "wipe: full-screen swipe from before to after; split: before on top, after below" }),
    hook: input.text({ description: "Hook text for the whole reel", example: "6 months of fixing my posture" }),
    payoff: input.text({ description: "Optional line that replaces the hook once the after is revealed", example: "worth it" }),
    beforeLabel: input.text({ default: "before", description: "Label on the before (empty string hides it)" }),
    afterLabel: input.text({ default: "after", description: "Label on the after (empty string hides it)" }),
    theme: input.enum(THEMES, { default: "white", description: "Text look for hook and labels: TikTok's native text box" }),
    beforeSecs: input.number({ min: 0.5, max: 15, unit: "s", description: "How long the before shows alone (wipe, or split with --reveal); default 2s for a photo, up to 3s of a clip" }),
    afterSecs: input.number({ min: 1, max: 30, unit: "s", description: "How long the after holds once revealed (split without --reveal: the reel length); default 3–8s from the media" }),
    wipeSecs: input.number({ default: 0.7, min: 0.2, max: 3, unit: "s", description: "Length of the swipe" }),
    direction: input.enum(WIPE_DIRECTIONS, { default: "right", description: "Which way the swipe travels" }),
    reveal: input.boolean({ description: "split: keep the after half dark, then swipe it in after --before-secs" }),
    focusX: input.number({ default: 50, min: 0, max: 100, unit: "%", description: "Horizontal focus kept in frame when footage is cropped" }),
    focusY: input.number({ default: 45, min: 0, max: 100, unit: "%", description: "Vertical focus kept in frame (split halves crop a lot: lower = keep the top)" }),
    music: input.audio({ description: "Background music (fades out over the last 0.8s)" }),
    musicVolume: input.number({ default: 1, min: 0, max: 1, description: "Music level" }),
    musicStart: input.number({ default: 0, min: 0, unit: "s", description: "Offset into the music (start on the drop)" }),
    beforeVolume: input.number({ default: 0, min: 0, max: 1, description: "Before clip's own sound (muted by default)" }),
    afterVolume: input.number({ default: 0, min: 0, max: 1, description: "After clip's own sound (muted by default)" }),
  },

  build({ inputs }) {
    const { before, after } = inputs;
    const focus = { x: inputs.focusX / 100, y: inputs.focusY / 100 };
    const split = inputs.layout === "split";
    const swipe = !split || inputs.reveal;

    // timing: [before alone] → [swipe] → [after holds]; a plain split is one hold
    const lead = swipe ? inputs.beforeSecs ?? (before.isImage ? 2 : clamp(clipLength(before), 1, 3)) : 0;
    const wipe = swipe ? inputs.wipeSecs : 0;
    const hold = inputs.afterSecs ?? defaultHold(after, before, split && !swipe, wipe);
    const total = ms(lead + wipe + hold);
    const revealed = ms(lead + wipe / 2); // labels and payoff switch mid-swipe

    const boxes = split ? layout.split(0.5) : { top: layout.full(), bottom: layout.full() };
    const shotOpts = { focus };
    const clips = [
      shot(before, "before", boxes.top, 0, split ? total : ms(lead + wipe), { ...shotOpts, volume: inputs.beforeVolume, pushAt: 0 }),
      split && swipe && solid("#0d0d0d", { id: "after-cover", start: 0, duration: ms(lead + wipe), box: boxes.bottom }),
      shot(after, "after", boxes.bottom, lead, ms(wipe + hold), { ...shotOpts, volume: inputs.afterVolume, pushAt: ms(lead + wipe) }),
      swipe && wipeReveal({ target: "after", box: boxes.bottom, at: lead, duration: wipe, direction: inputs.direction }),
      !inputs.hook && split && solid("#fff", { id: "seam", start: 0, duration: total, box: { x: 0, y: boxes.top.h - 3, w: 1080, h: 6 } }),
    ];

    // text: TikTok native boxes, all inside the safe band
    const look = { theme: inputs.theme };
    const hookRegion = split ? layout.band(boxes.top.h, 300) : { ...SAFE_BAND, y: 250, h: 420 };
    const hookPos = split ? "center" : "top";
    const hookEnd = inputs.payoff ? revealed : total;
    /** @param {string} text @param {string} id @param {Box} region @param {'top'|'bottom'} position @param {number} start @param {number} duration */
    const label = (text, id, region, position, start, duration) =>
      text.trim() ? [nativeText(text, { id, start, duration: ms(duration), region, position, size: 58, ...look })] : [];
    const top = { ...SAFE_BAND, y: 240, h: 170 };
    const bottom = { ...SAFE_BAND, y: 1240, h: 170 };

    return timeline([
      ...clips,
      ...(split
        ? [...label(inputs.beforeLabel, "before-label", top, "top", 0, total), ...label(inputs.afterLabel, "after-label", bottom, "bottom", 0, total)]
        : [...label(inputs.beforeLabel, "before-label", bottom, "bottom", 0, revealed), ...label(inputs.afterLabel, "after-label", bottom, "bottom", revealed, total - revealed)]),
      inputs.hook && hookEnd > 0 && nativeText(inputs.hook, { id: "hook", start: 0, duration: hookEnd, region: hookRegion, position: hookPos, size: 54, ...look }),
      inputs.payoff && nativeText(inputs.payoff, { id: "payoff", start: revealed, duration: ms(total - revealed), region: hookRegion, position: hookPos, size: 54, ...look }),
      inputs.music && music(inputs.music, { trim: inputs.musicStart, volume: inputs.musicVolume }),
    ], { duration: total });
  },
});

/**
 * Seconds the after holds: a clip's own length (3–8s), else 3s for a photo
 * (4s when a plain split is the whole reel, taking a clip's length from either side).
 * @param {MediaRef} after
 * @param {MediaRef} before
 * @param {boolean} wholeReel
 * @param {number} wipe
 */
function defaultHold(after, before, wholeReel, wipe) {
  const clips = (wholeReel ? [after, before] : [after]).filter((r) => !r.isImage);
  if (!clips.length) return wholeReel ? 4 : 3;
  return clamp(Math.max(...clips.map((r) => clipLength(r))) - wipe, 3, 8);
}

/**
 * One side, framed on the focus point. Photos push in slowly from `pushAt`
 * (after a swipe, so the mask never scales); clips loop when short.
 * @param {MediaRef} ref
 * @param {string} id
 * @param {Box} box
 * @param {number} start
 * @param {number} duration
 * @param {{ focus: { x: number, y: number }, volume: number, pushAt: number }} o
 */
function shot(ref, id, box, start, duration, { focus, volume, pushAt }) {
  if (ref.isImage) {
    const motion = [{ at: pushAt, duration: ms(start + duration - pushAt), from: { scale: 1 }, to: { scale: PUSH_IN }, ease: "none" }];
    return image(ref, { id, start, duration, box, objectPosition: `${focus.x * 100}% ${focus.y * 100}%`, motion });
  }
  // crop (not object-position) so the clip gets one wrapper element the swipe can mask
  return video(ref, { id, start, duration, box, crop: focusCrop(ref, box, focus), loop: duration > clipLength(ref), volume });
}
