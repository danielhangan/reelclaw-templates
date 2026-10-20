// @ts-check
/**
 * Loudness-normalised voice track, for formats where the speaker's own audio
 * carries the reel (talking head, voiceover). Phone recordings vary by 10+ dB;
 * this levels them to a streaming-friendly target before mixing.
 *
 *   async prepare({ inputs, media }) {
 *     return { voice: await normalizedVoice(media, inputs.clip) };  // MediaRef (audio)
 *   }
 *   // build(): video(clip, { volume: 0 }) + audio(prepared.voice, { ... })
 */
import { ReelclawError } from "../errors.mjs";
import { requireTool, run } from "../exec.mjs";

/** @typedef {import('../types.mjs').MediaRef} MediaRef */
/** @typedef {import('../template.mjs').PrepareContext<any>['media']} PrepareMedia */

/** Integrated loudness target (LUFS). TikTok/IG/YouTube normalise to roughly -14. */
export const VOICE_LUFS = -14;

/**
 * The audio of `from`, loudness-normalised (ffmpeg loudnorm, one pass) and
 * cached as `assets/<source>.voice-lufs14.m4a`.
 * @param {PrepareMedia} media   PrepareContext.media
 * @param {MediaRef} from        a staged video/audio with sound
 * @param {{ lufs?: number }} [o]
 * @returns {Promise<MediaRef>}
 */
export function normalizedVoice(media, from, { lufs = VOICE_LUFS } = {}) {
  if (!from.hasAudio) throw new ReelclawError(`${from.label} has no audio track to normalise`);
  return media.derive({
    from,
    key: `voice-lufs${Math.abs(Math.round(lufs))}`,
    ext: ".m4a",
    kind: "audio",
    produce: async (input, output) => {
      requireTool("ffmpeg", "normalise the voice loudness");
      const r = await run("ffmpeg", [
        "-v", "error", "-y", "-i", input, "-vn",
        "-af", `loudnorm=I=${lufs}:TP=-1.5:LRA=11`,
        "-ar", "48000", "-c:a", "aac", "-b:a", "160k", output,
      ]);
      if (r.code !== 0) throw new ReelclawError(`ffmpeg could not normalise ${from.label}: ${r.stderr.trim().split("\n").pop()}`);
    },
  });
}
