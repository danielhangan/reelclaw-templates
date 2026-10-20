// @ts-check
/**
 * talking-head-captions — a creator talking to camera with word-by-word
 * captions, edited the way top talking-head reels are: dead air trimmed,
 * long pauses jump-cut, punch-in zooms at sentence starts, optional hook title,
 * b-roll cutaways and music ducked under a loudness-levelled voice.
 *
 *   [ speaker · voice on · hook (first ~2.5s) · 1–4 word captions, spoken word lit ]
 *         └ b-roll cutaways over the speaker at chosen moments (voice + captions keep going)
 *
 * Word timings come from `hyperframes transcribe` (cached in assets/) or --transcript.
 */
import {
  audio, defineTemplate, fail, focusCrop, input, karaokeCaptions, karaokeRegion, KARAOKE_STYLES, layout,
  layoutSegments, LETTER_CASES, loadTranscript, mapWords, ms, music, nativeText, NATIVE_TEXT_THEMES,
  normalizedVoice, parseTimeRange, SAFE_BAND, segmentsLength, sentenceBreaks, speechRanges, splitRanges,
  timeline, toReel, transcribeMedia, video, visual, WHISPER_MODELS,
} from "reelclaw";

const THEMES = /** @type {(keyof typeof NATIVE_TEXT_THEMES)[]} */ (Object.keys(NATIVE_TEXT_THEMES));
const POSITIONS = /** @type {const} */ (["lower", "center", "upper"]);

