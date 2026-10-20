# listicle

**Numbered listicle / countdown.** It is the "3 apps that feel illegal to know" and "things I wish I knew at 20" format. A hook title card leads into N numbered items, each with its own clip or photo, a title and an optional note, and an optional CTA card closes it. The numbering badge stays consistent across items, and cuts can snap to the music's beats. 10–20s, 1080×1920 @ 30fps.

```
[ hook card ][ ① title · note ][ ② title · note ] … [ cta (optional) ]
```

## Install

```bash
npx reelclaw@latest add listicle          # Claude Code + Codex instructions included
```

Then ask your agent "make a listicle of these 3 apps", or run it yourself:

```bash
npx reelclaw make listicle --hook "3 apps that feel illegal to know" \
  --item perplexity.mov --title "perplexity" --note "does your research in 10 seconds" \
  --item removebg.png   --title "remove.bg" \
  --item cal.mov        --title "notion calendar" --note "plans your whole week" \
  --numbering down --cta "which one are you downloading first?" --render
# → renders/listicle-1.mp4
```

`--item`, `--title` and `--note` pair up by position. Pass `""` to skip a note.

## Flags

<!-- reelclaw:flags:start -->
| Flag | Default | Meaning |
| --- | --- | --- |
| `--hook "text"` | **required** | Title card text |
| `--item <file\|url>` | **required** | Footage per item (video or photo), in order (repeatable) |
| `--title "text"` | **required** | Title per item, same order as --item; append ' :: 4' to give one item 4s (repeatable) |
| `--note "text"` | — | Optional note under each item (what it does); use "" to skip one (repeatable) |
| `--hook-clip <file\|url>` | — | Footage under the hook card (default: the first item's footage) |
| `--hook-secs <0.8..8s>` | — | Hook card length (default: from its reading time, 1.8–3.5s) |
| `--item-secs <0.8..15s>` | `3` | Seconds per item |
| `--cta "text"` | — | Optional closing card over the last item's footage |
| `--cta-secs <1..8s>` | `2.5` | CTA card length |
| `--numbering up\|down\|none` | `up` | 1→N, countdown N→1 (best last), or no numbers |
| `--number-style badge\|inline` | `badge` | Number in a round badge above the title, or inline ("1. title") |
| `--badge-color "text"` | `#fe2c55` | Badge colour (any CSS colour) |
| `--text-style tiktok-outline\|tiktok-box\|tiktok-box-dark\|plain` | `tiktok-box` | TikTok's native white box (default), dark box, classic white-with-outline, or plain |
| `--title-size <30..110px>` | `62` | Base title size; long titles shrink to fit |
| `--fill auto\|cover\|blur` | `auto` | Footage framing: auto = fill portrait, blur-fill landscape |
| `--focus center\|top\|bottom\|left\|right` | `center` | Which part of cropped footage stays in frame |
| `--music <file\|url>` | — | Background music (fades out over the last 0.8s) |
| `--music-volume <0..1>` | `1` | Music level |
| `--music-start <secs>` | `0` | Offset into the music track (start on the drop) |
| `--beat-sync` | `true` | Snap cuts to the music's beats (with --music) |
| `--item-volume <0..1>` | `0` | Item footage's own sound (muted by default) |
<!-- reelclaw:flags:end -->

Plus the flags every template takes: `--props file.json`, `--name`, `--render`, `--draft`, `--quality`, `--workers` (`npx reelclaw make --help`).

## How it decides things

- **Timing.** The hook lasts its reading time, clamped to 1.8–3.5s (`--hook-secs` overrides). Each item lasts `--item-secs`, or its own `"title :: secs"`. The CTA lasts `--cta-secs`. The total is the sum of these.
- **Beat sync.** With `--music`, every cut moves to the nearest beat within 0.45s while keeping items at least 0.8s long. Beats are detected once by the pinned HyperFrames (`hyperframes beats`) and cached per track. Turn this off with `--no-beat-sync`.
- **Footage.** Without `--hook-clip`, the hook plays over the first item's footage, which then continues into item 1. The CTA continues the last item's footage. Short videos loop seamlessly. `--fill auto` fills the frame with portrait footage and shows landscape and square footage whole over a blurred copy of itself. Photos get a slow push-in.
- **Layout.** All text stays inside the safe band ([RULES.md](https://github.com/danielhangan/reelclaw-templates/blob/main/RULES.md)). The badge and title sit at the top, the note at the bottom, and the middle is left for the footage. All text is static and auto-shrinks to fit.

## Notes

- Item sound is muted by default (`--item-volume` turns it on). Music fades out over the last 0.8s.
- Building blocks: `nativeText()`, `numberBadge()`, `visual()`, `detectBeats()` and `snapToBeats()` from `"reelclaw"` (`packages/reelclaw/src/core/components/`).
- Need hook footage? Use your own clips, or browse real-creator reaction clips at [dansugc.com](https://dansugc.com). This is optional.
