# reaction-demo

UGC **reaction → demo** reel: a creator reaction clip with a hook caption, hard cut to an app demo screen recording. ~6–15s, 1080×1920 @ 30fps.

```
[ reaction clip · 3s · hook caption ] → [ demo clip · full length · optional hook 2 ]
```

[![reaction-demo preview](https://raw.githubusercontent.com/danielhangan/reelclaw-templates/main/examples/reaction_demo_preview.gif)](https://github.com/danielhangan/reelclaw-templates/blob/main/examples/reaction_demo.mp4)

## Install

```bash
npx reelclaw@latest add reaction-demo          # Claude Code + Codex instructions included
```

Then ask your agent "make me a reaction-demo reel with react.mp4 and demo.mov", or run it yourself:

```bash
npx reelclaw make reaction-demo \
  --reaction react.mp4 \
  --demo demo.mov \
  --hook "i was about to hit it and this app talked me out of it" \
  --render
# → renders/reaction-demo-1.mp4
```

Each run writes `reels/<name>.html` — a plain HyperFrames composition you (or your agent) can edit by hand — and `reels/<name>.json` with the inputs used, so `--props reels/<name>.json --hook "…" --name v2` makes a variant in seconds.

## Flags

<!-- reelclaw:flags:start -->
| Flag | Default | Meaning |
| --- | --- | --- |
| `--reaction <file\|url>` | **required** | Creator reaction clip (the hook segment) |
| `--demo <file\|url>` | **required** | App demo / screen recording; plays full length after the cut |
| `--hook "text"` | **required** | Hook caption over the reaction |
| `--hook-position top\|center\|bottom` | `center` | Where the hook sits inside the safe band |
| `--hook2 "text"` | — | Optional payoff caption over the demo |
| `--hook2-position top\|center\|bottom` | `center` | Where the payoff caption sits |
| `--hook-size <26..120px>` | `58` | Base caption size; long text auto-shrinks to fit |
| `--hook-style tiktok-outline\|tiktok-box\|tiktok-box-dark\|plain` | `tiktok-outline` | Caption look: classic outline, TikTok white/dark box, or plain |
| `--trim <secs>` | `0` | Offset into the reaction clip where the hook segment starts |
| `--reaction-secs <0.5..15s>` | `3` | Length of the reaction (hook) segment |
| `--music <file\|url>` | — | Background music under the whole reel (fades out over the last 0.8s) |
| `--music-volume <0..1>` | `1` | Music level |
| `--music-start <secs>` | `0` | Offset into the music track (start on the drop) |
| `--reaction-volume <0..1>` | `0` | Reaction clip's own audio (muted by default) |
| `--demo-volume <0..1>` | `0` | Demo clip's own audio (muted by default) |
<!-- reelclaw:flags:end -->

Plus the flags every template takes: `--props file.json`, `--name`, `--render`, `--draft`, `--quality`, `--workers` (`npx reelclaw make --help`).

## Examples

Music-only reel (default audio behaviour):

```bash
npx reelclaw make reaction-demo --reaction react.mp4 --demo demo.mov \
  --hook "this app told me how much i actually vape in a day" \
  --music track.mp3 --music-start 12 --render
```

Native clip audio, no music, hook pinned top + payoff caption on the demo:

```bash
npx reelclaw make reaction-demo --reaction react.mp4 --demo demo.mov \
  --hook "i logged 12 cravings today and gave in to zero" --hook-position top \
  --hook2 "12/12 resisted" --hook2-position bottom \
  --reaction-volume 0.9 --demo-volume 1 --render
```

## Notes

- Captions are static (no transitions) and span their segment exactly — see [RULES.md](https://github.com/danielhangan/reelclaw-templates/blob/main/RULES.md).
- Long hooks auto-shrink to fit the safe zone; walls of text are fine.
- Any source size works. The reaction is center-cropped to 9:16. The demo fills the frame when it is roughly 9:16 (a phone recording); a landscape or square recording is shown whole over a blurred copy of itself instead of being cropped.
- Need creator footage? Use your own clips, or browse real-creator reaction videos at [dansugc.com](https://dansugc.com) (optional).
