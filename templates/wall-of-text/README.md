# wall-of-text

**POV / storytime / wall of text over b-roll.** A long first-person text in TikTok's native text box (white rounded background, black text, lines merged like the in-app tool) over b-roll clips or photos. The b-roll is looped and cut to fill. An optional second card swaps in on a cut for the reveal. 6–15s, 1080×1920 @ 30fps.

```
[ b-roll 1 | b-roll 2 | …  (cut evenly, or on the music's beats) ]
[ text card ······················ ][ text2 card (optional) ]
```

## Install

```bash
npx reelclaw@latest add wall-of-text          # Claude Code + Codex instructions included
```

Then ask your agent "make a wall of text reel from these clips about …", or run it yourself:

```bash
npx reelclaw make wall-of-text \
  --broll bed-scroll.mp4 --broll sunrise.jpg \
  --text "pov: you stopped doomscrolling at 2am because your phone literally locks you out after 11pm" \
  --text2 "the app is called lumen btw" \
  --render
# → renders/wall-of-text-1.mp4
```

## Flags

<!-- reelclaw:flags:start -->
| Flag | Default | Meaning |
| --- | --- | --- |
| `--broll <file\|url>` | **required** | B-roll videos or photos, used in order and looped/cut to fill the reel (repeatable) |
| `--text "text"` | **required** | The wall of text (first card). Newlines are kept |
| `--text2 "text"` | — | Optional second card that replaces the first on a cut (the reveal / payoff) |
| `--text2-at <secs>` | — | When the second card replaces the first (default ≈55% in, on a cut) |
| `--duration <2..60s>` | — | Reel length (default: from the b-roll, 6–10s; 9–15s with a second card) |
| `--clip-secs <0.5..30s>` | — | Seconds per b-roll cut (default: an equal share per clip) |
| `--text-style tiktok-outline\|tiktok-box\|tiktok-box-dark\|plain` | `tiktok-box` | TikTok's native white box (default), dark box, classic white-with-outline, or plain |
| `--text-position top\|center\|bottom` | `center` | Where the text sits inside the safe band |
| `--text-size <30..90px>` | — | Base text size (default: by length, 64 short → 50 long); long text shrinks to fit |
| `--align center\|left` | `center` | Text alignment |
| `--fill auto\|cover\|blur` | `auto` | Footage framing: auto = fill portrait, blur-fill landscape |
| `--focus center\|top\|bottom\|left\|right` | `center` | Which part of cropped footage stays in frame |
| `--dim <0..0.7>` | `0` | Darken the footage (0–0.7) — helps the outline style |
| `--music <file\|url>` | — | Background music (fades out over the last 0.8s) |
| `--music-volume <0..1>` | `1` | Music level |
| `--music-start <secs>` | `0` | Offset into the music track (start on the drop) |
| `--beat-sync` | `true` | Snap cuts and the card swap to the music's beats (with --music) |
| `--broll-volume <0..1>` | `0` | B-roll's own sound (muted by default) |
<!-- reelclaw:flags:end -->

Plus the flags every template takes: `--props file.json`, `--name`, `--render`, `--draft`, `--quality`, `--workers` (`npx reelclaw make --help`).

## How it decides things

- **Length.** By default the length is the b-roll's natural length clamped to 6–10s, or 9–15s with `--text2`. Images count as 2.5s. Short videos loop seamlessly (back-to-back segments, no black frames). `--duration` overrides it.
- **Cuts.** Each card's window is split into equal slots, cycling through `--broll` in order. A video that comes round again continues where it left off. The swap to `--text2` always lands on a cut. With `--music`, cuts and the swap snap to beats (detected once by the pinned HyperFrames and cached). Turn this off with `--no-beat-sync`.
- **Framing (`--fill auto`).** Portrait footage fills the frame (`--focus` picks which part stays in view). Landscape and square footage is shown whole over a blurred copy of itself, the native look. Photos get a slow 8% push-in.
- **Text.** The text auto-shrinks to fit the cross-platform safe band ([RULES.md](https://github.com/danielhangan/reelclaw-templates/blob/main/RULES.md)) and is static, with no transitions. Blank lines (`\n\n`) split it into separate boxes, like the app.

## Examples

Dark box, left-aligned, three clips cut every 2s on the beat:

```bash
npx reelclaw make wall-of-text --broll a.mp4 --broll b.mp4 --broll c.mp4 \
  --text "storytime: i cancelled 6 subscriptions in one night and here is what happened" \
  --text-style tiktok-box-dark --align left --clip-secs 2 --music track.mp3 --music-start 14 --render
```

Classic white-with-outline text over darkened footage:

```bash
npx reelclaw make wall-of-text --broll walk.mov --text "nobody talks about how lonely your first year after college is" \
  --text-style tiktok-outline --dim 0.3 --render
```

## Notes

- B-roll sound is muted by default (`--broll-volume` turns it on). Music fades out over the last 0.8s.
- The text is drawn with a `nativeText()` component (`packages/reelclaw/src/core/components/native-text.mjs`). In `reels/<name>.html` each card's text appears twice, a background copy and a foreground copy, so edit both.
- Need footage? Use your own clips, or browse real-creator UGC at [dansugc.com](https://dansugc.com). This is optional.
