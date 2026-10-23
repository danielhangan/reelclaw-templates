---
name: talking-head-captions
description: Edit a talking-to-camera clip into a short-form video (TikTok / Reels / Shorts, 1080x1920) with bold word-by-word captions (the spoken word highlighted), dead air and long pauses cut, punch-in zooms, an optional hook title, b-roll cutaways and music under the voice — using the reelclaw talking-head-captions template. Use when the user has a selfie/talking-head/podcast/testimonial/storytime clip and wants captions, subtitles, "Hormozi/CapCut style" auto captions, or a tighter edit.
---

# talking-head-captions — word-by-word captions on a talking head

```
[ speaker · own voice (levelled) · hook title (first ~2.5s) · 1–3 big words at a time, spoken word lit ]
      └ b-roll cutaways over the speaker at chosen moments (voice + captions keep going)
```

1080×1920 @ 30fps. Length = the speech: starts just before the first word, ends 0.5s after the last, pauses over 0.6s cut down to 0.3s.

**Planning, hooks, footage, music, QA and variants** work the same for every template and live in the shared `reelclaw-playbook` skill (installed with every template; skill-only: `npx skills add danielhangan/reelclaw-templates --skill reelclaw-playbook`). Load it first when planning. This file covers what is specific to talking-head-captions.

## 0. Set up (once per folder)

If `templates/talking-head-captions/template.mjs` is missing in the working directory:

```bash
npx reelclaw@latest add talking-head-captions
```

If npm cannot find the `reelclaw` package, run the same installer straight from GitHub: `npx github:danielhangan/reelclaw-templates add talking-head-captions`.

Then `npx reelclaw doctor` (Node 22+, ffmpeg/ffprobe; yt-dlp only for page links). The first transcription downloads whisper (~75MB for `tiny.en`, ~470MB for the default `small.en`) — tell the user before the first run.

## 1. Collect inputs

| Input | Required | Notes |
| --- | --- | --- |
| `--clip` | yes | The talking-head clip: local file, direct URL, or a link to the user's own post. Its voice is the soundtrack. |
| `--hook` | no | Title for the first seconds — the scroll-stopper (see §4). |
| `--transcript` | no | Existing word-timed `.json` / `.srt` / `.vtt`. Skips transcription. |
| `--broll` + `--broll-at` | no | Cutaways (video or image), each with a window in the clip's own seconds: `--broll shot.mp4 --broll-at 4.2-6`. Repeat the pair. |
| `--music` | no | Sits at 12% under the voice by default (`--music-volume`). |
| `--language` | no | Non-English speech (`es`, `de`, `pt`…). |

Style knobs: `--caption-style pop|box|color`, `--highlight "#ffe500"`, `--caption-position lower|center|upper`, `--caption-case upper|lower|as-spoken`, `--words-per-chunk 1-4`. Every flag: `npx reelclaw make talking-head-captions --help`.

**Footage.** The user's own files or links first; never pull someone else's post as footage. Their own phone selfie is the best source — this format lives on the person's own voice: eye-level, close, quiet room, starting on a strong line. For b-roll use their screen recordings, product shots or photos. Real-creator talking-head or testimonial clips from DansUGC are optional: only if its MCP tools are connected or the user asks, follow `reelclaw-playbook` → `references/dansugc.md` (prices in credits, buy only after a yes). Captions must match what the creator actually says; never put words in their mouth. Never block on it.

## 2. Make a draft

```bash
npx reelclaw make talking-head-captions \
  --clip path/or/url/selfie.mp4 \
  --hook "3 things nobody tells you about growing on tiktok" \
  --draft
```

Writes `reels/talking-head-captions-N.html` (editable composition), `.json` (inputs) and `renders/talking-head-captions-N.mp4`, then runs `npx reelclaw qa`. Transcription is cached as `assets/<clip>.words-<model>.json`.

Before showing the user, open every frame `qa` lists and go through the playbook's QA checklist (max 3 passes). For this format:

- Captions covering the mouth/chin? `--caption-position center` or `upper`, or a lower `--focus-y`.
- Speaker off-centre in landscape footage? `--focus-x 30` (0 = left, 100 = right).
- A word misheard? Fix it in `assets/<clip>.words-*.json` (or pass `--transcript`) and re-run — no re-transcription.
- Cuts too aggressive / too loose? `--max-pause 1` (gentler) or `--max-pause 0.4`; `--max-pause 0` keeps every pause.

## 3. Iterate, then finalize

- Variant with the same clip (seconds — transcript, voice and media are cached): `npx reelclaw make talking-head-captions --props reels/talking-head-captions-1.json --hook "new hook" --caption-style box --name v2 --draft`
- Many hooks at once: `npx reelclaw batch talking-head-captions hooks.json --props reels/talking-head-captions-1.json --draft` (rows: `[{ "name": "hook-c", "hook": "…" }]`).
- Final quality: `npx reelclaw render <name>`.
- Hand edits in `reels/<name>.html`: each caption chunk is `<div id="cap-N" … data-start data-duration>` with `<span class="rk-w" data-t0 data-t1>WORD</span>` per word — fix text or timing there, change `.rk--pop` CSS for the look. Then `npx reelclaw check <name>` and `npx reelclaw render <name>`. Re-running `make` with the same `--name` overwrites hand edits.

## 4. What makes this format work

- **The first second decides.** Start on a word, not a breath — the template trims dead air automatically; use `--trim` to start mid-sentence on the strongest line ("i lost 40k doing this…").
- **Hook title = the promise, captions = the delivery.** Keep the hook under ~10 words, lowercase, specific: "3 things nobody tells you about growing on tiktok", "why your skincare isn't working". Don't repeat the first spoken line verbatim.
- **1–3 words per chunk, centred under the chin** (defaults). Big uppercase + one highlighted word is the most-retained caption style; `--words-per-chunk 1` for hype/fast talkers.
- **Tight pacing:** pauses over 0.6s are cut and every other sentence punches in 12% — the classic jump-cut edit that holds attention. Raise `--punch-in 1.2` for energetic edits, `1` to turn it off.
- **B-roll every 3–6s** on longer clips: show the thing being talked about (screen recording, product, result screenshot). Captions and voice keep going over it.
- **Sound:** the voice is levelled to -14 LUFS. Music stays low (`--music-volume 0.1–0.2`); for organic posts skip `--music` and add a trending sound quietly in-app (playbook `references/music.md`).
- **Variants:** same clip, 3–5 hooks or caption styles → 3–5 reels. Propose hooks, let the user pick, then batch them.
