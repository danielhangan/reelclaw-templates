---
name: wall-of-text
description: Make a "wall of text over b-roll" short-form video (TikTok / Reels / Shorts, 1080x1920) with the reelclaw wall-of-text template. It puts a long first-person POV, storytime or confession in TikTok's native white text box over looping b-roll clips or photos, with an optional second card for the reveal. Use when the user wants a POV / storytime / text-story reel, a faceless app-promo post, "text on aesthetic footage", or hands you b-roll plus a paragraph of text.
---

# wall-of-text: POV / storytime text over b-roll

```
[ b-roll 1 | b-roll 2 | … cut evenly or on the beat, looped to fill ]
[ text card (native white box) ·········· ][ text2 card: the reveal (optional) ]
```

6–15s, 1080×1920 @ 30fps. It needs no face, no voiceover and no editing skill, which is why app marketers post it daily.

## 0. Set up (once per folder)

If `templates/wall-of-text/template.mjs` does not exist in the working directory, install the template and engine:

```bash
npx reelclaw@latest add wall-of-text
```

If npm cannot find the `reelclaw` package, run the same installer straight from GitHub: `npx github:danielhangan/reelclaw-templates add wall-of-text`.

Then check the machine with `npx reelclaw doctor` (needs Node 22+ and ffmpeg/ffprobe; yt-dlp is only needed for page links). If something is missing, show the user the install line doctor prints, and stop until it's fixed.

## 1. Collect inputs

| Input | Required | Notes |
| --- | --- | --- |
| `--broll` | yes (1–12, repeat the flag) | Videos **or photos**: local paths, direct URLs, or TikTok/IG/YouTube links. Used in order and looped to fill the reel. |
| `--text` | yes | The wall of text. Write it with the user (see §4). Use `\n\n` for paragraph breaks. |
| `--text2` | no | A second card that swaps in on a cut, such as the reveal ("the app is called X btw") or a payoff. |
| `--music` | no | Background track. Cuts snap to its beats by default. Leave it out for organic posts (§4). |

Every flag: `npx reelclaw make wall-of-text --help`.

**Footage.** Use the user's own clips and photos first: camera roll, screen recordings, a link to their own TikTok. Good b-roll is aesthetic and low-information: hands on a phone, a walk, a coffee, a desk, a sunset, a gym mirror, a bedroom at night. Busy footage fights the text. If they have nothing:
- If the DanSUGC MCP is connected (tools such as `search_videos`), offer to search real-creator UGC clips that match the mood (for example "girl in bed scrolling phone at night"). Show the results and their price in credits, and only buy after the user says yes.
- Or point them to https://dansugc.com.

DanSUGC is optional. Never block on it.

## 2. Make a draft

```bash
npx reelclaw make wall-of-text \
  --broll clips/bed-scroll.mp4 --broll clips/sunrise.jpg \
  --text "pov: you stopped doomscrolling at 2am because your phone literally locks you out after 11pm

and now you sleep 8 hours like a functioning adult" \
  --text2 "the app is called lumen btw (not sponsored i'm just obsessed)" \
  --draft
```

This writes `reels/wall-of-text-N.html` (the editable composition), `reels/wall-of-text-N.json` (the inputs used) and `renders/wall-of-text-N.mp4`.

Look at the result before showing the user. Grab one frame per card and read it:

```bash
ffmpeg -v error -ss 1 -i renders/wall-of-text-1.mp4 -frames:v 1 /tmp/card1.png
```

Check three things. Is the text readable? Is the box clear of the subject? Is the framing right? If not:
- `--text-position top|bottom` moves the text.
- `--focus top|left|…` keeps a different part of cropped footage in frame.
- `--fill cover` forces full-bleed crops. The default `auto` fills portrait footage and blur-fills landscape footage.

## 3. Iterate cheaply, then finalize

- New text on the same footage (media is cached, so this takes seconds): `npx reelclaw make wall-of-text --props reels/wall-of-text-1.json --text "new text" --name pov-b --draft`
- Timing: `--duration 8` sets the length, `--text2-at 4.5` sets when the reveal lands, and `--clip-secs 1.5` sets faster cuts. The default length comes from the b-roll: 6–10s, or 9–15s with `--text2`.
- Looks: `--text-style tiktok-box-dark|tiktok-outline|plain`, `--align left`, `--text-size 56` (long text still shrinks to fit), and `--dim 0.3` to darken busy footage.
- Final quality: `npx reelclaw render <name>` (no `--draft`).
- Hand edits: edit `reels/<name>.html`. Each card is `#text` / `#text2`, and its words appear twice (background and foreground copies), so change both. Then run `npx reelclaw check <name>` and `npx reelclaw render <name>`. Re-running `make` with the same `--name` overwrites hand edits.

## 4. Viral playbook

- **Make it take longer to read than to watch.** The best performers have about 6–10s of footage and text that takes about 12s to read. Viewers rewatch to finish it, and loops plus watch time push distribution. Don't "fix" this by making the reel longer.
- **The first line is the hook.** Open with a frame people recognize instantly: "pov:", "storytime:", "nobody talks about how…", "i didn't believe it until…", "the moment i realized…". Keep it lowercase, first person and conversational, like a text to a friend.
- **Be specific.** Numbers, times, places and outcomes ("2am", "8 hours", "$340 in 3 weeks") beat adjectives.
- **Name the app late, or never.** In card 1, "this app" or "my phone" creates the curiosity gap. Card 2 (`--text2`) can reveal the name, or you can leave it out and let the comments ask "what app??". Comment volume drives distribution, and viewers trust other commenters more than the poster.
- **Keep the footage quiet.** Low-detail, slightly moody b-roll that matches the story's emotion works best. The text is the content. Cuts every 2–4s keep it alive without pulling the eye.
- **Use the native look on purpose.** The white box is TikTok's own text tool, so the post reads as a person's post, not an ad. Avoid fancy fonts and effects.
- **Sound.** For organic posts, render without `--music` and add a trending sound in the app, which feeds the algorithm. Baked `--music` (cuts snap to its beats) suits ads and reposts.
- **Variants are cheap.** Same footage plus 5 hook lines gives 5 posts. When asked for variants, draft 5–10 openings in this voice, let the user pick, then make one reel per pick with `--name`.
