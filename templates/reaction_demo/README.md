# reaction_demo

UGC **reaction + demo** reel: a creator reaction clip with a hook caption, hard cut to an app demo screen recording. ~9–12s total, 1080×1920 @ 30fps.

```
[ reaction clip · 3s · hook caption ] → [ demo clip · full length · optional hook 2 ]
```

## Usage

```bash
node new-reel.mjs \
  --reaction <file-or-url> \
  --demo <file-or-url> \
  --hook "i was about to hit it and this app talked me out of it" \
  --render
```

Output: `renders/<name>.mp4`. Generated files per reel: `compositions/<name>.html` + `host-<name>.html` (editable HyperFrames compositions — open in Studio with `npm run dev` to tweak by hand).

## Flags

| Flag | Default | Meaning |
| --- | --- | --- |
| `--reaction <file\|url>` | required | Reaction clip. Direct file URLs via curl; page links via yt-dlp |
| `--demo <file\|url>` | required | Demo clip; always plays full length (duration probed via ffprobe) |
| `--hook "text"` | required | Caption over the reaction segment |
| `--hook-position` | `center` | `top` \| `center` \| `bottom` (within the safe zone) |
| `--hook2 "text"` | — | Optional caption over the demo segment |
| `--hook2-position` | `center` | `top` \| `center` \| `bottom` |
| `--hook-size` | `58` | Base caption font size (px); auto-shrinks to fit, floor 26px |
| `--trim <s>` | `0` | Offset into the reaction clip where the hook segment starts |
| `--reaction-secs <s>` | `3` | Hook segment length |
| `--music <file\|url>` | — | BGM under the whole reel, fades out over the last 0.8s |
| `--music-volume` | `1` | Music level 0..1 |
| `--music-start <s>` | `0` | Offset into the music track (pick the drop) |
| `--reaction-volume` | `0` | Reaction clip audio (muted by default — music-only output) |
| `--demo-volume` | `0` | Demo clip audio (muted by default) |
| `--name` | auto `reel-N` | Kebab-case reel name |
| `--render` | off | Render after generating |
| `--draft` | off | Draft quality (fast preview renders) |

## Examples

Music-only reel (default audio behavior):

```bash
node new-reel.mjs --reaction react.mp4 --demo demo.mov \
  --hook "this app told me how much i actually vape in a day" \
  --music track.mp3 --music-start 12 --render
```

Native clip audio, no music, hook pinned top + payoff caption on the demo:

```bash
node new-reel.mjs --reaction react.mp4 --demo demo.mov \
  --hook "i logged 12 cravings today and gave in to zero" --hook-position top \
  --hook2 "12/12 resisted" --hook2-position bottom \
  --reaction-volume 0.9 --demo-volume 1 --render
```

## Notes

- Captions are static (no transitions) and span their segment exactly — see repo [RULES.md](../../RULES.md).
- Long hooks auto-shrink to fit the safe zone; walls of text are fine.
- Mixed source resolutions are fine (center-cropped to 9:16).
- Always render the generated **host page** (`host-<name>.html`), not the sub-composition file.
