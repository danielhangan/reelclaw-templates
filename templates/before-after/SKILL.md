---
name: before-after
description: Make a before/after transformation short-form video (TikTok / Reels / Shorts, 1080x1920) from two photos or clips with the reelclaw before-after template — a full-screen swipe reveal from before to after, or a labelled top/bottom split, with a hook. Use for glow-ups, fitness/skin/hair results, room or desk makeovers, cleaning, editing or app-redesign before/afters, or whenever the user hands you a "before" and an "after".
---

# before-after — the transformation reveal

```
wipe (default):  [ before · full screen · "before" ] ──swipe──▶ [ after · "after" ]     hook on top throughout
split:           [ before (top half) ]   hook on the seam
                 [ after (bottom half) ] ← optionally dark first, then swiped in (--reveal)
```

~4–10s, 1080×1920 @ 30fps. Photos get a slow push-in so nothing looks frozen; short clips loop.

**Planning, hooks, footage, music, QA and variants** work the same for every template and live in the shared `reelclaw-playbook` skill (installed with every template; skill-only: `npx skills add danielhangan/reelclaw-templates --skill reelclaw-playbook`). Load it first when planning. This file covers what is specific to before-after.

## 0. Set up (once per folder)

If `templates/before-after/template.mjs` is missing in the working directory:

```bash
npx reelclaw@latest add before-after
```

If npm cannot find the `reelclaw` package, run the same installer straight from GitHub: `npx github:danielhangan/reelclaw-templates add before-after`.

Then `npx reelclaw doctor` (Node 22+, ffmpeg/ffprobe; yt-dlp only for page links).

## 1. Collect inputs

| Input | Required | Notes |
| --- | --- | --- |
| `--before` | yes | Photo or clip (local file, direct URL, or a link to the user's own post). |
| `--after` | yes | Photo or clip — same framing as the before if possible (same angle, same distance). |
| `--hook` | strongly advised | The transformation in a few words: time + change ("6 months of fixing my posture"). |
| `--payoff` | no | Replaces the hook as the after appears ("worth every morning"). |
| `--layout` | no | `wipe` (default, best for people/rooms) or `split` (both visible at once — good for UI, edits, side-by-side). |
| `--music` | no | Otherwise silent: add a trending sound in-app. |

Label text: `--before-label` / `--after-label` (default "before"/"after"; `""` hides). Every flag: `npx reelclaw make before-after --help`.

**Footage.** The user's own photos and clips — authenticity is the point of this format, and the before and after must be real; never pull someone else's post as footage. Same angle, distance and light in both. Shooting the after now? Line it up against the before photo first. Real-creator UGC from DansUGC (for example a reaction to cut in before a result) is optional: only if its MCP tools are connected or the user asks, follow `reelclaw-playbook` → `references/dansugc.md` (prices in credits, buy only after a yes). Never block on it.

## 2. Make a draft

```bash
npx reelclaw make before-after \
  --before before.jpg --after after.mp4 \
  --hook "6 months of fixing my posture" \
  --draft
```

Writes `reels/before-after-N.html` (editable composition), `.json` (inputs) and `renders/before-after-N.mp4`, then runs `npx reelclaw qa`.

Before showing the user, open every frame `qa` lists (the before, mid-swipe, the after) and go through the playbook's QA checklist (max 3 passes). For this format:

- Subject cropped badly? `--focus-y 30` keeps more of the top (faces), `--focus-x` for left/right. Split halves crop a lot — check them.
- Text over the subject's face? Shorten the hook, or switch `--layout`.

## 3. Iterate, then finalize

- Variant (media cached, seconds): `npx reelclaw make before-after --props reels/before-after-1.json --layout split --reveal --name split-v --draft`
- Many hooks at once: `npx reelclaw batch before-after hooks.json --props reels/before-after-1.json --draft` (rows: `[{ "name": "hook-c", "hook": "…" }]`).
- Pacing: `--before-secs` (how long the before shows alone), `--wipe-secs` (swipe speed, default 0.7), `--after-secs` (hold on the result), `--direction right|left|down|up`.
- Final quality: `npx reelclaw render <name>`.
- Hand edits: `reels/<name>.html` — `#before` / `#after` hold the media, `#after-wipe` the swipe (one `clip-path` tween), labels are `#before-label` / `#after-label`. Then `npx reelclaw check <name>` and `npx reelclaw render <name>`.

## 4. What makes this format work

- **Hook = time + transformation**, lowercase, first person: "6 months of fixing my posture", "my desk setup glow up", "what 30 days of no sugar did to my skin". The number creates the curiosity.
- **Short before, long after.** ~1.5–2s on the before is enough; hold the after 2.5–4s — that's what gets rewatched and screenshotted.
- **Match framing** between before and after (same angle/distance/lighting) — the swipe makes differences pop; mismatched shots feel fake.
- **Wipe for people and spaces** (the swipe is the payoff); **split for UI/edits** where viewers compare details.
- **`--payoff`** rewards watching to the end ("and i only changed one thing") and drives comments asking "what thing?".
- **Loopable:** keep it short (4–7s) so it autoplays again; rewatches push distribution.
- **Truthful results only.** Never retouch, swap or stage an "after" the product didn't produce, and never imply results the user can't back.
- **Sound:** organic → skip `--music` and add a trending sound in-app; bake `--music` for ads (playbook `references/music.md`).
- **Variants:** same before/after, 3–5 hooks or both layouts → several reels; batch them.
