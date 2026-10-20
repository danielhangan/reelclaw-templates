---
name: no-yapping
description: Make a silent "…but no yapping" split-screen tutorial reel (TikTok / Reels / Shorts, 1080x1920) with the reelclaw no-yapping template — a fullscreen intro under an outcome hook ("making $10k but no yapping"), then typing footage on top and a screen recording below with short step captions on the seam. Use when the user wants a "no yapping" / no-voiceover tutorial, a split-screen how-to, or hands you an intro clip, typing footage and a screen recording.
---

# no-yapping — silent split-screen tutorial

```
[ intro · fullscreen · hook ]  →  [ typing footage (top half)           ]
   "making $10k but no yapping"    [ ── "go to claude" (on the seam) ── ]
                                   [ screen recording (bottom half)     ]
```

Length = intro (3–6s, from the intro clip) + the demo recording. No voiceover: the silence is the format. 1080×1920 @ 30fps.

## 0. Set up (once per folder)

If `templates/no-yapping/template.mjs` does not exist in the working directory, install the template and engine:

```bash
npx reelclaw@latest add no-yapping
```

If npm cannot find the `reelclaw` package, run the same installer straight from GitHub: `npx github:danielhangan/reelclaw-templates add no-yapping`.

Then check the machine: `npx reelclaw doctor` (Node 22+, ffmpeg/ffprobe; yt-dlp only for TikTok/IG/YouTube page links). If something is missing, show the user the install line doctor prints and stop until it's fixed.

## 1. Collect inputs

| Input | Required | Notes |
| --- | --- | --- |
| `--intro` | yes | 9:16 clip for the fullscreen opener — the visual gag (putting on mouth tape, a finger to the lips, a smug look at the camera). Loops if short. |
| `--typing` | yes | The creator working: hands + keyboard + screen. Plays in the top half (1080×960) and loops. |
| `--demo` | yes | Screen recording of the thing being done. **Its length sets the reel length.** Landscape fills the half; a phone recording is shown whole over a blurred copy. |
| `--hook` | yes | Outcome hook over the intro. Write it with the user (§4). |
| `--step` | usually | Repeatable step captions on the seam (2–5 words each). The last one holds to the end: make it the payoff. |
| `--music` | no | Only for ads. Organic posts: render silent and add a trending sound in-app. |

Step timing, per step:
- `"go to claude"`: sequential. The split is shared evenly unless `--step-secs` is set.
- `"paste ur script :: 4"`: sequential, 4s.
- `"hit generate :: 12-15"`: shown from second 12 to 15 of the reel (an absolute window). Use it to sync a caption to a moment in the demo; the next steps continue from 15.

Use the user's own files or links first: local paths, direct URLs, and TikTok/IG/YouTube links all work. If they have no intro or typing footage:
- A 3s phone selfie (intro) and a phone propped behind the laptop (typing) are enough.
- Optional: if the DanSUGC MCP is connected (tools such as `search_videos`), offer to search real-creator clips ("mouth tape", "typing on laptop", "shh"). Show the results and their prices in credits, and buy only after the user says yes. Or point them to https://dansugc.com. DanSUGC is never required, so don't block on it.

Every flag: `npx reelclaw make no-yapping --help`.

## 2. Make a draft

```bash
npx reelclaw make no-yapping \
  --intro footage/mouth-tape.mp4 \
  --typing footage/typing.mp4 \
  --demo clips/screen-recording.mov \
  --hook "making \$10k a month but no yapping" \
  --step "go to claude" \
  --step "paste ur script :: 4" \
  --step "easyyy 10 bands" \
  --draft
```

This writes `reels/no-yapping-N.html` (the editable composition), `reels/no-yapping-N.json` (the inputs used) and `renders/no-yapping-N.mp4`. Read the warnings it prints, such as dropped steps or a reel longer than 45s. Each step's time window is in the HTML (`id="step-N" … data-start data-duration`).

Before you show the user, look at one frame from the intro and one from the split:

```bash
ffmpeg -v error -ss 1 -i renders/no-yapping-1.mp4 -frames:v 1 /tmp/intro.png
ffmpeg -v error -ss 8 -i renders/no-yapping-1.mp4 -frames:v 1 /tmp/split.png
```

Check these:
- **Hook clear of the face?** If not, try `--hook-position center|bottom`.
- **Hands and keyboard visible in the top half?** Try `--typing-focus top|bottom`, or `--typing-trim`.
- **The important part of the demo in frame?** Try `--demo-focus left|right|top|bottom`. To show the whole recording, use `--demo-fit blur` (over a blurred copy) or `--demo-fit contain` (on white).
- **Dead time at the start of the demo?** Use `--demo-trim`. If the reel runs too long, cap it with `--demo-secs`.

## 3. Iterate cheaply, then finalize

- **New hook or steps, same clips.** Media is cached, so this takes seconds: `npx reelclaw make no-yapping --props reels/no-yapping-1.json --hook "new hook" --name hook-b --draft`. Repeated `--step` flags replace the list; in a props file it is `"step": ["…", "…"]`.
- **Final quality:** `npx reelclaw render <name>` (without `--draft`).
- **Hand edits:** edit `reels/<name>.html` (a HyperFrames composition; ids are `intro`, `typing`, `demo`, `hook`, `step-N`). Then run `npx reelclaw check <name>` and `npx reelclaw render <name>`. Running `make` again with the same `--name` overwrites hand edits.

## 4. Viral playbook

This format farms **saves and shares**: viewers keep it as a tutorial.

- **Hook formula:** `[enviable, concrete outcome] but no yapping`. Examples: "making $10k a month but no yapping", "built my app in one night but no yapping". The outcome has to be specific enough to brag about. Vague ones ("being productive") die.
- **Respect the silence.** No narration, no TTS, no talking. The mouth-tape intro and the quiet are the joke.
- **Steps are captions, not sentences.** Write 2–5 word imperatives, lowercase, with casual spelling ("go to claude", "paste ur script"). If a step needs a full sentence, split it or cut it.
- **The last step is the payoff.** It stays on screen to the end, so make it the flex ("easyyy 10 bands"), not an instruction.
- **Speed is the retention mechanic.** Keep the reel under ~30–40s and let the tutorial feel almost too fast. That drives rewatches ("wait, what did they click?") and saves. Use `--demo-trim`/`--demo-secs` to cut dead time, and sync key steps to the demo with `:: start-end` windows.
- **Don't name the tool in the hook** when curiosity can carry it. Let the steps and the demo reveal it, and let the comments ask.
- **Variants:** iterate on hooks and steps, not footage. Propose 5–10 hooks in this voice, let the user pick, then make one reel per hook with `--name`.
- **Sound:** silent by default. Post with a trending sound attached in the TikTok/IG app, which feeds the algorithm. Use `--music` only for ads. `--typing-volume 0.5` (keyboard ASMR) is the one native sound that fits the format.
