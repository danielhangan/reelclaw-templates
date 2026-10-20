# greenscreen-reaction

The TikTok **greenscreen reaction**: a video plays full screen (usually a TikTok screen recording or an app demo) while a creator, **cut out of their own background**, talks over it from a corner. Both soundtracks play. Reel length = the video's length, 1080×1920 @ 30fps.

```
[ video · full screen · its sound, ducked under the creator ]
   ├─ [ creator, background removed · bottom-left · their voice ]
   └─ [ hook caption · top of the safe band ]
```

The cut-out can also **open somewhere else and get dragged into place**: centred for the first 2s, then dragged down to the corner (`--start-position center`).

No real green screen is needed. A local AI matting model (`hyperframes remove-background`) removes the background, which is what TikTok's in-app effect does.

[![greenscreen-reaction preview](https://raw.githubusercontent.com/danielhangan/reelclaw-templates/main/examples/greenscreen_reaction_preview.gif)](https://github.com/danielhangan/reelclaw-templates/blob/main/examples/greenscreen_reaction.mp4)

## Install

```bash
npx reelclaw@latest add greenscreen-reaction     # Claude Code + Codex instructions included
```

Then ask your agent "make a greenscreen reaction with me.mp4 over screen.mp4", or run it yourself:

```bash
npx reelclaw make greenscreen-reaction \
  --video screen-recording.mp4 \
  --reaction me-reacting.mp4 \
  --hook "please tag the app developer bc they lowkey saved my life" \
  --start-position center \
  --render
# → renders/greenscreen-reaction-1.mp4
```

**The first run on a new reaction clip** spends about 1s per second of footage on background removal (CoreML on Apple Silicon; slower on CPU-only machines). It also downloads the matting model once (~170 MB). The transparent cut-out is cached in `assets/` by content hash, so every later reel with the same clip (new hook, size, position) is instant. Already have a transparent clip (`.webm` with alpha or ProRes 4444 `.mov`)? Pass it as `--reaction` and matting is skipped.

Each run writes `reels/<name>.html`, a plain HyperFrames composition you (or your agent) can edit by hand, and `reels/<name>.json` with the inputs used. To make a variant in seconds, run `--props reels/<name>.json --hook "…" --name v2`.

## Flags

<!-- reelclaw:flags:start -->
| Flag | Default | Meaning |
| --- | --- | --- |
| `--video <file\|url>` | **required** | Background video, full screen (TikTok/screen recording/clip). Landscape gets a blurred fill |
| `--reaction <file\|url>` | **required** | Creator reaction clip; its background is removed (or pass a transparent .webm/.mov) |
| `--hook "text"` | — | Hook caption |
| `--hook-position top\|center\|bottom` | `top` | Where the hook sits in the safe band (top clears the cut-out) |
| `--hook-style tiktok-outline\|tiktok-box\|tiktok-box-dark\|plain` | `tiktok-outline` | Caption look |
| `--hook-size <26..120px>` | `58` | Base caption size; long text auto-shrinks to fit |
| `--hook-start <secs>` | `0` | When the hook appears |
| `--hook-secs <secs>` | — | How long the hook stays up (default: rest of the reel) |
| `--size <5..100%>` | `40` | Cut-out width as % of the frame width, measured on the person |
| `--position top-left\|top-center\|top-right\|center-left\|center\|center-right\|bottom-left\|bottom-center\|bottom-right` | `bottom-left` | Where the cut-out rests |
| `--margin <px>` | `0` | Inset from the frame edges (0 = flush, body runs off the bottom) |
| `--x <px>` | — | Exact cut-out left edge; overrides --position on that axis |
| `--y <px>` | — | Exact cut-out top edge; overrides --position on that axis |
| `--flip` | `false` | Mirror the cut-out so the creator faces into the frame |
| `--crop auto\|none` | `auto` | auto: size/place the person (alpha bounding box); none: the whole source frame |
| `--start-position top-left\|top-center\|top-right\|center-left\|center\|center-right\|bottom-left\|bottom-center\|bottom-right` | — | Opening spot; the cut-out is then dragged to --position (turns the drag on) |
| `--start-x <px>` | — | Exact opening left edge (turns the drag on) |
| `--start-y <px>` | — | Exact opening top edge (turns the drag on) |
| `--start-size <5..100%>` | — | Opening width, to grow/shrink during the drag (turns the drag on) |
| `--move-at <secs>` | — | When the drag starts (default 2) |
| `--move-secs <0.1..5s>` | — | Drag duration (default 0.9) |
| `--move-ease "text"` | — | GSAP ease of the drag (default power2.inOut, reads as a hand) |
| `--length video\|reaction` | `video` | What sets the reel length; reaction loops the video under a longer reaction |
| `--secs <secs>` | — | Cap the reel length |
| `--video-trim <secs>` | `0` | Offset into the background video (start right before its wow moment) |
| `--video-fit auto\|cover\|blur` | `auto` | auto: cover for portrait, blurred fill for landscape |
| `--overlay-start <secs>` | `0` | When the cut-out appears |
| `--reaction-trim <secs>` | `0` | Offset into the reaction clip |
| `--reaction-secs <secs>` | — | How long the cut-out stays (default: the rest of the clip) |
| `--video-volume <0..1>` | — | Background audio (default 0.5 under a talking creator, 1 if the reaction is silent) |
| `--reaction-volume <0..1>` | `1` | Reaction audio |
| `--cutout-quality fast\|balanced\|best` | `balanced` | Matting encode quality (first run only) |
<!-- reelclaw:flags:end -->

Plus the flags every template takes: `--props file.json`, `--name`, `--render`, `--draft`, `--quality`, `--workers` (`npx reelclaw make --help`).

## Picking a size

`--size` is the cut-out's width as a percentage of the frame width, measured on the **person**: `--crop auto` (the default) first trims the transparent padding around them.

| `--size` | Reads as |
| --- | --- |
| `15`–`25` | Small corner thumbnail; the video is the star |
| `40`–`50` (default `40`) | The classic greenscreen: the creator's head and shoulders own the bottom corner |
| `60`+ | The creator is the star and the video is backdrop |

## Examples

Classic: big creator bottom-left, both sounds on:

```bash
npx reelclaw make greenscreen-reaction --video screen.mp4 --reaction react.mp4 --render
```

Opens big in the centre and shrinks as it's dragged to the bottom-right, mirrored to face the content:

```bash
npx reelclaw make greenscreen-reaction --video screen.mp4 --reaction react.mp4 \
  --position bottom-right --flip --start-position center --start-size 60 \
  --move-at 1.5 --move-secs 1.2 --render
```

Creator pops in at 2s and the reel ends with them; the video loops if the reaction runs longer:

```bash
npx reelclaw make greenscreen-reaction --video screen.mp4 --reaction react.mp4 \
  --overlay-start 2 --length reaction --video-volume 0.3 --render
```

Pixel-exact placement (e.g. lifted clear of the TikTok caption stack):

```bash
npx reelclaw make greenscreen-reaction --video screen.mp4 --reaction react.mp4 \
  --size 35 --x 40 --y 1180 --render
```

## Notes and deviations from [RULES.md](https://github.com/danielhangan/reelclaw-templates/blob/main/RULES.md)

- **Audio: both tracks on by default.** The repo default is muted clips over a music bed. This format is a creator talking over a video, so muting either side defeats it. The creator's voice comes from the original clip (the cut-out WebM is silent), levelled to -14 LUFS. The video's own sound plays at 0.5 under it, or at 1 when the reaction is silent, and fades out over the last 0.5s. There is no `--music` flag: a third layer under two live tracks turns to mud.
- **The cut-out sits in the platform UI zone on purpose.** The safe band governs *text*, which must stay readable. A corner cut-out overlapping the caption stack is the native look. The hook respects the band and is painted above the creator; the generator warns when it would sit on them.
- **The drag is the one motion.** It is a single eased transform on the paused GSAP timeline, so it is seek-safe. Captions stay static.
- **Landscape videos** are shown whole over a blurred, darkened copy of themselves (`--video-fit auto`). Use `--video-fit cover` to crop to fill instead.
- **v1 changes:** the default `--size` is now 40 (was 15), `--force-cutout` is gone (cut-outs are keyed by content, so a changed clip is re-cut automatically; delete `assets/*.cutout-*.webm` to force it), and `--hook-style`, `--length`, `--video-fit` and transparent `--reaction` inputs are new.
- Matting quality depends on the footage. Even lighting and clear subject/background separation cut cleanly. Motion blur, and hair against a busy background, show artifacts. Check a `--draft` before the final render.

## Requirements

- Node 22+, `ffmpeg`/`ffprobe` on PATH (run `npx reelclaw doctor`). ffmpeg needs `libvpx-vp9` to read the cut-out's alpha channel; the standard Homebrew/apt builds have it.
- The matting model downloads on first use (~170 MB) and is cached in `~/.cache/hyperframes/`.
