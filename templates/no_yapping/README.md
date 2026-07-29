# no_yapping

The **"…but no yapping"** split-screen tutorial reel, built from **2 videos**:

1. **Intro** — the creator fullscreen with the hook caption (the mouth-tape moment). Default 6s.
2. **Split** — 50/50 split screen: the creator continues in the top half, the demo screen recording plays in the bottom half, and short step captions change at the seam. No voiceover — the silence is the format.

```
[ creator 100% · "making $10k but no yapping" ]   0 → 6s
[ creator 50%  ]
[ ——— caption at the seam: "go to claude" ——— ]   6s → end (demo length)
[ demo 50%     ]
```

## Usage

```bash
node new-reel.mjs \
  --creator footage/me-mouthtape.mp4 \
  --demo clips/full-screen-recording.mov \
  --hook "making \$10k but no yapping" \
  --step "go to claude" \
  --step "paste ur script :: 4" \
  --step "easyyy 10 bands" \
  --render
```

Steps are captions timed over the split segment: `"caption [:: secs]"` (default 3s each), running in order from the split point — the **last caption holds to the end** (that's your payoff line). For long lists use `--steps steps.json` with `[{"caption","secs"?}, ...]`.

## Flags

| Flag | Default | Meaning |
| --- | --- | --- |
| `--creator <file\|url>` | required | Creator footage; plays fullscreen then top half, loops if shorter than the reel |
| `--demo <file\|url>` | required | Screen recording for the bottom half; plays full length |
| `--hook "text"` | required | Caption over the fullscreen intro |
| `--step "caption [:: secs]"` | — | Repeatable, ordered; captions over the split segment |
| `--steps <file.json>` | — | Steps as JSON instead of flags |
| `--intro-secs` | `6` | Fullscreen intro length before the split |
| `--step-secs` | `3` | Default per-caption length |
| `--creator-trim` / `--demo-trim` | `0` | Offset into each clip |
| `--demo-secs` | full clip | Cap the split segment length |
| `--demo-fit cover\|contain` | `cover` | Fill the bottom half vs. show the whole recording on white |
| `--hook-size` / `--step-size` | `62` / `54` | Base caption sizes (auto-shrink, floor 26px) |
| `--music <file\|url>` | — | BGM, fades out over the last 0.8s (`--music-volume`, `--music-start`) |
| `--creator-volume` / `--demo-volume` | `0` / `0` | Clip audio (muted by default — no yapping) |
| `--name` | auto `yap-N` | Kebab-case reel name |
| `--render` / `--draft` | off | Render after generating / draft quality |

## Notes

- Total duration = intro + demo segment; the demo drives the length.
- Media time is continuous for the creator across the fullscreen→split switch.
- Pick creator footage framed so the face reads in the **top half** (`object-fit: cover` crops the vertical middle into the 1080×960 half).
- Captions follow repo [RULES.md](../../RULES.md): TikTok Sans, white/black-outline, static, auto-sized.
- Silent by default — post with a trending sound, or pass `--music`.
