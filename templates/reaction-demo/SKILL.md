---
name: reaction-demo
description: Make a UGC "reaction → app demo" short-form video (TikTok / Reels / Shorts, 1080x1920) with the reelclaw reaction-demo template — a creator reacts for ~3s under a hook caption, then a hard cut to a screen recording. Use when the user wants a reaction + demo reel, an app promo with a creator hook, or hands you a reaction clip and a demo recording.
---

# reaction-demo — creator reaction → app demo

```
[ reaction clip · ~3s · hook caption ] → hard cut → [ demo · full length · optional payoff caption ]
```

~6–15s, 1080×1920 @ 30fps. The hook does 90% of the work; the render is the cheap part.

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
| `--reaction` | yes | Creator reaction clip. Local path, direct file URL, or TikTok/IG/YouTube link. |
| `--demo` | yes | Screen recording of the app/product. Plays full length — trim it first if it's long. |
| `--hook` | yes | The caption over the reaction. Write it with the user (see §4). |
| `--hook2` | no | Payoff caption over the demo ("12/12 resisted"). |
| `--music` | no | Background track; otherwise the reel is silent (attach a trending sound in-app). |

Every flag: `npx reelclaw make reaction-demo --help`.

**No reaction footage?** Use whatever the user has (a 3s phone selfie works). Optionally:
- If the DanSUGC MCP is connected (tools such as `search_videos`), offer to search real-creator reaction clips that match the hook's emotion (shock, relief, laughing, crying). Show results and prices in credits; only buy after the user says yes.
- Or point them to https://dansugc.com (UGC reaction clips from real creators).

DanSUGC is optional — never block on it.

## 2. Make a draft

```bash
npx reelclaw make reaction-demo \
  --reaction path/or/url/reaction.mp4 \
  --demo path/or/url/demo.mov \
  --hook "i was about to hit it and this app talked me out of it" \
  --draft
```

This writes `reels/reaction-demo-N.html` (editable composition), `reels/reaction-demo-N.json` (inputs used) and `renders/reaction-demo-N.mp4`.

Check it before showing the user: grab a frame from each segment and look at it.

```bash
ffmpeg -v error -ss 1.5 -i renders/reaction-demo-1.mp4 -frames:v 1 /tmp/hook.png
```

Is the hook readable and clear of the creator's face? If not, use `--hook-position top|bottom` or `--trim` to a better moment.

## 3. Iterate cheaply, then finalize

- New hook, same clips (media is cached, takes seconds): `npx reelclaw make reaction-demo --props reels/reaction-demo-1.json --hook "new hook" --name hook-b --draft`
- Final quality: `npx reelclaw render <name>` (no `--draft`).
- Hand edits: change `reels/<name>.html` directly (it's a HyperFrames composition), run `npx reelclaw check <name>`, then `npx reelclaw render <name>`. Re-running `make` with the same `--name` overwrites hand edits.

## 4. Viral playbook

- **Hooks are lowercase, first-person, conversational** — a confession or a moment, never a feature list. "i was about to hit it and this app talked me out of it" works; "This app helps you quit vaping" dies.
- **Specific beats clever**: numbers and outcomes ("i logged 12 cravings today and gave in to zero").
- **Never name the app in the hook.** "this app" opens a curiosity gap that fills the comments with "what app??"; the demo answers it.
- **Keep the reaction short** — the 3s default is right. Retention comes from the hard cut.
- **The demo must pay off within ~2s of the cut.** Pick/trim the demo so the interesting moment leads; use `--trim` on the reaction to land on the best expression.
- **`--hook2` is a payoff line** over the demo — it rewards finishing and drives rewatches.
- **Iterate hooks, not footage**: same clips + 3–5 hooks = 3–5 reels. When asked for variants, propose 5–10 hooks in this voice, let the user pick, then make one reel per hook with `--name`.
- **Sound**: for organic posts render without `--music` and add a trending sound in the TikTok/IG app (feeds the algorithm). Baked `--music` is for ads.