export default defineTemplate({
  id: "talking-head-captions",
  name: "Talking head + word captions",
  description:
    "Creator talking to camera with bold word-by-word captions (spoken word highlighted), tightened pauses, punch-in zooms, optional hook title, b-roll cutaways and ducked music. The default edit for advice, storytime and UGC testimonials.",
  category: "talking-head",
  tags: ["talking-head", "captions", "karaoke", "subtitles", "ugc", "voiceover", "jump-cut", "b-roll"],
  source: { notes: "Hormozi/CapCut-style auto captions: 1–3 heavy words at a time under the chin, spoken word in yellow, zoom on every other sentence." },

  inputs: {
    clip: input.video({ required: true, description: "Talking-to-camera clip; its voice is the soundtrack" }),
    transcript: input.text({ description: "Word-timed transcript (.json, .srt or .vtt) — skips transcription; fix misheard words here" }),
    hook: input.text({ description: "Title over the first seconds", example: "3 things nobody tells you about growing on tiktok" }),
    hookSecs: input.number({ default: 2.5, min: 0.5, max: 15, unit: "s", description: "How long the hook title stays up" }),
    hookTheme: input.enum(THEMES, { default: "white", description: "Hook look: TikTok's native text box (white, dark, black, red, yellow)" }),
    captionStyle: input.enum(KARAOKE_STYLES, { default: "pop", description: "pop: outlined, spoken word coloured + bigger; box: spoken word on a colour box; color: recolour only" }),
    highlight: input.text({ default: "#ffe500", description: "Colour of the spoken word (or its box)" }),
    captionPosition: input.enum(POSITIONS, { default: "lower", description: "Caption strip inside the safe band: under the chin, mid-frame or up top" }),
    captionCase: input.enum(LETTER_CASES, { default: "upper", description: "Caption letter case" }),
    wordsPerChunk: input.number({ default: 3, min: 1, max: 4, integer: true, description: "Most words on screen at once" }),
    captionSize: input.number({ default: 84, min: 40, max: 140, unit: "px", description: "Base caption size; long chunks shrink to fit" }),
    broll: input.list(input.visual({ description: "b-roll" }), { description: "B-roll cutaway (video or image) shown full screen over the speaker; pair each with --broll-at" }),
    brollAt: input.list(input.text({ description: "window" }), { description: 'When each --broll shows, in the clip\'s own seconds: "4.2-6", "4.2+2" or "4.2" (2s)' }),
    trim: input.number({ min: 0, unit: "s", description: "Where to start in the clip (default: just before the first word)" }),
    end: input.number({ min: 0.5, unit: "s", description: "Where to stop in the clip (default: 0.5s after the last word)" }),
    maxPause: input.number({ default: 0.6, min: 0, max: 5, unit: "s", description: "Pauses longer than this are cut down to 0.3s (0 keeps every pause)" }),
    punchIn: input.number({ default: 1.12, min: 1, max: 1.5, description: "Zoom on every other sentence / cut (1 = off)" }),
    focusX: input.number({ default: 50, min: 0, max: 100, unit: "%", description: "Speaker's position left → right (matters for landscape footage)" }),
    focusY: input.number({ default: 38, min: 0, max: 100, unit: "%", description: "Eye-line height; punch-ins zoom towards it" }),
    voiceVolume: input.number({ default: 1, min: 0, max: 1, description: "Speaker's voice level" }),
    normalize: input.boolean({ default: true, description: "Level the voice to -14 LUFS, the loudness TikTok/IG/YouTube play at" }),
    music: input.audio({ description: "Background music under the voice (fades out over the last 0.8s)" }),
    musicVolume: input.number({ default: 0.12, min: 0, max: 1, description: "Music level — low by default so it sits under the voice" }),
    musicStart: input.number({ default: 0, min: 0, unit: "s", description: "Offset into the music track" }),
    model: input.enum(WHISPER_MODELS, { default: "small.en", description: "Whisper model for transcription (tiny.en is fastest, large-v3 most accurate)" }),
    language: input.text({ description: "Spoken language code if not English (e.g. es, de, pt) — uses a multilingual model" }),
  },

  async prepare({ inputs, root, cwd, media, hyperframes, log }) {
    if (inputs.brollAt.length !== inputs.broll.length) {
      fail(`got ${inputs.broll.length} --broll but ${inputs.brollAt.length} --broll-at`, 'give one --broll-at "start-end" (seconds in the clip) per --broll, in the same order');
    }
    const words = inputs.transcript
      ? await loadTranscript(inputs.transcript, { bases: [cwd, root] })
      : (await transcribeMedia({ root, from: inputs.clip, hyperframes, model: inputs.model, language: inputs.language, log })).words;
    const voice = inputs.normalize && inputs.clip.hasAudio ? await normalizedVoice(media, inputs.clip) : undefined;
    return { words, voice };
  },

  build({ inputs, prepared: { words, voice }, warn }) {
    const { clip } = inputs;
    const from = inputs.trim ?? Math.max(0, (words[0]?.start ?? 0) - 0.15);
    const to = Math.min(inputs.end ?? (words.length ? words[words.length - 1].end + 0.5 : clip.duration), clip.duration - 0.05);
    if (to - from < 0.5) fail(`--trim/--end leave under 0.5s of ${clip.label} (${clip.duration.toFixed(1)}s long)`, "check --trim and --end (seconds into the clip)");

    // edit: tighten pauses, split at sentence starts, alternate punch-in zoom
    const ranges = speechRanges(words, { from, to, maxPause: inputs.maxPause });
    const segments = layoutSegments(inputs.punchIn > 1 ? splitRanges(ranges, sentenceBreaks(words)) : ranges, { zoom: inputs.punchIn });
    const length = segmentsLength(segments);
    const focus = { x: inputs.focusX / 100, y: inputs.focusY / 100 };

    const speaker = segments.flatMap((s, i) => {
      const timing = { start: s.at, duration: ms(s.to - s.from), trim: s.from };
      const last = i === segments.length - 1;
      // de-click jump cuts; a gentle tail on the last word
      const fades = { fadeIn: s.cut ? 0.03 : 0, fadeOut: last ? 0.15 : segments[i + 1].cut ? 0.03 : 0 };
      const crop = focusCrop(clip, layout.full(), { ...focus, zoom: s.zoom });
      const sound = clip.hasAudio && inputs.voiceVolume > 0 ? inputs.voiceVolume : 0;
      return [
        video(clip, { id: `speaker-${i + 1}`, ...timing, crop, ...(voice ? {} : { volume: sound, ...fades }) }),
        voice && sound > 0 && audio(voice, { id: `voice-${i + 1}`, ...timing, volume: sound, ...fades }),
      ];
    });

    const broll = inputs.broll.flatMap((ref, i) => {
      const at = inputs.brollAt[i];
      const win = parseTimeRange(at) ?? fail(`--broll-at "${at}" is not a time window`, 'use "4.2-6" (start-end), "4.2+2" (start+length) or "4.2" (2s), in seconds of the clip');
      const start = toReel(segments, win.start);
      const stop = toReel(segments, win.end);
      if (stop - start < 0.3) {
        warn(`--broll ${i + 1} (${at}) falls outside the part of the clip that is used — skipped`);
        return [];
      }
      return visual(ref, { id: `broll-${i + 1}`, start, duration: ms(stop - start) });
    });

    const reelWords = mapWords(words, segments);
    if (!reelWords.length) warn("no words in the part of the clip that is used — the reel has no captions");
    const captions = karaokeCaptions(reelWords, {
      region: karaokeRegion(inputs.captionPosition),
      style: inputs.captionStyle,
      highlight: inputs.highlight,
      size: inputs.captionSize,
      letterCase: inputs.captionCase,
      maxWords: inputs.wordsPerChunk,
      end: length,
    });

    // hook at the top of the safe band — or at the bottom when captions are up there
    const hookRegion = inputs.captionPosition === "upper" ? { ...SAFE_BAND, y: 1000, h: 420 } : { ...SAFE_BAND, y: 250, h: 420 };
    const hook = inputs.hook && nativeText(inputs.hook, {
      id: "hook", start: 0, duration: Math.min(inputs.hookSecs, length), region: hookRegion,
      position: inputs.captionPosition === "upper" ? "bottom" : "top", theme: inputs.hookTheme, size: 54,
    });

    return timeline([
      ...speaker,
      ...broll,
      ...captions,
      hook,
      inputs.music && music(inputs.music, { trim: inputs.musicStart, volume: inputs.musicVolume }),
    ], { duration: length });
  },
});
