# no_yapping

The **"…but no yapping"** step-tutorial reel: creator footage with a hook caption, then a sequence of silent steps — each one slides a full-width screen-recording panel over the bottom of the frame with a short imperative caption at the seam. No voiceover; the silence is the format. ~15–50s, 1080×1920 @ 30fps.

```
[ creator fullscreen · hook caption ]
[ creator top strip + screen panel · "go to claude"       ]
[ creator top strip + screen panel · "paste ur script"    ]
[ creator top strip + screen panel · "easyyy 10 bands" 💰 ]
```

## Usage

```bash
node new-reel.mjs \
  --creator footage/me-fidgeting.mp4 \
  --hook "making \$10k but no yapping" \
  --step "go to claude :: clips/claude.mov" \
  --step "paste ur script :: clips/paste.mov :: 4" \
  --step "easyyy 10 bands :: clips/revenue.mov" \
  --render
```

Each `--step` is `"caption :: clip [:: secs [:: trim]]"` — clip path or URL, optional segment length (default 3s), optional offset into the clip. For long lists, `--steps steps.json`:

```json
[
  { "caption": "go to claude", "clip": "clips/claude.mov" },
  { "caption": "paste ur script", "clip": "clips/paste.mov", "secs": 4, "trim": 2 }
]
```

## Flags

| Flag | Default | Meaning |
| --- | --- | --- |
| `--creator <file\|url>` | required | Base footage; loops automatically if shorter than the reel |
| `--hook "text"` | required | Caption over the intro segment |
| `--step "caption :: clip [:: secs [:: trim]]"` | ≥1 required | Repeatable; ordered |
| `--steps <file.json>` | — | Steps as JSON instead of flags |
| `--hook-secs` | `3` | Intro length before the first step |
| `--step-secs` | `3` | Default per-step length |
| `--creator-trim <s>` | `0` | Offset into the creator clip |
| `--hook-size` / `--step-size` | `62` / `54` | Base caption sizes (auto-shrink, floor 26px) |
| `--music <file\|url>` | — | BGM, fades out over the last 0.8s |
| `--music-volume` / `--music-start` | `1` / `0` | Music level / offset |
| `--creator-volume` / `--step-volume` | `0` / `0` | Clip audio (muted by default — no yapping) |
| `--name` | auto `yap-N` | Kebab-case reel name |
| `--render` / `--draft` | off | Render after generating / draft quality |

## Layout

- Creator footage plays fullscreen for the whole reel (looping as needed).
- Each step covers the bottom **57%** of the frame (y 830→1920) with a white panel; the recording fits inside it top-aligned — landscape recordings fill the width (white below), portrait phone recordings show in full with white pillars.
- Pick creator footage with the face in the **upper third** of the frame — only the top 43% stays visible during steps.
- Step captions sit at the face/panel seam (~42% height); the hook caption sits higher on the intro. Both follow repo [RULES.md](../../RULES.md): TikTok Sans, white/black-outline, static, auto-sized.
- Silent by default — post it with a trending sound, or pass `--music`.
