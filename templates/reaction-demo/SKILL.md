---
name: reaction-demo
description: Make a UGC "reaction → app demo" short-form video (TikTok / Reels / Shorts, 1080x1920) with the reelclaw reaction-demo template — a creator reacts for ~3s under a hook caption, then a hard cut to a screen recording. Use when the user wants a reaction + demo reel, an app promo with a creator hook, or hands you a reaction clip and a demo recording.
---

# reaction-demo — creator reaction → app demo

```
[ reaction clip · ~3s · hook caption ] → hard cut → [ demo · full length · optional payoff caption ]
```

~6–15s, 1080×1920 @ 30fps. The hook does 90% of the work; the render is the cheap part.

**Planning, hooks, footage, music, QA and variants** work the same for every template and live in the shared `reelclaw-playbook` skill (installed with every template; skill-only: `npx skills add danielhangan/reelclaw-templates --skill reelclaw-playbook`). Load it first when planning. This file covers what is specific to reaction-demo.

## 0. Set up (once per folder)

If `templates/reaction-demo/template.mjs` does not exist in the working directory, install the template and engine:

```bash
npx reelclaw@latest add reaction-demo
```

If npm cannot find the `reelclaw` package, run the same installer straight from GitHub: `npx github:danielhangan/reelclaw-templates add reaction-demo`.

Then check the machine: `npx reelclaw doctor` (needs Node 22+, ffmpeg/ffprobe; yt-dlp only for page links). If something is missing, show the user the install line doctor prints and stop until it's fixed.

## 1. Collect inputs

| Input | Required | Notes |
| --- | --- | --- |
| `--reaction` | yes | Creator reaction clip. Local path, direct file URL, or a link to the user's own post. |
| `--demo` | yes | Screen recording of the app/product. Plays full length, so pre-trim it to start right before the aha (aim for 7–12s). |
| `--hook` | yes | The caption over the reaction. Write it with the user (§4). |
| `--hook2` | no | Payoff caption over the demo ("12/12 resisted"). |
| `--music` | no | Background track; otherwise the reel is silent (attach a trending sound in-app). |

Every flag: `npx reelclaw make reaction-demo --help`.

**Footage.** The user's own files or links first; never pull someone else's post as footage. The reaction should peak in its first second: a big, lit face, no burned-in text. A 3s phone selfie of the user reacting works. The demo is a portrait screen recording that reaches the aha fast. Real-creator reaction clips from DansUGC are optional: only if its MCP tools are connected or the user asks, follow `reelclaw-playbook` → `references/dansugc.md` (prices in credits, buy only after a yes). Never block on it.

## 2. Make a draft

```bash
npx reelclaw make reaction-demo \
  --reaction path/or/url/reaction.mp4 \
  --demo path/or/url/demo.mov \
  --hook "i was about to hit it and this app talked me out of it" \
  --draft
```

This writes `reels/reaction-demo-N.html` (editable composition), `reels/reaction-demo-N.json` (inputs used) and `renders/reaction-demo-N.mp4`, then runs `npx reelclaw qa`. Open every frame it lists and go through the playbook's QA checklist (max 3 passes). For this format, check:

- **Frame 0 already shows the peak expression?** If not, `--trim` to a later start (use the playbook's frame-sheet technique).
- **Hook readable and clear of the creator's face?** If not, `--hook-position top|bottom`.
- **The cut lands right after the reaction's beat?** Tune `--reaction-secs` (keep it ≤ 3).
- **The aha on screen within ~2s after the cut?** If not, pre-trim the demo file.

## 3. Iterate cheaply, then finalize

- New hook, same clips (media is cached, takes seconds): `npx reelclaw make reaction-demo --props reels/reaction-demo-1.json --hook "new hook" --name hook-b --draft`
- Many hooks at once: `npx reelclaw batch reaction-demo hooks.json --props reels/reaction-demo-1.json --draft` (rows: `[{ "name": "hook-c", "hook": "…" }]`).
- Final quality: `npx reelclaw render <name>` (no `--draft`).
- Hand edits: change `reels/<name>.html` directly (it's a HyperFrames composition), run `npx reelclaw check <name>`, then `npx reelclaw render <name>`. Re-running `make` with the same `--name` overwrites hand edits.

## 4. What makes this format work

- **Hooks are lowercase, first-person, conversational** — a confession or a moment, never a feature list. "i was about to hit it and this app talked me out of it" works; "This app helps you quit vaping" dies.
- **Match the hook to the face.** Shocked → a surprising discovery; crying → relatable pain, then relief; laughing → an absurd situation; deadpan → understatement.
- **Specific beats clever**: numbers and outcomes ("i logged 12 cravings today and gave in to zero").
- **Never name the app in the hook.** "this app" opens a curiosity gap that fills the comments with "what app??"; the demo answers it.
- **Keep the reaction short** — the 3s default is right. Retention comes from the hard cut.
- **The demo must pay off within ~2s of the cut.** Nobody watches a login screen.
- **`--hook2` is a payoff line** over the demo, shorter than the hook — it rewards finishing and drives rewatches.
- **Variants:** same clips + 3–5 hooks = 3–5 reels. Propose 5–10 hooks in this voice, let the user pick, then batch them.
- **Sound:** organic → render without `--music`, add a trending sound in-app; baked `--music` is for ads (playbook `references/music.md`).
