// @ts-check
/**
 * no-yapping — the silent split-screen tutorial ("making $10k but no yapping").
 *
 *   [ intro · fullscreen · hook ]  →  [ typing (top half)                ]
 *                                     [ ── step captions on the seam ──  ]
 *                                     [ demo screen recording (bottom)   ]
 *
 * Length = intro + demo segment: the demo drives it. Short intro/typing clips loop.
 */
import { CAPTION_STYLES, caption, clipLength, defineTemplate, fail, FOCUS, input, layout, music, SAFE_BAND, solid, timeline, video, visual } from "reelclaw";
import { parseStep, scheduleSteps } from "./steps.mjs";

const FOCUS_PRESETS = /** @type {(keyof typeof FOCUS)[]} */ (Object.keys(FOCUS));

/** Hook region per position: "top" sits in the upper third, clear of the face in a typical selfie intro. */
const HOOK_REGION = {
  top: { ...SAFE_BAND, y: 340, h: 560 },
  center: SAFE_BAND,
  bottom: SAFE_BAND,
};

export default defineTemplate({
  id: "no-yapping",
  name: "…but no yapping",
  description:
    "Silent split-screen tutorial: a fullscreen intro under an outcome hook (\"making $10k but no yapping\"), then typing footage over a screen recording with short step captions on the seam. Farms saves and shares.",
  category: "tutorial",
  tags: ["split-screen", "tutorial", "no-voiceover", "screen-recording", "steps", "saves"],
  source: { notes: "Mouth-tape intro → 50/50 typing/demo split, lowercase step captions centred on the seam, no voiceover." },

  inputs: {
    intro: input.video({ required: true, description: "9:16 intro clip shown fullscreen under the hook (e.g. putting on mouth tape); loops if short" }),
    typing: input.video({ required: true, description: "Creator working (hands, keyboard, screen) for the top half; loops to fill the split" }),
    demo: input.video({ required: true, description: "Screen recording for the bottom half; its length sets the reel length" }),
    hook: input.text({ required: true, description: "Hook over the intro", example: "making $10k but no yapping" }),
    step: input.list(input.text({ description: "step" }), {
      description: 'Step caption on the seam: "text", "text :: secs" or "text :: start-end" (reel seconds); the last one holds to the end',
    }),
    stepSecs: input.number({ min: 0.5, max: 30, unit: "s", description: "Length of a step without its own timing (default: the split shared evenly, min 1.5s)" }),
    introSecs: input.number({ min: 1, max: 15, unit: "s", description: "Fullscreen intro length (default: the intro clip's length, kept within 3–6s)" }),
    introTrim: input.number({ default: 0, min: 0, unit: "s", description: "Offset into the intro clip" }),
    typingTrim: input.number({ default: 0, min: 0, unit: "s", description: "Offset into the typing clip" }),
    demoTrim: input.number({ default: 0, min: 0, unit: "s", description: "Skip dead time at the start of the demo" }),
    demoSecs: input.number({ min: 1, unit: "s", description: "Cap the split segment (default: the rest of the demo)" }),
    demoFit: input.enum(["auto", "cover", "contain", "blur"], {
      default: "auto",
      description: "Bottom half: cover fills it (crops), contain shows the whole recording on white, blur shows it over a blurred copy; auto = cover unless that crops away over 40%, else blur",
    }),
    demoFocus: input.enum(FOCUS_PRESETS, { default: "center", description: "Which part of the demo stays in frame when it is cropped" }),
    typingFocus: input.enum(FOCUS_PRESETS, { default: "center", description: "Which part of the typing clip stays in frame (the half crops a 9:16 clip to its middle)" }),
    hookPosition: input.enum(["top", "center", "bottom"], { default: "top", description: "Where the hook sits on the intro" }),
    captionStyle: input.enum(CAPTION_STYLES, { default: "tiktok-outline", description: "Caption look for the hook and steps" }),
    hookSize: input.number({ default: 62, min: 26, max: 120, unit: "px", description: "Base hook size; long text auto-shrinks" }),
    stepSize: input.number({ default: 60, min: 26, max: 100, unit: "px", description: "Base step caption size; long text auto-shrinks" }),
    music: input.audio({ description: "Background music (fades out over the last 0.8s); default is silent — add a trending sound in-app" }),
    musicVolume: input.number({ default: 1, min: 0, max: 1, description: "Music level" }),
    musicStart: input.number({ default: 0, min: 0, unit: "s", description: "Offset into the music (start on the drop)" }),
    introVolume: input.number({ default: 0, min: 0, max: 1, description: "Intro clip's own sound (muted by default — no yapping)" }),
    typingVolume: input.number({ default: 0, min: 0, max: 1, description: "Typing clip's own sound, e.g. keyboard ASMR" }),
    demoVolume: input.number({ default: 0, min: 0, max: 1, description: "Demo clip's own sound" }),
  },

  build({ inputs, warn }) {
    const introLen = playable(inputs.intro, inputs.introTrim, "intro");
    playable(inputs.typing, inputs.typingTrim, "typing");
    const demoLen = playable(inputs.demo, inputs.demoTrim, "demo");

    const introSecs = inputs.introSecs ?? Math.min(6, Math.max(3, introLen));
    const splitSecs = Math.min(inputs.demoSecs ?? demoLen, demoLen);
    if (inputs.demoSecs && inputs.demoSecs > demoLen) warn(`--demo-secs ${inputs.demoSecs}: the demo only has ${demoLen}s after --demo-trim — using ${demoLen}s`);
    const total = introSecs + splitSecs;
    if (total > 45) warn(`reel is ${total.toFixed(1)}s — this format retains best under ~40s (trim with --demo-trim / --demo-secs)`);

    const { top, bottom } = layout.split(0.5);
    const fit = demoFit(inputs.demoFit, inputs.demo, bottom);
    const look = { style: inputs.captionStyle };
    const seam = layout.band(top.h, 240); // straddles the cut between the halves, inside the safe band

    const demo = {
      start: introSecs, duration: splitSecs, trim: inputs.demoTrim, box: bottom,
      volume: inputs.demoVolume, fadeOut: inputs.demoVolume ? 0.5 : 0,
    };
    const steps = scheduleSteps(inputs.step.map((s, i) => parseStep(s, i + 1)), { from: introSecs, end: total, secs: inputs.stepSecs, warn });

    return timeline([
      // smart-framed: a 9:16 intro fills the frame, a landscape one gets blur fill; short clips loop
      visual(inputs.intro, { id: "intro", start: 0, duration: introSecs, trim: inputs.introTrim, volume: inputs.introVolume }),

      fit === "contain"
        ? [
            solid("#fff", { id: "demo-panel", start: introSecs, duration: splitSecs, box: bottom }),
            video(inputs.demo, { id: "demo", ...demo, fit: "contain" }),
          ]
        : visual(inputs.demo, { id: "demo", ...demo, fill: fit, focus: inputs.demoFocus }),
      visual(inputs.typing, {
        id: "typing", start: introSecs, duration: splitSecs, trim: inputs.typingTrim, box: top,
        fill: "cover", focus: inputs.typingFocus, volume: inputs.typingVolume,
      }),

      caption(inputs.hook, {
        id: "hook", start: 0, duration: introSecs, size: inputs.hookSize, ...look,
        region: HOOK_REGION[inputs.hookPosition], position: inputs.hookPosition,
      }),
      steps.map((s) => caption(s.text, { id: `step-${s.step}`, start: s.start, duration: s.duration, size: inputs.stepSize, region: seam, ...look })),

      inputs.music && music(inputs.music, { trim: inputs.musicStart, volume: inputs.musicVolume }),
    ], { duration: total });
  },
});

/**
 * Seconds of footage after `trim`, or a clear error when the trim leaves too little.
 * @param {import("reelclaw").MediaRef} ref
 * @param {number} trim
 * @param {string} flag
 */
function playable(ref, trim, flag) {
  const len = clipLength(ref, trim);
  if (len < 0.5) fail(`--${flag}-trim ${trim}s leaves under 0.5s of the ${flag} clip (${ref.duration.toFixed(1)}s long)`, `use a --${flag}-trim below ${Math.max(0, ref.duration - 1).toFixed(1)}`);
  return len;
}

/**
 * Resolve demoFit "auto": cover unless that crops away more than 40% of the
 * recording (a portrait phone recording in the 1080×960 half), else blur.
 * @param {"auto"|"cover"|"contain"|"blur"} mode
 * @param {import("reelclaw").MediaRef} ref
 * @param {import("reelclaw").Box} box
 */
function demoFit(mode, ref, box) {
  if (mode !== "auto") return mode;
  const src = ref.width / ref.height;
  const dst = box.w / box.h;
  return Math.min(src / dst, dst / src) >= 0.6 ? "cover" : "blur";
}
