# reelclaw-templates

Reusable [HyperFrames](https://hyperframes.heygen.com) video templates for TikTok / Instagram Reels growth content. Each template is a self-contained HyperFrames project with a generator script: give it media + text, get a render-ready 1080×1920 MP4.

All templates follow the shared platform rules in [RULES.md](RULES.md) — TikTok Sans typography, classic white/black-outline captions, cross-platform safe zones, auto text sizing, and deterministic rendering.

## See it in action

One command in, one reel out — the `reaction_demo` generator building and rendering a reel end-to-end:

[![reaction_demo template demo — click for full quality](examples/reaction_demo_preview.gif)](examples/reaction_demo.mp4)

*Click the preview to watch the full-quality video.*

## Templates

| Template | Format | Inputs |
| --- | --- | --- |
| [`reaction_demo`](templates/reaction_demo/) | Creator reaction with hook caption → hard cut to app demo | reaction video, demo video, hook text, optional music + second hook |
| [`no_yapping`](templates/no_yapping/) | "…but no yapping" silent split-screen tutorial — fullscreen intro, then 50/50 typing/demo split, captions at the seam | intro video, typing video, demo video, hook text, ordered step captions, optional music |

## Requirements

- Node.js 18+
- `ffmpeg` / `ffprobe` on PATH (media probing + frame extraction)
- Headless Chrome is managed automatically by the HyperFrames CLI
- Optional: `yt-dlp` for downloading page links (TikTok/IG/YouTube) as inputs

## Quickstart

```bash
cd templates/reaction_demo

node new-reel.mjs \
  --reaction path/or/url/to/reaction.mp4 \
  --demo path/or/url/to/demo.mp4 \
  --hook "i was about to hit it and this app talked me out of it" \
  --render

# → renders/reel-1.mp4 (1080x1920 @ 30fps)
```

See each template's README for the full flag reference.

## Repo layout

```
fonts/                      TikTok Sans (canonical copy + OFL license)
templates/<name>/           one self-contained HyperFrames project per template
  new-reel.mjs              generator: inputs → composition → render
  assets/fonts/             font embedded by generated compositions
  compositions/             generated per reel (gitignored)
  index.html                placeholder composition (real ones are generated)
RULES.md                    shared platform + style rules for all templates
```

## Adding a new template

1. `npx hyperframes init templates/<template_name> --non-interactive --example=blank`
2. Copy `fonts/` into `templates/<template_name>/assets/fonts/`
3. Write a generator script that stamps out compositions from CLI inputs
4. Follow [RULES.md](RULES.md) for typography, captions, safe zones, and audio defaults
5. Add a README documenting the format and every flag
6. Register it in the table above

## Licenses

- TikTok Sans is redistributed under the [SIL Open Font License 1.1](fonts/OFL.txt).
- Video/audio inputs you feed the generators are your responsibility (rights + platform terms).
