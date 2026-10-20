// @ts-check
/**
 * reaction-demo — creator reaction clip with a hook caption, hard cut to an
 * app demo screen recording. The reference template: read this first.
 *
 *   [ reaction · 3s · hook ] → hard cut → [ demo · full length · optional payoff caption ]
 */
import { CAPTION_POSITIONS, CAPTION_STYLES, caption, clipLength, defineTemplate, input, music, timeline, video, visual } from "reelclaw";

export default defineTemplate({
  id: "reaction-demo",
  name: "Reaction → Demo",
  description:
    "UGC reaction hook into an app demo: a creator reacts for ~3s under a hook caption, then a hard cut to the screen recording that answers it.",
  category: "reaction",
  tags: ["ugc", "app-promo", "hook", "screen-recording", "hard-cut"],

  // every input becomes a CLI flag (hookPosition → --hook-position), a props key and a README row
  inputs: {
    reaction: input.video({ required: true, description: "Creator reaction clip (the hook segment)" }),
    demo: input.video({ required: true, description: "App demo / screen recording; plays full length after the cut" }),
    hook: input.text({
      required: true,
      description: "Hook caption over the reaction",
      example: "i was about to hit it and this app talked me out of it",
    }),
    hookPosition: input.enum(CAPTION_POSITIONS, { default: "center", description: "Where the hook sits inside the safe band" }),
    hook2: input.text({ description: "Optional payoff caption over the demo", example: "12/12 cravings resisted" }),
    hook2Position: input.enum(CAPTION_POSITIONS, { default: "center", description: "Where the payoff caption sits" }),
    hookSize: input.number({ default: 58, min: 26, max: 120, unit: "px", description: "Base caption size; long text auto-shrinks to fit" }),
    hookStyle: input.enum(CAPTION_STYLES, { default: "tiktok-outline", description: "Caption look: classic outline, TikTok white/dark box, or plain" }),
    trim: input.number({ default: 0, min: 0, unit: "s", description: "Offset into the reaction clip where the hook segment starts" }),
    reactionSecs: input.number({ default: 3, min: 0.5, max: 15, unit: "s", description: "Length of the reaction (hook) segment" }),
    music: input.audio({ description: "Background music under the whole reel (fades out over the last 0.8s)" }),
    musicVolume: input.number({ default: 1, min: 0, max: 1, description: "Music level" }),
    musicStart: input.number({ default: 0, min: 0, unit: "s", description: "Offset into the music track (start on the drop)" }),
    reactionVolume: input.number({ default: 0, min: 0, max: 1, description: "Reaction clip's own audio (muted by default)" }),
    demoVolume: input.number({ default: 0, min: 0, max: 1, description: "Demo clip's own audio (muted by default)" }),
  },

  // pure: inputs arrive staged and probed (inputs.demo.duration, .width, .hasAudio…); return what goes on screen and when
  build({ inputs }) {
    const hookSecs = inputs.reactionSecs;
    const demoSecs = clipLength(inputs.demo);
    const look = { style: inputs.hookStyle, size: inputs.hookSize };

    return timeline([
      video(inputs.reaction, { id: "reaction", duration: hookSecs, trim: inputs.trim, volume: inputs.reactionVolume }),
      // visual() frames any source natively: a 9:16 recording fills the screen, a landscape one sits over a blurred copy
      visual(inputs.demo, { id: "demo", start: hookSecs, duration: demoSecs, volume: inputs.demoVolume }),
      // captions are static and span their segment exactly (RULES.md §3)
      caption(inputs.hook, { id: "hook", start: 0, duration: hookSecs, position: inputs.hookPosition, ...look }),
      inputs.hook2 && caption(inputs.hook2, { id: "hook2", start: hookSecs, duration: demoSecs, position: inputs.hook2Position, ...look }),
      inputs.music && music(inputs.music, { trim: inputs.musicStart, volume: inputs.musicVolume }),
    ]);
  },
});
