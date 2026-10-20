// @ts-check
/**
 * listicle — "3 apps that feel illegal to know" / "things I wish I knew at 20".
 * A hook title card, then N numbered items, each with its own clip or photo,
 * a title and an optional note; optional CTA card at the end. Cuts can snap
 * to the music's beats.
 *
 *   [ hook card ][ ① title · note ][ ② title · note ] … [ cta (optional) ]
 */
import {
  CAPTION_STYLES, caption, clamp, clipLength, defineTemplate, detectBeats, fail, input, ms, music,
  numberBadge, readingSeconds, snapToBeats, splitTimed, timeline, toReelTime, visual,
} from "reelclaw";

const FOCUS = /** @type {const} */ (["center", "top", "bottom", "left", "right"]);

// layout inside the safe band (x 180–900, y 220–1420): badge + title on top,
// note at the bottom, the middle left clear for the footage's subject
const BADGE = { x: 540, y: 300, size: 116 };
const TITLE = { badge: { x: 180, y: 380, w: 720, h: 320 }, inline: { x: 180, y: 240, w: 720, h: 420 } };
const NOTE = { x: 180, y: 1040, w: 720, h: 380 };

export default defineTemplate({
  id: "listicle",
  name: "Numbered Listicle",
  description:
    "\"3 apps that feel illegal to know\" countdown: a hook title card, then numbered items — each with its own clip or photo, title and optional note — and an optional CTA. Optional beat-synced cuts.",
  category: "listicle",
  tags: ["listicle", "countdown", "top-3", "apps", "tips", "numbered", "beat-sync", "faceless"],
  source: { notes: "Tool/app/tips lists: native text titles, one item per 2–4s, best item last, CTA asks which one they'll try (comment bait)." },

  inputs: {
    hook: input.text({ required: true, description: "Title card text", example: "3 apps that feel illegal to know" }),
    item: input.list(input.visual({ description: "Item footage" }), {
      min: 1, max: 10, description: "Footage per item (video or photo), in order",
    }),
    title: input.list(input.text({ description: "Item title" }), {
      min: 1, max: 10, description: "Title per item, same order as --item; append ' :: 4' to give one item 4s",
    }),
    note: input.list(input.text({ description: "Item note" }), {
      max: 10, description: "Optional note under each item (what it does); use \"\" to skip one",
    }),
    hookClip: input.visual({ description: "Footage under the hook card (default: the first item's footage)" }),
    hookSecs: input.number({ min: 0.8, max: 8, unit: "s", description: "Hook card length (default: from its reading time, 1.8–3.5s)" }),
    itemSecs: input.number({ default: 3, min: 0.8, max: 15, unit: "s", description: "Seconds per item" }),
    cta: input.text({ description: "Optional closing card over the last item's footage", example: "which one are you downloading first?" }),
    ctaSecs: input.number({ default: 2.5, min: 1, max: 8, unit: "s", description: "CTA card length" }),
    numbering: input.enum(["up", "down", "none"], { default: "up", description: "1→N, countdown N→1 (best last), or no numbers" }),
    numberStyle: input.enum(["badge", "inline"], { default: "badge", description: "Number in a round badge above the title, or inline (\"1. title\")" }),
    badgeColor: input.text({ default: "#fe2c55", description: "Badge colour (any CSS colour)" }),
    textStyle: input.enum(CAPTION_STYLES, { default: "tiktok-box", description: "TikTok's native white box (default), dark box, classic white-with-outline, or plain" }),
    titleSize: input.number({ default: 62, min: 30, max: 110, unit: "px", description: "Base title size; long titles shrink to fit" }),
    fill: input.enum(["auto", "cover", "blur"], { default: "auto", description: "Footage framing: auto = fill portrait, blur-fill landscape" }),
    focus: input.enum(FOCUS, { default: "center", description: "Which part of cropped footage stays in frame" }),
    music: input.audio({ description: "Background music (fades out over the last 0.8s)" }),
    musicVolume: input.number({ default: 1, min: 0, max: 1, description: "Music level" }),
    musicStart: input.number({ default: 0, min: 0, unit: "s", description: "Offset into the music track (start on the drop)" }),
    beatSync: input.boolean({ default: true, description: "Snap cuts to the music's beats (with --music)" }),
    itemVolume: input.number({ default: 0, min: 0, max: 1, description: "Item footage's own sound (muted by default)" }),
  },

  async prepare({ inputs, root, warn }) {
    const beats = inputs.music && inputs.beatSync ? await detectBeats({ root, music: inputs.music, onWarn: warn }) : [];
    return { beats };
  },

  build({ inputs, prepared }) {
    const n = inputs.item.length;
    if (inputs.title.length !== n) fail(`got ${n} --item but ${inputs.title.length} --title`, "pass exactly one --title per --item, in the same order");
    if (inputs.note.length > n) fail(`got ${inputs.note.length} --note for ${n} items`, "pass at most one --note per --item (\"\" skips one)");

    // segment boundaries: hook | item 1 | … | item N | cta — cuts snap to beats
    const entries = inputs.title.map((t) => splitTimed(t));
    const hookSecs = inputs.hookSecs ?? clamp(readingSeconds(inputs.hook), 1.8, 3.5);
    const lengths = [hookSecs, ...entries.map((e) => e.secs ?? inputs.itemSecs), ...(inputs.cta ? [inputs.ctaSecs] : [])];
    let cuts = lengths.slice(0, -1).map((_, i) => ms(lengths.slice(0, i + 1).reduce((a, b) => a + b, 0)));
    const total = ms(lengths.reduce((a, b) => a + b, 0));
    const beats = toReelTime(prepared.beats ?? [], inputs.musicStart).filter((b) => b < total - 0.5);
    if (beats.length) cuts = snapToBeats(cuts, beats, { minGap: 0.8 });
    const at = [0, ...cuts, total];
    const span = (/** @type {number} */ i) => ({ start: at[i], duration: ms(at[i + 1] - at[i]) });

    /** @param {string} text @param {{ id: string, start: number, duration: number, region?: import("reelclaw").Box, position?: 'top'|'center'|'bottom', size: number }} o */
    const text = (text, o) => caption(text, { ...o, style: inputs.textStyle });
    const frame = { fill: inputs.fill, focus: inputs.focus, volume: inputs.itemVolume };

    // the hook plays over --hook-clip, or the first item's footage (which then simply continues)
    const hookRef = inputs.hookClip ?? inputs.item[0];
    const hook = span(0);
    const firstTrim = inputs.hookClip ? 0 : continueAfter(hookRef, hook.duration);

    const items = entries.flatMap((entry, i) => {
      const s = span(i + 1);
      const num = inputs.numbering === "up" ? i + 1 : inputs.numbering === "down" ? n - i : undefined;
      const inline = inputs.numberStyle === "inline" || num === undefined;
      const note = inputs.note[i]?.trim();
      return [
        ...visual(inputs.item[i], { id: `item-${i + 1}`, ...s, trim: i === 0 ? firstTrim : 0, ...frame }),
        !inline && numberBadge(/** @type {number} */ (num), { id: `badge-${i + 1}`, ...s, center: BADGE, size: BADGE.size, color: inputs.badgeColor }),
        text(num !== undefined && inline ? `${num}. ${entry.text}` : entry.text, {
          id: `title-${i + 1}`, ...s, region: inline ? TITLE.inline : TITLE.badge, position: "top", size: inputs.titleSize,
        }),
        note && text(note, { id: `note-${i + 1}`, ...s, region: NOTE, position: "bottom", size: 46 }),
      ];
    });

    const last = inputs.item[n - 1];
    const lastSpan = span(n);
    const cta = inputs.cta && span(n + 1);
    return timeline([
      ...visual(hookRef, { id: "hook-clip", ...hook, ...frame }),
      text(inputs.hook, { id: "hook", ...hook, position: "center", size: 72 }),
      ...items,
      ...(cta ? [
        ...visual(last, { id: "cta-clip", ...cta, trim: continueAfter(last, lastSpan.duration), ...frame }),
        text(/** @type {string} */ (inputs.cta), { id: "cta", ...cta, position: "center", size: 60 }),
      ] : []),
      inputs.music && music(inputs.music, { trim: inputs.musicStart, volume: inputs.musicVolume }),
    ], { duration: total });
  },
});

/**
 * Where footage that is already on screen for `played` seconds should resume
 * in the next segment: keep going when at least 1s is left (it loops if it
 * then runs out), otherwise start over.
 * @param {import("reelclaw").MediaRef} ref
 * @param {number} played
 */
function continueAfter(ref, played) {
  return !ref.isImage && clipLength(ref) - played >= 1 ? played : 0;
}
