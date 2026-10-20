// @ts-check
/**
 * wall-of-text — the "POV / storytime / wall of text over b-roll" format.
 * A long first-person text in TikTok's native white text box over looping
 * b-roll; optionally a second card (the reveal) swaps in on a cut.
 *
 *   [ b-roll 1 | b-roll 2 | … (cut evenly, or on the beat) ]
 *   [ text card ················ ][ text2 card (optional) ]
 */
import {
  CAPTION_POSITIONS, CAPTION_STYLES, FILLS, FOCUS, caption, clamp, clipLength, defineTemplate, detectBeats,
  evenCuts, fail, input, ms, music, sequence, snapToBeats, solid, timeline, toReelTime,
} from "reelclaw";

export default defineTemplate({
  id: "wall-of-text",
  name: "Wall of Text over B-roll",
  description:
    "POV / storytime / confession: a long first-person text in TikTok's native white text box over looping b-roll, with an optional second card (the reveal). The go-to organic app-promo format.",
  category: "text-story",
  tags: ["wall-of-text", "pov", "storytime", "b-roll", "app-promo", "native-text", "faceless"],
  source: { notes: "Native TikTok text tool (Classic font, white background) over aesthetic b-roll; the text takes longer to read than the video lasts, so viewers rewatch." },

  inputs: {
    broll: input.list(input.visual({ description: "B-roll video or photo" }), {
      min: 1, max: 12,
      description: "B-roll videos or photos, used in order and looped/cut to fill the reel",
    }),
    text: input.text({
      required: true,
      description: "The wall of text (first card). Newlines are kept",
      example: "pov: you stopped doomscrolling at 2am because your phone literally locks you out after 11pm and now you sleep 8 hours like a functioning adult",
    }),
    text2: input.text({ description: "Optional second card that replaces the first on a cut (the reveal / payoff)", example: "the app is called lumen btw" }),
    text2At: input.number({ min: 1, unit: "s", description: "When the second card replaces the first (default ≈55% in, on a cut)" }),
    duration: input.number({ min: 2, max: 60, unit: "s", description: "Reel length (default: from the b-roll, 6–10s; 9–15s with a second card)" }),
    clipSecs: input.number({ min: 0.5, max: 30, unit: "s", description: "Seconds per b-roll cut (default: an equal share per clip)" }),
    textStyle: input.enum(CAPTION_STYLES, { default: "tiktok-box", description: "TikTok's native white box (default), dark box, classic white-with-outline, or plain" }),
    textPosition: input.enum(CAPTION_POSITIONS, { default: "center", description: "Where the text sits inside the safe band" }),
    textSize: input.number({ min: 30, max: 90, unit: "px", description: "Base text size (default: by length, 64 short → 50 long); long text shrinks to fit" }),
    align: input.enum(["center", "left"], { default: "center", description: "Text alignment" }),
    fill: input.enum(FILLS, { default: "auto", description: "Footage framing: auto = fill portrait, blur-fill landscape" }),
    focus: input.enum(/** @type {(keyof typeof FOCUS)[]} */ (Object.keys(FOCUS)), { default: "center", description: "Which part of cropped footage stays in frame" }),
    dim: input.number({ default: 0, min: 0, max: 0.7, description: "Darken the footage (0–0.7) — helps the outline style" }),
    music: input.audio({ description: "Background music (fades out over the last 0.8s)" }),
    musicVolume: input.number({ default: 1, min: 0, max: 1, description: "Music level" }),
    musicStart: input.number({ default: 0, min: 0, unit: "s", description: "Offset into the music track (start on the drop)" }),
    beatSync: input.boolean({ default: true, description: "Snap cuts and the card swap to the music's beats (with --music)" }),
    brollVolume: input.number({ default: 0, min: 0, max: 1, description: "B-roll's own sound (muted by default)" }),
  },

  async prepare({ inputs, root, warn }) {
    const beats = inputs.music && inputs.beatSync ? await detectBeats({ root, music: inputs.music, onWarn: warn }) : [];
    return { beats };
  },

  build({ inputs, prepared }) {
    const natural = inputs.broll.reduce((s, r) => s + (r.isImage ? 2.5 : clipLength(r)), 0);
    const total = inputs.duration ?? ms(inputs.text2 ? clamp(natural, 9, 15) : clamp(natural, 6, 10));

    // cut points: even slots, plus the card swap (the reveal lands on a cut)
    let swap = inputs.text2 ? inputs.text2At ?? ms(clamp(total * 0.55, 2, total - 2)) : undefined;
    if (swap !== undefined && swap > total - 1) {
      fail(`--text2-at ${swap}s leaves under 1s for the second card (reel is ${total}s)`, "lower --text2-at or raise --duration");
    }
    const slot = inputs.clipSecs ?? total / inputs.broll.length;
    let cuts = swap === undefined
      ? evenCuts(0, total, slot)
      : [...evenCuts(0, swap, slot), swap, ...evenCuts(swap, total - swap, slot)];
    const beats = toReelTime(prepared.beats ?? [], inputs.musicStart).filter((b) => b < total - 0.5);
    if (beats.length) {
      const snapped = snapToBeats(cuts, beats);
      if (swap !== undefined) swap = snapped[cuts.indexOf(swap)];
      cuts = snapped;
    }

    const cards = swap === undefined
      ? [{ id: "text", text: inputs.text, start: 0, duration: total }]
      : [{ id: "text", text: inputs.text, start: 0, duration: swap }, { id: "text2", text: /** @type {string} */ (inputs.text2), start: swap, duration: ms(total - swap) }];

    return timeline([
      sequence(inputs.broll, { start: 0, duration: total, cuts, fill: inputs.fill, focus: inputs.focus, volume: inputs.brollVolume }),
      inputs.dim > 0 && solid(`rgba(0, 0, 0, ${inputs.dim})`, { id: "dim", start: 0, duration: total }),
      cards.map((c) => caption(c.text, {
        id: c.id, start: c.start, duration: c.duration, style: inputs.textStyle, position: inputs.textPosition,
        align: inputs.align, size: inputs.textSize ?? baseSize(c.text),
      })),
      inputs.music && music(inputs.music, { trim: inputs.musicStart, volume: inputs.musicVolume }),
    ], { duration: total });
  },
});

/**
 * Default base size: short lines read big (like enlarging text in the app),
 * walls start at 50px and the fit runtime shrinks them further if needed.
 * @param {string} text
 */
function baseSize(text) {
  const n = text.trim().length;
  return n <= 60 ? 64 : n <= 140 ? 56 : 50;
}
