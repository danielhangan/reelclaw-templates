# greenscreen_reaction

The TikTok **greenscreen reaction**: one full video plays fullscreen (usually a TikTok screen recording), with a UGC creator reaction **cut out of its background** and pinned in a corner on top of it. Both soundtracks play together. Reel length = the background video's length, 1080×1920 @ 30fps.

```
[ full video · fullscreen · its own audio ]
        ├── [ reaction, background removed · pinned bottom-left · its own audio ]
        └── [ hook caption · TikTok style · top of the safe band ]
```

The cut-out can also **open somewhere else and get dragged into place** — e.g. centred for the first 2s, then hand-dragged down to the corner (`--start-position center --move-at 2`).

There is no real greenscreen involved — the reaction's background is removed by a local AI matting model (`hyperframes remove-background`), which is what the in-app greenscreen effect does.

## Usage

```bash
node new-reel.mjs \
  --video <file-or-url> \
  --reaction <file-or-url> \
  --render
```

Output: `renders/<name>.mp4`. Generated files per reel: `compositions/<name>.html` + `host-<name>.html` (editable HyperFrames compositions — open in Studio with `npm run dev` to nudge things by hand).

First run on a given reaction spends ~1s per frame of footage on background removal (~6 fps on Apple Silicon CoreML; a 15s clip ≈ 75s). The transparent WebM is cached as `assets/<reaction>-cutout.webm` and reused by every later reel that uses the same reaction, so re-runs are instant.

## Flags

