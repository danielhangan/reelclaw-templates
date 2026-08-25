# reelclaw-templates

> ### 🎬 Need creator footage for these templates?
>
> Every template here starts with real UGC — reaction hooks, typing shots, creator intros. **[DanSUGC](https://dansugc.com)** has UGC reaction videos from real creators, from **$5/video**, ready to drop straight into any template below. **→ [dansugc.com](https://dansugc.com)**

Reusable [HyperFrames](https://hyperframes.heygen.com) video templates for TikTok / Instagram Reels growth content. Each template is a self-contained HyperFrames project with a generator script: give it media + text, get a render-ready 1080×1920 MP4.

All templates follow the shared platform rules in [RULES.md](RULES.md) — TikTok Sans typography, classic white/black-outline captions, cross-platform safe zones, auto text sizing, and deterministic rendering.

## See it in action

One command in, one reel out. Click a preview to watch the full-quality video.

| [`reaction_demo`](templates/reaction_demo/) — generator + render, end to end | [`no_yapping`](templates/no_yapping/) — example output reel | [`greenscreen_reaction`](templates/greenscreen_reaction/) — example output reel |
| :---: | :---: | :---: |
| [![reaction_demo demo](examples/reaction_demo_preview.gif)](examples/reaction_demo.mp4) | [![no_yapping demo](examples/no_yapping_preview.gif)](examples/no_yapping.mp4) | [![greenscreen_reaction demo](examples/greenscreen_reaction_preview.gif)](examples/greenscreen_reaction.mp4) |

## Templates

| Template | Format | Inputs |
| --- | --- | --- |
| [`reaction_demo`](templates/reaction_demo/) | Creator reaction with hook caption → hard cut to app demo | reaction video, demo video, hook text, optional music + second hook |
| [`no_yapping`](templates/no_yapping/) | "…but no yapping" silent split-screen tutorial — fullscreen intro, then 50/50 typing/demo split, captions at the seam | intro video, typing video, demo video, hook text, ordered step captions, optional music |
| [`greenscreen_reaction`](templates/greenscreen_reaction/) | TikTok greenscreen reaction — one video fullscreen, creator cut out of their background over it (optionally dragged from centre into the corner), both soundtracks on | full video (usually a TikTok screen recording), reaction video, optional hook text + size / position |

## Requirements

- Node.js 18+
- `ffmpeg` / `ffprobe` on PATH (media probing + frame extraction)
- Headless Chrome is managed automatically by the HyperFrames CLI
- Optional: `yt-dlp` for downloading page links (TikTok/IG/YouTube) as inputs

## Quickstart

Install any single template into its own folder with one command — no clone needed:

```bash
npx reelclaw-templates@latest                 # interactive picker
npx reelclaw-templates@latest reaction_demo   # or name one directly
```

That scaffolds `./reaction_demo` with everything it needs — including `RULES.md` and a `CLAUDE.md` that teaches Claude Code the requirements, the generator, and the viral-hook playbook — then checks your environment (Node, ffmpeg, yt-dlp) and prints next steps. From there, either drive it with Claude Code:

```bash
cd reaction_demo && claude
# > "make me a reel with reaction.mp4 and demo.mov"
```

…or run the generator directly:

```bash
cd reaction_demo

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
cli/                        the `reelclaw-templates` npm installer (npx reelclaw-templates)
fonts/                      TikTok Sans (canonical copy + OFL license)
templates/<name>/           one self-contained HyperFrames project per template
  new-reel.mjs              generator: inputs → composition → render
  CLAUDE.md                 template guide for Claude Code: requirements, usage, viral playbook
  assets/fonts/             font embedded by generated compositions
  compositions/             generated per reel (gitignored)
  index.html                placeholder composition (real ones are generated)
RULES.md                    shared platform + style rules for all templates
```

The installer fetches templates from this repo's `main` branch at run time, so publishing a new template only requires pushing it here — no npm release needed.

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
