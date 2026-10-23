# no_yapping

The **"…but no yapping"** split-screen tutorial reel, built from **3 videos**:

1. **Intro video** — a 9:16 clip fullscreen with the hook caption (the mouth-tape moment). Default 6s.
2. **Typing video** — the creator working, in the **top half** of the split.
3. **Demo video** — the screen recording, in the **bottom half**; step captions change at the seam. No voiceover — the silence is the format.

```
[ intro video 100% · "making $10k but no yapping" ]   0 → 6s
[ typing video 50% ]
[ ——— caption at the seam: "go to claude" ———     ]   6s → end (demo length)
[ demo video 50%   ]
```

## Usage

```bash
node new-reel.mjs \
  --intro footage/mouth-tape.mp4 \
  --typing footage/typing.mp4 \
  --demo clips/screen-recording.mov \
  --hook "making \$10k but no yapping" \
  --step "go to claude" \
  --step "paste ur script :: 4" \
  --step "easyyy 10 bands" \
  --render
```

Steps are the on-screen captions. Two ways to time each one:

- **Sequential** — `"caption [:: secs]"` (default 3s): runs after the previous caption, starting from the split point. The **last sequential caption holds to the end** (that's your payoff line).
- **Absolute window** — `"caption :: start-end"` in seconds from the start of the reel, e.g. `--step "buy now :: 10-15"` shows exactly from second 10 to 15. Following sequential captions continue from its end.

For long lists use `--steps steps.json` with `[{"caption","secs"?} | {"caption","at":10,"until":15}, ...]`. Overlapping absolute windows draw on top of each other — keep them disjoint.

## Flags

| Flag | Default | Meaning |
| --- | --- | --- |
| `--intro <file\|url>` | required | 9:16 intro clip, fullscreen; loops if shorter than the intro |
| `--typing <file\|url>` | required | Typing footage for the top half; loops if shorter than the split |
| `--demo <file\|url>` | required | Screen recording for the bottom half; plays full length |
| `--hook "text"` | required | Caption over the fullscreen intro |
| `--step "caption [:: secs \| :: start-end]"` | — | Repeatable, ordered; sequential duration or absolute window |
| `--steps <file.json>` | — | Steps as JSON instead of flags |
| `--intro-secs` | `6` | Fullscreen intro length before the split |
| `--step-secs` | `3` | Default per-caption length |
| `--intro-trim` / `--typing-trim` / `--demo-trim` | `0` | Offset into each clip |
| `--demo-secs` | full clip | Cap the split segment length |
| `--demo-fit cover\|contain` | `cover` | Fill the bottom half vs. show the whole recording on white |
| `--hook-size` / `--step-size` | `62` / `54` | Base caption sizes (auto-shrink, floor 26px) |
| `--music <file\|url>` | — | BGM, fades out over the last 0.8s (`--music-volume`, `--music-start`) |
| `--intro-volume` / `--typing-volume` / `--demo-volume` | `0` | Clip audio (muted by default — no yapping) |
| `--name` | auto `yap-N` | Kebab-case reel name |
| `--render` / `--draft` | off | Render after generating / draft quality |

## Notes

- Total duration = intro + demo segment; the demo drives the length.
- Intro and typing clips loop automatically to cover their segments.
- Pick typing footage framed so the action reads in a **1080×960 half** (`object-fit: cover` crops the vertical middle).
- Captions follow repo [RULES.md](../../RULES.md): TikTok Sans, white/black-outline, static, auto-sized.
- Silent by default — post with a trending sound, or pass `--music`.
