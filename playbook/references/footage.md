# Footage: sourcing, choosing and trimming

## Where footage comes from (in this order)

1. **The user's own files**: camera roll, screen recordings, photos, past exports. Every media input
   takes a local path; `make` copies it into `assets/` under a content-hashed name and never touches
   the original. A `footage/` folder in the project keeps things tidy.
2. **Links to the user's own posts**: TikTok / Instagram / YouTube / X page links work as inputs
   (needs yt-dlp). Direct file URLs (`https://…/clip.mp4`) work without it.
3. **Shoot it now.** Most inputs are a phone away: a 3-second selfie reaction, a phone propped behind
   the laptop for a typing shot, a screen recording (iOS/Android screen recorder; macOS QuickTime →
   File → New Screen Recording). Tell the user exactly what to film and for how long.
4. **Optional: real-creator clips from DansUGC**, when the user wants a creator's face and has (or
   wants) the DansUGC MCP. Never required: [dansugc.md](dansugc.md).

**Never pull someone else's post as footage.** A link to another creator's viral video is for
studying the format (pacing, hook structure, layout), not an input. Only use footage the user has
the rights to.

## What good footage looks like, per role

| Role (template input) | Good | Avoid |
| --- | --- | --- |
| Reaction (`reaction-demo --reaction`, `listicle --hook-clip`) | vertical, face large and lit, expression peaks in the first 0.5–1.5 s, clean background | burned-in text or stickers, a slow build-up, a face in the bottom UI zone |
| Greenscreen reaction (`greenscreen-reaction --reaction`) | waist- or chest-up, facing the camera, evenly lit, plain-ish background, talking | busy backgrounds, motion blur, frizzy backlit hair (matting halos) |
| Demo / screen recording (`--demo`, `--video`, listicle items) | portrait phone recording; the aha within ~2 s of where it starts | logins, loading spinners, notifications, real customer data |
| B-roll (`wall-of-text --broll`, `talking-head-captions --broll`) | aesthetic and low-information: hands on a phone, a walk, a desk, a coffee, night light | busy scenes that fight the text, faces that the text box covers |
| Intro / typing (`no-yapping`) | the gag in the first second (mouth tape, "shh"); hands + keyboard + screen visible | long set-ups; a typing shot that crops away the hands |
| Talking head (`talking-head-captions --clip`) | eye-level, close, clean audio, starts on a strong line | music under the voice, long silences at the start |
| Before / after (`before-after`) | same angle, distance and light in both | mismatched shots (they look fake once the swipe lands) |

Vertical sources need no reframing. Landscape footage is handled per template: `reaction-demo` sets
a landscape demo over a blurred copy automatically; `no-yapping` has `--demo-fit` / `--demo-focus`;
`listicle` and `wall-of-text` have `--fill` / `--focus`; `greenscreen-reaction` has `--video-fit`;
`before-after` and `talking-head-captions` have `--focus-x` / `--focus-y`. Check the result in QA.

## Trim to the peak (frame sheet)

A hook segment is ~3 s, so it must start just before the peak expression and cut right after it
lands. Look instead of guessing: a 4 fps sheet of the first 6 s, with timestamps.

```bash
ffmpeg -v error -y -i footage/reaction.mp4 -t 6 \
  -vf "fps=4,scale=180:-2,drawtext=text='%{pts\:hms}':x=6:y=6:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6,tile=8x3" \
  -frames:v 1 footage/reaction-sheet.png
```

No `drawtext` in this ffmpeg build? Drop the `drawtext=…,` part: frames are 0.25 s apart, left to
right. Open the PNG and pick the window, then pass it with the template's trim flags:

| Template | Trim flags |
| --- | --- |
| `reaction-demo` | `--trim` (peak visible by ~0.5 s into the segment), `--reaction-secs` ≤ 3 (cut right after the peak) |
| `greenscreen-reaction` | `--reaction-trim`, `--reaction-secs`, `--overlay-start`; `--video-trim` starts the background right before its wow moment |
| `no-yapping` | `--intro-trim`, `--typing-trim`, `--demo-trim`, `--demo-secs` |
| `talking-head-captions` | `--trim` (start on the strongest line), `--end` |
| `listicle`, `wall-of-text`, `before-after` | no per-clip trim: pre-trim the files (below) |

Comparing several candidate clips? Make a sheet for each and keep the one whose peak lands earliest,
with the biggest, clearest face and no text on screen.

## Pre-trim demos to the aha

The viewer must see the product doing the thing within ~2 s of the cut. Nobody watches a login
screen. Cut the recording so it starts right before the aha (re-encode for frame-accurate cuts):

```bash
ffmpeg -v error -y -ss <start> -i demo.mov -t <seconds> -c:v libx264 -crf 18 -pix_fmt yuv420p \
  -g 30 -keyint_min 30 -c:a aac -movflags +faststart footage/demo-aha.mp4
```

`-g 30` puts a keyframe every second, which keeps seeking clean. Speed up a slow stretch instead of
cutting it: add `-vf "setpts=PTS/1.5" -af "atempo=1.5"`. Aim for a 7–12 s demo in `reaction-demo`
(it plays the whole file) and use `--demo-trim` / `--demo-secs` in `no-yapping`.

## Checks before you make

- **No burned-in text** in clips that sit under a hook: two captions on screen at once kills it.
  Pick another clip or a trim window without the text.
- **Nothing private** on screen: API keys, emails, phone numbers, customer data, notifications.
- **Rights**: the user filmed it, owns it, licensed it, or bought it. If unsure, ask.
