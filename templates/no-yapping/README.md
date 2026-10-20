# no-yapping

The **"…but no yapping"** silent split-screen tutorial, built from **3 videos** and a few captions. 1080×1920 @ 30fps, no voiceover: the silence is the format.

1. **Intro**: a 9:16 clip fullscreen under the hook (the mouth-tape moment). Defaults to the clip's length, kept between 3 and 6s.
2. **Typing**: the creator working, in the **top half** of the split. Loops.
3. **Demo**: the screen recording in the **bottom half**. Its length sets the reel length.

Step captions sit **on the seam** between the halves and change as the tutorial goes.

```
[ intro · 100% · "making $10k but no yapping" ]   0 → ~3-6s
[ typing · top half                           ]
[ ─────── "go to claude" (on the seam) ─────── ]   → end (demo length)
[ demo · bottom half                          ]
```

## Install

```bash
npx reelclaw@latest add no-yapping          # Claude Code + Codex instructions included
```

Then ask your agent "make a no yapping reel with intro.mp4, typing.mp4 and demo.mov", or run it yourself:

```bash
npx reelclaw make no-yapping \
  --intro footage/mouth-tape.mp4 \
  --typing footage/typing.mp4 \
  --demo clips/screen-recording.mov \
  --hook "making \$10k a month but no yapping" \
  --step "go to claude" \
  --step "paste ur script :: 4" \
  --step "easyyy 10 bands" \
  --render
# → renders/no-yapping-1.mp4
```

Each run writes `reels/<name>.html`, a plain HyperFrames composition you (or your agent) can edit by hand, and `reels/<name>.json` with the inputs used. To make a variant in seconds: `--props reels/<name>.json --hook "…" --name v2`.

## Steps

Each `--step` is one caption on the seam. There are two ways to time it:

- **Sequential**: `"caption"` or `"caption :: secs"`. It runs after the previous step, and the first one starts at the split. Steps without a length share the split evenly (at least 1.5s each), or use `--step-secs`. **The last step holds to the end**: that's your payoff line.
- **Absolute window**: `"caption :: start-end"` in seconds from the start of the reel. For example, `--step "buy now :: 10-15"` shows from second 10 to 15. The next sequential steps continue from its end.

Steps never stack: if two overlap, the earlier one is cut where the next begins. A step that would start after the reel ends is dropped, with a warning. In a props file, steps are a list of the same strings: `"step": ["go to claude", "paste ur script :: 4", "buy now :: 10-15"]`.

## Flags

<!-- reelclaw:flags:start -->
| Flag | Default | Meaning |
| --- | --- | --- |
| `--intro <file\|url>` | **required** | 9:16 intro clip shown fullscreen under the hook (e.g. putting on mouth tape); loops if short |
| `--typing <file\|url>` | **required** | Creator working (hands, keyboard, screen) for the top half; loops to fill the split |
| `--demo <file\|url>` | **required** | Screen recording for the bottom half; its length sets the reel length |
| `--hook "text"` | **required** | Hook over the intro |
| `--step "text"` | — | Step caption on the seam: "text", "text :: secs" or "text :: start-end" (reel seconds); the last one holds to the end (repeatable) |
| `--step-secs <0.5..30s>` | — | Length of a step without its own timing (default: the split shared evenly, min 1.5s) |
| `--intro-secs <1..15s>` | — | Fullscreen intro length (default: the intro clip's length, kept within 3–6s) |
| `--intro-trim <secs>` | `0` | Offset into the intro clip |
| `--typing-trim <secs>` | `0` | Offset into the typing clip |
| `--demo-trim <secs>` | `0` | Skip dead time at the start of the demo |
| `--demo-secs <secs>` | — | Cap the split segment (default: the rest of the demo) |
| `--demo-fit auto\|cover\|contain\|blur` | `auto` | Bottom half: cover fills it (crops), contain shows the whole recording on white, blur shows it over a blurred copy; auto = cover unless that crops away over 40%, else blur |
| `--demo-focus center\|top\|bottom\|left\|right` | `center` | Which part of the demo stays in frame when it is cropped |
| `--typing-focus center\|top\|bottom\|left\|right` | `center` | Which part of the typing clip stays in frame (the half crops a 9:16 clip to its middle) |
| `--hook-position top\|center\|bottom` | `top` | Where the hook sits on the intro |
| `--caption-style tiktok-outline\|tiktok-box\|tiktok-box-dark\|plain` | `tiktok-outline` | Caption look for the hook and steps |
| `--hook-size <26..120px>` | `62` | Base hook size; long text auto-shrinks |
| `--step-size <26..100px>` | `60` | Base step caption size; long text auto-shrinks |
| `--music <file\|url>` | — | Background music (fades out over the last 0.8s); default is silent — add a trending sound in-app |
| `--music-volume <0..1>` | `1` | Music level |
| `--music-start <secs>` | `0` | Offset into the music (start on the drop) |
| `--intro-volume <0..1>` | `0` | Intro clip's own sound (muted by default — no yapping) |
| `--typing-volume <0..1>` | `0` | Typing clip's own sound, e.g. keyboard ASMR |
| `--demo-volume <0..1>` | `0` | Demo clip's own sound |
<!-- reelclaw:flags:end -->

Plus the flags every template takes: `--props file.json`, `--name`, `--render`, `--draft`, `--quality`, `--workers` (`npx reelclaw make --help`).

## Examples

Phone screen recording, shown whole over a blurred copy (what `auto` picks for portrait recordings), with TikTok's native white-box captions:

```bash
npx reelclaw make no-yapping --intro shh.mp4 --typing typing.mp4 --demo phone-recording.mp4 \
  --hook "grew to 10k followers in a month but no yapping" --caption-style tiktok-box \
  --step "open the app" --step "pick a template" --step "post 3x a day" --step "10k :: 2" --render
```

Long laptop recording: skip the dead start, cap the length, sync one step to a moment, and keep the keyboard sound:

```bash
npx reelclaw make no-yapping --intro tape.mp4 --typing typing.mp4 --demo screen.mov \
  --hook "built my saas in one night but no yapping" \
  --demo-trim 4 --demo-secs 24 --demo-focus left --typing-volume 0.5 \
  --step "open cursor" --step "describe the app" --step "it builds everything :: 14-20" --step "first sale overnight" --render
```

## Notes

- **Framing.** The intro is smart-framed: 9:16 fills the screen and landscape gets blur fill. In the typing half a 9:16 clip is cropped to its middle, so pick footage where hands, keyboard and screen sit near the centre, or move the crop with `--typing-focus`. For the demo, `--demo-fit auto` covers the half unless that would crop away more than 40% of the recording; a portrait phone recording is shown whole over a blurred copy instead. `contain` shows it whole on white, as in v1.
- **Seam captions.** They are centred on the cut (y=960) inside the cross-platform safe band, and auto-shrink to two lines. The hook defaults to the upper third, clear of a centred face. Both follow [RULES.md](https://github.com/danielhangan/reelclaw-templates/blob/main/RULES.md): TikTok Sans, static, white with a black outline by default.
- **Sound.** Silent by default, so post with a trending sound in-app. `--music` fades out over the last 0.8s. Clip sound is opt-in per clip (`--intro-volume`, `--typing-volume`, `--demo-volume`); sources without an audio stream are skipped with a warning.
- **v1 changes.** v1's `--steps steps.json` is replaced by `--props`, with steps as `"step": [...]` strings. The template id is now `no-yapping`; `no_yapping` still works as an alias.
- **Footage.** Need some? Use your own clips, or browse real-creator footage at [dansugc.com](https://dansugc.com) (optional).
