// @ts-check
/**
 * reelclaw — template authoring API. Everything a templates/<id>/template.mjs
 * needs comes from here:
 *
 *   import { defineTemplate, input, timeline, video, caption, music, layout } from "reelclaw";
 *
 * Engine internals (staging, compiling, rendering, CLI) live in "reelclaw/core".
 */
export { defineTemplate, CATEGORIES } from "./core/template.mjs";
export { input } from "./core/inputs.mjs";
export {
  timeline, video, image, audio, music, caption, solid, html,
  clipLength, end, ms,
} from "./core/timeline.mjs";
export { CANVAS, SAFE_BAND, SAFE_ZONE, ANCHORS, layout, place, isInside, overlaps } from "./core/geometry.mjs";
export { CAPTION_STYLES, CAPTION_POSITIONS, CAPTION_DEFAULTS } from "./core/captions.mjs";
export { ReelclawError, fail } from "./core/errors.mjs";
// components: reusable building blocks on top of the clip builders (src/core/components/)
export { nativeText, NATIVE_TEXT_THEMES } from "./core/components/native-text.mjs";
export { visual, sequence, framing, evenCuts, slotBounds, FILLS, FOCUS } from "./core/components/footage.mjs";
export { detectBeats, snapToBeats, toReelTime } from "./core/components/beats.mjs";
export { numberBadge } from "./core/components/badge.mjs";
export { cutout, placeCutout, dragFrom, CUTOUT_QUALITIES } from "./core/components/cutout.mjs";
export { readingSeconds, splitTimed, clamp } from "./core/components/pacing.mjs";
export { loadTranscript, transcribeMedia, parseTranscript, cleanWord, WHISPER_MODELS, TRANSCRIPT_FORMATS } from "./core/components/transcript.mjs";
export { karaokeCaptions, karaokeRegion, chunkWords, chunkWindows, KARAOKE_STYLES, KARAOKE_REGIONS, LETTER_CASES } from "./core/components/karaoke.mjs";
export { speechRanges, sentenceBreaks, splitRanges, layoutSegments, segmentsLength, toReel, mapWords, parseTimeRange } from "./core/components/speech.mjs";
export { focusCrop } from "./core/components/crop.mjs";
export { wipeReveal, WIPE_DIRECTIONS } from "./core/components/wipe.mjs";
export { normalizedVoice, VOICE_LUFS } from "./core/components/loudness.mjs";

/** @typedef {import('./core/types.mjs').MediaRef} MediaRef */
/** @typedef {import('./core/timeline.mjs').Timeline} Timeline */
/** @typedef {import('./core/timeline.mjs').Clip} Clip */
/** @typedef {import('./core/timeline.mjs').Motion} Motion */
/** @typedef {import('./core/timeline.mjs').Word} Word */
/** @typedef {import('./core/geometry.mjs').Box} Box */