| Flag | Default | Meaning |
| --- | --- | --- |
| `--video <file\|url>` | required | Background video, plays fullscreen for its full length. Direct file URLs via curl; page links via yt-dlp |
| `--reaction <file\|url>` | required | Reaction clip; its background is removed and it is overlaid |
| **size + position** | | |
| `--size <pct>` | `15` | Cut-out width as a % of the 1080px frame width. See [Picking a size](#picking-a-size) |
| `--position <preset>` | `bottom-left` | `bottom-left` \| `bottom-center` \| `bottom-right` \| `center-left` \| `center` \| `center-right` \| `top-left` \| `top-center` \| `top-right` |
| `--margin <px>` | `0` | Inset from the frame edges (0 = flush into the corner) |
| `--x <px>` `--y <px>` | — | Exact cut-out position from the frame's top-left; overrides `--position` / `--margin` (either axis can be set alone) |
| `--flip` | off | Mirror the cut-out horizontally — use it to make the creator face into the frame |
| `--crop auto\|none` | `auto` | `auto` crops to the subject's alpha bounding box so `--size`/`--position` apply to the person. `none` keeps the full source frame (the person then floats inside transparent padding) |
| **hook caption** | | |
| `--hook "text"` | — | Caption over the reel. White fill, black outline, no pill — the classic TikTok look. Auto-shrinks from `--hook-size` in 2px steps until it fits the safe band (floor 26px), so long hooks are fine |
| `--hook-position` | `top` | `top` \| `center` \| `bottom`, within the safe band. Defaults to `top` because the cut-out lives at the bottom |
| `--hook-size` | `58` | Base font size in px before auto-shrinking |
| `--hook-start <s>` | `0` | When the caption appears |
| `--hook-secs <s>` | rest of reel | How long it stays up |
| **drag-into-place** | | |
| `--start-position <preset>` | — | The cut-out opens at this preset, then drags to `--position`. Same nine presets. Setting any `--start-*` flag turns the move on |
| `--start-x` `--start-y` | — | Exact opening position in px, overriding `--start-position` |
| `--start-size <pct>` | — | Opening size, if it should also grow or shrink during the drag |
| `--move-at <s>` | `2` | Reel time when the drag begins |
| `--move-secs <s>` | `0.9` | How long the drag takes |
| `--move-ease <gsap>` | `power2.inOut` | Any GSAP ease. The default eases in and out, which reads as a hand picking the clip up and setting it down |
| **timing** | | |
| `--secs <s>` | full video | Trim the whole reel to this length |
| `--video-trim <s>` | `0` | Offset into the background video where the reel starts |
| `--overlay-start <s>` | `0` | When the cut-out appears in the reel |
| `--reaction-trim <s>` | `0` | Offset into the reaction clip |
| `--reaction-secs <s>` | full clip | How long the cut-out stays on screen (auto-clamped to the reel) |
| **audio** | | |
| `--video-volume` | `1` | Background video audio (**on** by default) |
| `--reaction-volume` | `1` | Reaction audio (**on** by default) — taken from the original clip, since the cut-out WebM carries no audio |
| **misc** | | |
| `--cutout-quality` | `balanced` | `fast` \| `balanced` \| `best` — matting encode quality |
| `--force-cutout` | off | Redo background removal even if a cached cut-out exists |
| `--name` | auto `reel-N` | Kebab-case reel name |
| `--render` | off | Render after generating |
| `--draft` | off | Draft quality (fast preview renders) |

## Picking a size

`--size` is the cut-out's width as a percentage of the frame width, measured on the *person* (not the source video frame), because `--crop auto` trims the transparent padding first.

| `--size` | Reads as |
| --- | --- |
| `15` (default) | Small corner thumbnail — the video is the star |
| `25`–`30` | Clearly readable face, still secondary |
| `40`–`50` | Classic TikTok greenscreen: creator's head and shoulders own the bottom corner |

The default is deliberately conservative. Most greenscreen reactions in the wild sit around `40`.

## The example reel

[`examples/greenscreen_reaction.mp4`](../../examples/greenscreen_reaction.mp4) in the repo root was produced by exactly this command — a phone screen recording of the Ease app as the background, a DanSUGC creator reaction cut out on top, opening centred and dragged to the corner at 2s:

```bash
node new-reel.mjs \
  --video demo.mov \
  --reaction reaction.mp4 \
  --size 40 \
  --start-position center --move-at 2 \
  --hook "please tag the app developer bc they lowkey saved my life" \
  --render
```

## Examples

Classic look — big creator in the bottom-left, both sounds on:

```bash
node new-reel.mjs --video tiktok-screenrec.mp4 --reaction react.mp4 \
  --size 40 --render
```

Hook caption, creator centred for the first 2s then dragged down to the corner:

```bash
node new-reel.mjs --video tiktok-screenrec.mp4 --reaction react.mp4 \
  --size 40 --start-position center --move-at 2 \
  --hook "somebody find me the developer of this app. they saved my life" \
  --render
```

Opens big in the top-right and shrinks as it's dragged to the bottom-left, mirrored:

```bash
node new-reel.mjs --video tiktok-screenrec.mp4 --reaction react.mp4 \
  --size 20 --start-position top-right --start-size 45 \
  --move-at 1.5 --move-secs 1.2 --flip --render
```

Bottom-right, inset from the edges, mirrored so the creator faces the content:

```bash
node new-reel.mjs --video tiktok-screenrec.mp4 --reaction react.mp4 \
  --size 30 --position bottom-right --margin 60 --flip --render
```

Creator drops in 2s late, reacts for 4s, background video kept quiet underneath:

```bash
node new-reel.mjs --video tiktok-screenrec.mp4 --reaction react.mp4 \
  --overlay-start 2 --reaction-secs 4 --video-volume 0.3 --render
```

Pixel-exact placement (e.g. dodging the TikTok caption stack):

```bash
node new-reel.mjs --video tiktok-screenrec.mp4 --reaction react.mp4 \
  --size 35 --x 40 --y 1180 --render
```

## Notes and deviations from [RULES.md](../../RULES.md)

- **Audio: both tracks on by default.** The repo default is muted clips over a music bed; this format is a creator talking over a video, so muting either side defeats it. There is no `--music` flag for the same reason — a third layer under two live tracks turns to mud. Set `--video-volume 0` if the source video's sound isn't wanted.
- **The cut-out intentionally sits in the platform UI zone.** The bottom 500px safe band in RULES.md governs *text*, which must stay readable; a corner cut-out overlapping the caption stack is the native look of this format. The `--hook` caption does respect the band. Use `--margin` or `--y` to lift the cut-out if it fights a `bottom` hook.
- **The hook is static** (no entrance/exit), per RULES.md. The generator warns if the cut-out's resting or opening spot looks like it will sit under the caption.
- **The drag is the one exception to "no motion."** It's a single eased transform on a paused GSAP timeline — seek-safe, so any frame renders identically on re-render. `--flip` is applied to the inner video rather than the wrapper for exactly this reason: the wrapper's transform belongs to the drag.
- Matting quality depends on the reaction footage: even lighting and clear subject/background separation cut cleanly; motion blur and hair against a busy background will show artifacts. Check a draft render before committing.
- Mixed source resolutions are fine — the background video is center-cropped to 9:16.
- Always render the generated **host page** (`host-<name>.html`), not the sub-composition file.
- `hyperframes check` reports one `multiple_root_compositions` error once reels exist (placeholder `index.html` alongside the generated host pages). That is inherent to every template in this repo — renders target an explicit `-c host-<name>.html`, so it is harmless.

## Requirements

- `ffmpeg` / `ffprobe` on PATH — used to probe media and to find the subject's alpha box (`alphaextract` + `cropdetect`, decoded with `libvpx-vp9`, since ffmpeg's native VP9 decoder drops the alpha plane)
- Node 18+, plus the HyperFrames CLI (auto-fetched via `npx`); the matting model downloads once (~168 MB) and is cached
