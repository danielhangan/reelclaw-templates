# talking-head-captions

A talking-to-camera clip edited like a top-performing talking-head reel: **bold word-by-word captions** (1–3 words at a time, the spoken word highlighted), dead air trimmed, long pauses jump-cut, punch-in zooms on alternate sentences, an optional hook title, b-roll cutaways and music ducked under a loudness-levelled voice. 1080×1920 @ 30fps; the length follows the speech.

```
[ speaker · own voice · hook title (first ~2.5s) · STOP SCROLLING ← spoken word in yellow ]
      └ b-roll cutaways on top at chosen moments (voice + captions keep going)
```

## Install

```bash
npx reelclaw@latest add talking-head-captions      # Claude Code + Codex instructions included
```

Then ask your agent "add captions to selfie.mp4", or run it yourself:

```bash
npx reelclaw make talking-head-captions --clip selfie.mp4 \
  --hook "3 things nobody tells you about growing on tiktok" --render
# → renders/talking-head-captions-1.mp4
```

Word timings come from `hyperframes transcribe` (local whisper.cpp; the first run downloads the model) and are cached as `assets/<clip>.words-<model>.json` — edit that file to fix a misheard word, or pass your own `--transcript words.json|.srt|.vtt`.

## Flags

<!-- reelclaw:flags:start -->
| Flag | Default | Meaning |
| --- | --- | --- |
| `--clip <file\|url>` | **required** | Talking-to-camera clip; its voice is the soundtrack |
| `--transcript "text"` | — | Word-timed transcript (.json, .srt or .vtt) — skips transcription; fix misheard words here |
| `--hook "text"` | — | Title over the first seconds |
| `--hook-secs <0.5..15s>` | `2.5` | How long the hook title stays up |
| `--hook-theme white\|dark\|black\|red\|yellow` | `white` | Hook look: TikTok's native text box (white, dark, black, red, yellow) |
| `--caption-style pop\|box\|color` | `pop` | pop: outlined, spoken word coloured + bigger; box: spoken word on a colour box; color: recolour only |
| `--highlight "text"` | `#ffe500` | Colour of the spoken word (or its box) |
| `--caption-position lower\|center\|upper` | `lower` | Caption strip inside the safe band: under the chin, mid-frame or up top |
| `--caption-case upper\|lower\|as-spoken` | `upper` | Caption letter case |
| `--words-per-chunk <1..4>` | `3` | Most words on screen at once |
| `--caption-size <40..140px>` | `84` | Base caption size; long chunks shrink to fit |
| `--broll <file\|url>` | — | B-roll cutaway (video or image) shown full screen over the speaker; pair each with --broll-at (repeatable) |
| `--broll-at "text"` | — | When each --broll shows, in the clip's own seconds: "4.2-6", "4.2+2" or "4.2" (2s) (repeatable) |
| `--trim <secs>` | — | Where to start in the clip (default: just before the first word) |
| `--end <secs>` | — | Where to stop in the clip (default: 0.5s after the last word) |
| `--max-pause <0..5s>` | `0.6` | Pauses longer than this are cut down to 0.3s (0 keeps every pause) |
| `--punch-in <1..1.5>` | `1.12` | Zoom on every other sentence / cut (1 = off) |
| `--focus-x <0..100%>` | `50` | Speaker's position left → right (matters for landscape footage) |
| `--focus-y <0..100%>` | `38` | Eye-line height; punch-ins zoom towards it |
| `--voice-volume <0..1>` | `1` | Speaker's voice level |
| `--normalize` | `true` | Level the voice to -14 LUFS, the loudness TikTok/IG/YouTube play at |
| `--music <file\|url>` | — | Background music under the voice (fades out over the last 0.8s) |
| `--music-volume <0..1>` | `0.12` | Music level — low by default so it sits under the voice |
| `--music-start <secs>` | `0` | Offset into the music track |
| `--model tiny.en\|base.en\|small.en\|medium.en\|large-v3` | `small.en` | Whisper model for transcription (tiny.en is fastest, large-v3 most accurate) |
| `--language "text"` | — | Spoken language code if not English (e.g. es, de, pt) — uses a multilingual model |
<!-- reelclaw:flags:end -->

Plus the flags every template takes: `--props file.json`, `--name`, `--render`, `--draft`, `--quality`, `--workers` (`npx reelclaw make --help`).

## Examples

Box-highlight captions, b-roll over two moments, quiet music:

```bash
npx reelclaw make talking-head-captions --clip selfie.mp4 \
  --caption-style box --highlight "#7c3aed" \
  --broll app.mov --broll-at 4.2-7 \
  --broll result.png --broll-at 12+2.5 \
  --music track.mp3 --music-volume 0.15 --render
```

Landscape podcast clip, speaker on the left, gentle cuts, Spanish:

```bash
npx reelclaw make talking-head-captions --clip podcast.mp4 --focus-x 30 \
  --max-pause 1 --punch-in 1.08 --language es --render
```

## Notes

- **Voice audio is on** (this format needs it, unlike the RULES.md §6 default). It plays from a separate loudness-normalised `<audio>` track (-14 LUFS); `--no-normalize` uses the clip's own sound.
- Captions stay inside the safe band (`lower` strip: y 1010–1370). Chunks appear and disappear instantly (RULES.md §3); only the word highlight moves.
- Pause cutting and punch-ins need word timings; `--max-pause 0 --punch-in 1` keeps the clip untouched.
- `--broll-at` times are in the **clip's own seconds** (what your player shows for the source file), so they stay on the right words however pauses are cut.
- Need footage? Use your own clips, or browse real-creator UGC at [dansugc.com](https://dansugc.com) (optional).
