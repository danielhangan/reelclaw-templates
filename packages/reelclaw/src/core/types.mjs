// @ts-check
/**
 * Shared JSDoc types. This module has no runtime code; import types with
 * `@typedef {import('./types.mjs').MediaRef} MediaRef`.
 */

/** @typedef {'video'|'image'|'audio'|'visual'} MediaKind  'visual' = a video or a still image (check ref.isImage) */

/**
 * Facts about a media file, from ffprobe (cached per staged file).
 * Width/height are the *displayed* size (phone rotation metadata applied).
 *
 * @typedef {object} ProbeInfo
 * @property {number} duration  seconds; 0 for still images
 * @property {number} width
 * @property {number} height
 * @property {number} fps       0 for still images / audio
 * @property {boolean} hasVideo a real moving-picture stream (not cover art)
 * @property {boolean} hasAudio
 * @property {boolean} hasAlpha transparent video/image (e.g. VP9 WebM cut-outs, PNG)
 * @property {boolean} isImage
 */

/**
 * A staged, probed media file — what a template's `build()` receives for every
 * video/image/audio input. `src` is relative to the reel project root
 * (always `assets/<slug>-<contenthash>.<ext>`), `path` is absolute.
 *
 * @typedef {ProbeInfo & { kind: MediaKind, src: string, path: string, label: string }} MediaRef
 */

export {};
