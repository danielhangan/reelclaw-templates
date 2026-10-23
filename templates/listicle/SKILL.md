---
name: listicle
description: Make a numbered listicle / countdown short-form video (TikTok / Reels / Shorts, 1080x1920) with the reelclaw listicle template. It makes a hook title card ("3 apps that feel illegal to know"), then numbered items, each with its own clip or photo, a title and an optional note, plus an optional CTA card, with cuts that can snap to the music's beats. Use when the user wants a "top 3/5" list, "apps/websites/tools you need", "things I wish I knew", a tips countdown, or hands you several clips or screenshots with a title each.
---

# listicle: numbered countdown

```
[ hook card ][ ③ title · note ][ ② title · note ][ ① title · note ][ cta (optional) ]
```

Usually 3–5 items at about 2.5–3.5s each, 10–20s total, 1080×1920 @ 30fps.

**Planning, hooks, footage, music, QA and variants** work the same for every template and live in the shared `reelclaw-playbook` skill (installed with every template; skill-only: `npx skills add danielhangan/reelclaw-templates --skill reelclaw-playbook`). Load it first when planning. This file covers what is specific to listicle.

## 0. Set up (once per folder)

If `templates/listicle/template.mjs` does not exist in the working directory, install the template and engine:

```bash
npx reelclaw@latest add listicle
```

If npm cannot find the `reelclaw` package, run the same installer straight from GitHub: `npx github:danielhangan/reelclaw-templates add listicle`.

Then check the machine with `npx reelclaw doctor` (needs Node 22+ and ffmpeg/ffprobe; yt-dlp is only needed for page links). If something is missing, show the user the install line doctor prints, and stop until it's fixed.

## 1. Collect inputs

| Input | Required | Notes |
| --- | --- | --- |
| `--hook` | yes | Title card, for example "3 apps that feel illegal to know". |
| `--item` | yes (1–10, repeat) | One video **or screenshot/photo** per item, in display order. Screen recordings of each app or site are ideal. |
| `--title` | yes, one per `--item` | Item name, in the same order. Append ` :: 4` to give one item 4s. |
| `--note` | no | One line under each title (what it does). `""` skips one. |
| `--cta` | no | Closing card, for example "which one are you downloading first?" |
| `--music` | no | Cuts snap to its beats. Leave it out for organic posts (§4). |

Every flag: `npx reelclaw make listicle --help`.

**Footage.** The user's own files or links first: screen recordings (iOS/Android screen recorder, QuickTime), screenshots, or links to their own posts; never pull someone else's post as footage. For "apps" lists, a 3–5s screen recording of the best moment of each app beats a logo; items have no trim flag, so pre-trim each recording to its wow moment. A hook over a person reacting ("you NEED these") works well: pass that clip as `--hook-clip` (a 3s selfie works). Without one, the hook plays over the first item's footage. Real-creator reaction clips from DansUGC (shocked, pointing, "wait what") are optional: only if its MCP tools are connected or the user asks, follow `reelclaw-playbook` → `references/dansugc.md` (prices in credits, buy only after a yes). Never block on it.

## 2. Make a draft

```bash
npx reelclaw make listicle \
  --hook "3 apps that feel illegal to know" \
  --item rec/perplexity.mov --title "perplexity" --note "does your research in 10 seconds" \
  --item rec/removebg.png   --title "remove.bg"  --note "" \
  --item rec/notion-cal.mov --title "notion calendar" --note "plans your whole week for you" \
  --numbering down --cta "which one are you downloading first?" \
  --draft
```

Flags pair up by position: the first `--title` and the first `--note` belong to the first `--item`. This writes `reels/listicle-N.html` (the editable composition), `reels/listicle-N.json` (the inputs used) and `renders/listicle-N.mp4`, then runs `npx reelclaw qa`.

Before showing the user, open every frame `qa` lists (the hook card and each item) and go through the playbook's QA checklist (max 3 passes). For this format, make sure the badge and title are readable, the note doesn't cover the key UI, and screen recordings are framed sensibly. The default `--fill auto` blur-fills landscape recordings and fills portrait ones. Use `--focus top` to keep the top of tall phone recordings in view.

## 3. Iterate cheaply, then finalize

- Re-hook the same list (media is cached): `npx reelclaw make listicle --props reels/listicle-1.json --hook "websites that feel illegal to know" --name hook-b --draft`
- Many hooks at once: `npx reelclaw batch listicle hooks.json --props reels/listicle-1.json --draft` (rows: `[{ "name": "hook-c", "hook": "…" }]`).
- Pacing: `--item-secs 2.5` for all items, `"title :: 4"` for one item, and `--hook-secs 2` for the hook.
- Looks: `--number-style inline` gives "1. perplexity" with no badge, `--numbering none` drops the numbers, `--badge-color "#111"` changes the badge, and `--text-style tiktok-box-dark|tiktok-outline|plain` changes the text.
- Final quality: `npx reelclaw render <name>` (no `--draft`).
- Hand edits: edit `reels/<name>.html`. The ids are `#hook`, `#title-N`, `#note-N`, `#badge-N` and `#cta`. Box-style text appears twice (background and foreground copies), so edit both. Then run `npx reelclaw check <name>` and `npx reelclaw render <name>`.

## 4. What makes this format work

- **The hook is the whole video.** Use "[N] [things] that feel illegal to know", "apps I can't believe are free", "websites that will make you rich/smarter/hot", "things I wish I knew at 20" or "stop doing X, do this instead". Write a number, a category and a forbidden or secret feeling.
- **Use small odd numbers.** 3 or 5 items finish fast and get rewatched. More than 5 items need a part 2.
- **Save the best for last.** Use `--numbering down` so #1 is the strongest item. The countdown makes viewers wait for it.
- **Keep the pace tight.** About 2.5–3.5s per item, enough to read the title and see one wow moment. Lead each item's footage with its payoff, because nobody watches an app's login screen.
- **Use the native look.** White text boxes and a consistent badge make it read as a creator's list, not an ad.
- **The CTA should bait comments.** "which one are you trying first?" or "comment 'list' for 5 more" beats "follow for more". Comments push distribution, and viewers trust commenters more than the poster.
- **Sound.** Organic: render without `--music` and add a trending sound in-app (playbook `references/music.md`). If you bake in `--music`, cuts land on its beats automatically, and `--music-start` picks the drop.
- **Make variants.** The same items with 3–5 different hooks or orders become separate posts. Propose hooks in this voice, let the user pick, then batch them.
