// @ts-check
/**
 * greenscreen-reaction — TikTok's greenscreen reaction: a video plays full
 * screen and a creator, cut out of their background, talks over it from a
 * corner. Both soundtracks play. Optionally the creator opens elsewhere and is
 * dragged into place (a pattern interrupt right when viewers would swipe).
 *
 *   [ video · full screen · its sound, ducked under the creator ]
 *     ├─ [ reaction cut-out · bottom-left · its sound ]  (opens at --start-position, drags in at --move-at)
 *     └─ [ hook · top of the safe band ]
 */
import {
  ANCHORS, CAPTION_POSITIONS, CAPTION_STYLES, CUTOUT_QUALITIES, FILLS, SAFE_BAND, audio, caption, clipLength, cutout, defineTemplate,
  dragFrom, fail, input, ms, normalizedVoice, overlaps, placeCutout, timeline, video, visual,
} from "reelclaw";

const EASE = /^(none|linear|(power[0-4]|sine|expo|circ|back|elastic|bounce)(\.(in|out|inOut))?)$/;

export default defineTemplate({
  id: "greenscreen-reaction",
  name: "Greenscreen reaction",
  description:
    "TikTok greenscreen reaction: any video plays full screen while a creator, cut out of their background by a local AI model, talks over it from a corner. Both soundtracks on; optional drag-into-place opener.",
  category: "greenscreen",
  tags: ["ugc", "greenscreen", "reaction", "cutout", "background-removal", "app-promo", "commentary"],

  inputs: {
    video: input.video({ required: true, description: "Background video, full screen (TikTok/screen recording/clip). Landscape gets a blurred fill" }),
    reaction: input.video({ required: true, description: "Creator reaction clip; its background is removed (or pass a transparent .webm/.mov)" }),
    hook: input.text({ description: "Hook caption", example: "please tag the app developer bc they lowkey saved my life" }),
    hookPosition: input.enum(CAPTION_POSITIONS, { default: "top", description: "Where the hook sits in the safe band (top clears the cut-out)" }),
    hookStyle: input.enum(CAPTION_STYLES, { default: "tiktok-outline", description: "Caption look" }),
    hookSize: input.number({ default: 58, min: 26, max: 120, unit: "px", description: "Base caption size; long text auto-shrinks to fit" }),
    hookStart: input.number({ default: 0, min: 0, unit: "s", description: "When the hook appears" }),
    hookSecs: input.number({ min: 0.5, unit: "s", description: "How long the hook stays up (default: rest of the reel)" }),
    size: input.number({ default: 40, min: 5, max: 100, unit: "%", description: "Cut-out width as % of the frame width, measured on the person" }),
    position: input.enum(ANCHORS, { default: "bottom-left", description: "Where the cut-out rests" }),
    margin: input.number({ default: 0, min: 0, unit: "px", description: "Inset from the frame edges (0 = flush, body runs off the bottom)" }),
    x: input.number({ unit: "px", description: "Exact cut-out left edge; overrides --position on that axis" }),
    y: input.number({ unit: "px", description: "Exact cut-out top edge; overrides --position on that axis" }),
    flip: input.boolean({ description: "Mirror the cut-out so the creator faces into the frame" }),
    crop: input.enum(["auto", "none"], { default: "auto", description: "auto: size/place the person (alpha bounding box); none: the whole source frame" }),
    startPosition: input.enum(ANCHORS, { description: "Opening spot; the cut-out is then dragged to --position (turns the drag on)" }),
    startX: input.number({ unit: "px", description: "Exact opening left edge (turns the drag on)" }),
    startY: input.number({ unit: "px", description: "Exact opening top edge (turns the drag on)" }),
    startSize: input.number({ min: 5, max: 100, unit: "%", description: "Opening width, to grow/shrink during the drag (turns the drag on)" }),
    moveAt: input.number({ min: 0, unit: "s", description: "When the drag starts (default 2)" }),
    moveSecs: input.number({ min: 0.1, max: 5, unit: "s", description: "Drag duration (default 0.9)" }),
    moveEase: input.text({ description: "GSAP ease of the drag (default power2.inOut, reads as a hand)" }),
    length: input.enum(["video", "reaction"], { default: "video", description: "What sets the reel length; reaction loops the video under a longer reaction" }),
    secs: input.number({ min: 1, unit: "s", description: "Cap the reel length" }),
    videoTrim: input.number({ default: 0, min: 0, unit: "s", description: "Offset into the background video (start right before its wow moment)" }),
    videoFit: input.enum(FILLS, { default: "auto", description: "auto: cover for portrait, blurred fill for landscape" }),
    overlayStart: input.number({ default: 0, min: 0, unit: "s", description: "When the cut-out appears" }),
    reactionTrim: input.number({ default: 0, min: 0, unit: "s", description: "Offset into the reaction clip" }),
    reactionSecs: input.number({ min: 0.5, unit: "s", description: "How long the cut-out stays (default: the rest of the clip)" }),
    videoVolume: input.number({ min: 0, max: 1, description: "Background audio (default 0.5 under a talking creator, 1 if the reaction is silent)" }),
    reactionVolume: input.number({ default: 1, min: 0, max: 1, description: "Reaction audio" }),
    cutoutQuality: input.enum(CUTOUT_QUALITIES, { default: "balanced", description: "Matting encode quality (first run only)" }),
  },

  async prepare({ inputs, ...ctx }) {
    const cut = await cutout(ctx, inputs.reaction, { quality: inputs.cutoutQuality, crop: inputs.crop === "auto" });
    // the creator's voice, levelled to -14 LUFS (phone recordings vary by 10+ dB); the cut-out itself is silent
    const voice = inputs.reaction.hasAudio && inputs.reactionVolume > 0 ? await normalizedVoice(ctx.media, inputs.reaction) : undefined;
    return { cut, voice };
  },

  build({ inputs: o, prepared: { cut, voice }, warn }) {
    // timing: the reaction plays from overlayStart; the reel follows the video (or the reaction)
    if (o.videoTrim >= o.video.duration) fail(`--video-trim ${o.videoTrim} is past the end of the video (${o.video.duration}s)`, "use a smaller --video-trim");
    if (o.reactionTrim >= o.reaction.duration) fail(`--reaction-trim ${o.reactionTrim} is past the end of the reaction (${o.reaction.duration}s)`, "use a smaller --reaction-trim");
    const videoLeft = clipLength(o.video, o.videoTrim);
    const reactionLeft = Math.min(clipLength(o.reaction, o.reactionTrim), clipLength(cut.video, o.reactionTrim));
    const wanted = Math.min(o.reactionSecs ?? reactionLeft, reactionLeft);
    if (o.reactionSecs && o.reactionSecs > reactionLeft) warn(`--reaction-secs ${o.reactionSecs}: the reaction has only ${reactionLeft}s after --reaction-trim`);
    const natural = o.length === "reaction" ? o.overlayStart + wanted : videoLeft;
    const total = ms(Math.min(natural, o.secs ?? Infinity));
    if (o.overlayStart >= total) fail(`--overlay-start ${o.overlayStart} is past the end of the ${total}s reel`, "lower --overlay-start or use --length reaction");
    const onScreen = ms(Math.min(wanted, total - o.overlayStart));
    const gap = ms(total - o.overlayStart - onScreen);
    if (gap >= 1) warn(`the creator leaves at ${ms(o.overlayStart + onScreen)}s and the last ${gap}s are background only — add --secs ${ms(o.overlayStart + onScreen)} or --length reaction to end with them`);

    // geometry: size the person, not the source frame
    const rest = placeCutout(cut.subject, { widthPct: o.size, anchor: o.position, margin: o.margin, x: o.x, y: o.y });
    const drags = Boolean(o.startPosition || o.startSize || o.startX !== undefined || o.startY !== undefined);
    if (!drags && (o.moveAt !== undefined || o.moveSecs !== undefined || o.moveEase)) {
      warn("--move-at/--move-secs/--move-ease do nothing without an opening spot: add --start-position (or --start-x/--start-y/--start-size)");
    }
    const ease = o.moveEase ?? "power2.inOut";
    if (!EASE.test(ease)) fail(`--move-ease "${ease}" is not a GSAP ease`, "try power2.inOut, power3.out, back.out, expo.inOut or none");
    const moveAt = o.moveAt ?? 2;
    const moveSecs = o.moveSecs ?? 0.9;
    const start = drags && placeCutout(cut.subject, { widthPct: o.startSize ?? o.size, anchor: o.startPosition ?? o.position, margin: o.margin, x: o.startX, y: o.startY });
    if (start && (moveAt < o.overlayStart || moveAt >= o.overlayStart + onScreen)) {
      fail(`--move-at ${moveAt} is outside the cut-out's time on screen (${o.overlayStart}–${ms(o.overlayStart + onScreen)}s)`, "pick a --move-at while the creator is visible");
    }
    if (rest.h > 1920) warn(`the cut-out is ${rest.h}px tall at --size ${o.size}, taller than the frame — lower --size`);
    if (o.margin > 0 && o.position.startsWith("bottom") && cut.subject.y + cut.subject.h >= cut.video.height - 2) {
      warn("the creator's body is cut off at the bottom of their clip, so --margin leaves a floating torso — keep --margin 0 for bottom positions");
    }

    // hook: static, inside the safe band, painted above the creator; warn when it would sit on them all reel
    const hookSecs = ms(Math.min(o.hookSecs ?? total, total - o.hookStart));
    if (o.hook && o.hookStart >= total) fail(`--hook-start ${o.hookStart} is past the end of the ${total}s reel`);
    const hookZone = { ...SAFE_BAND, y: SAFE_BAND.y + { top: 0, center: 450, bottom: 900 }[o.hookPosition], h: 300 };
    if (o.hook && overlaps(rest, hookZone, 40)) {
      warn(`the hook (${o.hookPosition}) sits on the creator — ${o.hookPosition === "top" ? "lower --size" : "use --hook-position top"} or move the cut-out (--position/--y)`);
    }

    const videoVolume = o.video.hasAudio ? (o.videoVolume ?? (voice ? 0.5 : 1)) : 0;
    const background = visual(o.video, { id: "background", start: 0, duration: total, trim: o.videoTrim, fill: o.videoFit, volume: videoVolume })
      // fade the background's sound out at the end (looped footage repeats its fades per loop, so skip those)
      .map((c) => (c.type === "video" && c.volume > 0 && !c.loop ? { ...c, fadeOut: 0.5 } : c));

    return timeline([
      background,
      video(cut.video, {
        id: "reaction",
        start: o.overlayStart,
        duration: onScreen,
        trim: o.reactionTrim,
        box: rest,
        crop: cut.subject,
        mirror: o.flip,
        motion: start ? [{ at: moveAt, duration: moveSecs, from: dragFrom(rest, start), to: { x: 0, y: 0, scale: 1 }, ease }] : [],
      }),
      voice && audio(voice, { id: "reaction-audio", start: o.overlayStart, duration: onScreen, trim: o.reactionTrim, volume: o.reactionVolume, fadeOut: 0.15 }),
      o.hook && caption(o.hook, { id: "hook", start: o.hookStart, duration: hookSecs, position: o.hookPosition, style: o.hookStyle, size: o.hookSize }),
    ], { duration: total });
  },
});
