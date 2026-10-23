---
name: reelclaw-playbook
description: The producer's playbook for short-form reels (TikTok / Reels / Shorts) made with reelclaw templates, from a product brief to postable videos — pick the format and template, write scroll-stopping hooks, choose footage and music, make the reel, QA every render frame by frame, and spin up variants. Use when planning reels or a content batch, writing or fixing hooks, choosing footage or a sound, checking a render before delivery, making hook variants, or when the user says "make N reels / ads for my app", "make my reels go viral", or isn't sure which template fits.
---

# reelclaw playbook: from product to postable reels

You are the producer and the editor. A template turns inputs into a 1080×1920 MP4 in seconds; your
job is everything that decides whether anyone watches it: the angle, the hook, the footage, the
cut, and looking at every frame before the user sees it. **The hook does most of the work. Renders
are cheap. Iterate hooks before footage.**

This skill covers what is true for every template. Each template's own skill (`reaction-demo`,
`wall-of-text`, …) adds its inputs, its exact command and what makes that format work. Load both.

## The workflow

| # | Step | Output | Detail |
| --- | --- | --- | --- |
| 1 | Brief | 6 lines the user confirms | [references/brief.md](references/brief.md) |
| 2 | Format | template + why | table below |
| 3 | Hooks | a table of 3–10 hooks | [references/hooks.md](references/hooks.md) |
| 4 | Footage | files the user has rights to, trimmed to the peak | [references/footage.md](references/footage.md) |
| 5 | Music | a sound, or silent on purpose | [references/music.md](references/music.md) |
| 6 | Make | `renders/<name>.mp4` | below |
| 7 | QA loop | every frame looked at, max 3 passes | [references/qa.md](references/qa.md) |
| 8 | Variants | concepts × hooks, one batch | [references/variants.md](references/variants.md) |
| 9 | Deliver | finals + a short summary | below |
| 10 | Publish (optional) | only when asked | [references/variants.md](references/variants.md#post-captions), [references/dansugc.md](references/dansugc.md#publishing) |

**Setup, once per folder.** `npx reelclaw doctor` must pass: Node 22+, ffmpeg/ffprobe, and yt-dlp
only for page links. `npx reelclaw list` shows the installed templates;
`npx reelclaw@latest add <template>` adds more. All reels live in this one project: `reels/` holds
the compositions, `renders/` the MP4s, and media is cached in `assets/`.

### 1. Brief

Read what exists before asking: the repo (README, store listing, landing copy), the user's message,
their files. Write the brief (what, for whom, the pain, the aha on screen, real proof, tone) and show
it. Ask at most one question, with your best guess filled in. Never invent features, numbers,
results or testimonials.

### 2. Pick the format

| Template | Fits when | You need | Length |
| --- | --- | --- | --- |
| `reaction-demo` | App/product promo: a face stops the scroll, the demo answers "what app??" | a ~3 s reaction, a screen recording | 6–15 s |
| `wall-of-text` | Faceless POV / storytime / confession; the text is the content | 1–12 b-roll clips or photos, a paragraph | 6–15 s |
| `listicle` | "3 apps that feel illegal to know", tools, tips, a countdown | one clip or screenshot per item, a title each | 10–20 s |
| `no-yapping` | A silent tutorial with an outcome worth bragging about; farms saves | intro gag, typing shot, screen recording | 15–40 s |
| `greenscreen-reaction` | The background video is itself watchable; a creator comments over it | the video, a talking/reacting selfie | 7–20 s |
| `talking-head-captions` | Someone talks to camera: advice, storytime, testimonial | a talking clip (+ b-roll) | the speech, pauses cut |
| `before-after` | A visible transformation: glow-up, makeover, results, redesign | a before and an after, same framing | 4–10 s |

Not sure? Propose 2–3 formats with one line each on why they fit this brief and this footage, with
your pick pre-selected. Different formats for the same product are different **concepts**: a strong
batch mixes them. Not installed yet: `npx reelclaw@latest add <id>`; the full catalog is
`npx reelclaw@latest add --list`. DansUGC users can also get proven formats for their niche for free
([references/dansugc.md](references/dansugc.md#viral-formats)).

### 3. Hooks

Lowercase, first person or POV/"when", under ~80 characters, specific, truthful, emotion matched to
the footage, and the product unnamed ("this app"). Draft 2–3 per concept across at least 3 hook
formats, then show the user a table (# · hook · format · footage/emotion) and let them pick. Formats,
emotion pairing, per-template patterns, anti-patterns: [references/hooks.md](references/hooks.md).

### 4. Footage

The user's own files and links first: local paths, direct file URLs, links to their own TikTok /
Instagram / YouTube posts. A 3-second phone selfie is a fine reaction. **Never pull someone else's
post as footage**: links to other creators are for studying the format only. Before making: find the
peak with a frame sheet, pre-trim demos so the aha is on screen within ~2 s of the cut, and reject
clips with burned-in text. Real-creator clips from DansUGC are an optional extra, never a
requirement ([references/dansugc.md](references/dansugc.md)). How: [references/footage.md](references/footage.md).

### 5. Music

Organic post: usually render **without** `--music` and add a trending sound in the TikTok / Instagram
app. Ads: only Commercial Music Library tracks; never call a sound "cleared". Match the hook's energy.
[references/music.md](references/music.md).

### 6. Make

```bash
npx reelclaw make <template> --help                                  # every input as a flag
npx reelclaw make <template> --<input> <value> … --name <name> --draft # composition + draft render + QA
npx reelclaw make <template> --props reels/<name>.json --hook "…" --name <new> --draft   # re-hook, cached media
```

- `--props <file>` takes a JSON file of inputs (`{ "hook": "…", "reaction": "footage/r.mp4" }`; keys are
  the camelCase input names, `hookPosition` for `--hook-position`). Write long or quoted text there
  with your file tool instead of the shell. Command-line flags override it.
- Each run writes `reels/<name>.html` (an editable HyperFrames composition), `reels/<name>.json` (the
  inputs used) and, with `--draft` / `--render`, `renders/<name>.mp4`. Names are kebab-case.
- Read the warnings `make` prints (caption outside the safe band, hook over a face, steps dropped…).
- Hand edits: edit `reels/<name>.html`, then `npx reelclaw check <name>` and
  `npx reelclaw render <name>`. Re-running `make` with the same `--name` overwrites hand edits.

### 7. QA loop (mandatory)

Every render from `make` runs `npx reelclaw qa <name>`: timeline-aware frames (each segment, each
cut, the payoff, the last frame) and a report (canvas, duration, audio or SILENT, black and frozen
frames, the music tail fade, render warnings). `--no-qa` skips it; run it by hand after `render`.
**Open and look at every frame image it lists**, then go through the checklist in
[references/qa.md](references/qa.md). Fix one or two things, re-make, look again. At most 3 passes;
then deliver the best one and say exactly what is still off. Never deliver a render you have not
looked at.

### 8. Variants

A **concept** is a template plus a footage set. **Variants** of a concept change the hook (and small
knobs: payoff line, caption style, layout, sound). Plan N concepts × M hooks, show the plan before a
big run, then write one rows file and run `npx reelclaw batch <template> rows.json --props
reels/<base>.json --draft`. Full guide, plus how to read results after posting:
[references/variants.md](references/variants.md).

### 9. Deliver

Render finals with `npx reelclaw render <name>` (`--quality delivery` for the highest quality).
Then give a short summary per reel: path, hook, length, footage used, anything spent, and the QA
result (pass / fixed / still off). Offer the next step: more hooks on the same footage, another
format, or a post caption.

### 10. Publish (optional)

Only when the user asks, and only after they confirm the account, the caption and the time. Each
account gets its own unique video (a hook variant), never the same MP4 twice. Caption formula:
[references/variants.md](references/variants.md#post-captions). Posting through DansUGC:
[references/dansugc.md](references/dansugc.md#publishing). Otherwise hand the user the files.

## Ground rules

- **Truthful.** Every claim in a hook, caption or post comes from the repo, the footage or the user.
  No invented numbers, prices, "free", rankings, results, testimonials or medical/financial outcomes.
- **Rights.** Only footage and music the user has the rights to. Never use someone else's post as
  footage, and never copy a creator's hook text word for word; borrow the structure.
- **Look before you deliver.** Every render, every frame QA lists.
- **No surprise spending.** Say the cost before anything paid (clips, research queries, posting) and
  get an explicit yes for every purchase.
- **Real people stay real.** Creator footage shows real humans; never describe it as AI, and never
  write text that implies a creator said something they didn't.
- **Privacy.** No API keys, emails, customer data or notifications on screen. Nothing leaves the
  machine unless the user chooses to publish it.
- **Keep chat clean.** Summaries and tables, not raw JSON or long logs.
