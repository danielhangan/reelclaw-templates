# Variants: many reels from one project

Posting volume and variety find winners; nobody can predict which hook hits. reelclaw makes variants
cheap: media is staged and cached once, and a new hook re-renders in seconds. Everything lives in one
project: there are no per-reel template copies.

## Concepts × hooks

- A **concept** = one template + one footage set (reaction + demo cut, b-roll set, list items…).
  Different templates, different creators, or different demo moments are different concepts.
- A **variant** = the same concept with a different hook. Smaller knobs ride along: the payoff line
  (`--hook2`, `--text2`, `--payoff`, `--cta`), caption style, layout (`before-after --layout`),
  creator size (`greenscreen-reaction --size`), the sound.
- **Iterate hooks before footage.** Hooks are free and fast; new footage costs time (and sometimes
  credits). Change footage when a concept's hooks all underperform, or the footage fails QA.

For "make 20 reels": 3–5 concepts × 4–6 hooks, with at least 3 hook formats and 2–3 sounds across the
set. Before a big run, tell the user the plan in a few lines: concepts, hooks per concept, footage to
film or buy (and its cost), and the time (renders run one at a time; a draft takes well under a
minute for most templates, longer the first time a greenscreen cut-out or a transcription runs).

## Making them

1. Make and QA one base reel per concept: `npx reelclaw make <template> … --name <concept>-base --draft`.
2. Write the rows file with your file tool (JSON-escape the text). Keys are input names (camelCase or
   kebab-case); `name` is optional (default `<template>-N`):

   ```json
   [
     { "name": "screen-pov", "hook": "pov: your phone won't open tiktok until you work out" },
     { "name": "screen-disbelief", "hook": "this app just made me do pushups to open instagram", "hook2": "12/12 resisted" },
     { "name": "screen-callout", "hook": "college students you NEED this", "music": "footage/track-b.m4a" }
   ]
   ```

3. Check, then run:

   ```bash
   npx reelclaw batch <template> rows.json --props reels/<concept>-base.json --dry-run
   npx reelclaw batch <template> rows.json --props reels/<concept>-base.json --draft
   ```

   Each reel's inputs are the `--props` file, then flags on the command line, then the row. Every row
   is validated before anything is made, and one failing render doesn't stop the others. `--parallel 2`
   renders two at a time if the machine has headroom (renders are CPU-heavy; default 1).
4. QA every variant (`npx reelclaw qa <name>` for each one that didn't get it automatically). For hook
   variants of a passing base, the hook frames are what to check: fit, line breaks, safe band.
5. Finals: `npx reelclaw render <name> [<name> …]`.

## Post captions

```
<the hook line, same as the overlay or a close cousin>

<1–2 truthful sentences tying the feeling to the product>

#niche1 #niche2 #niche3 #broad1
```

3–8 hashtags, niche first. Same truth rules as the hook; emoji are fine here (not in the overlay).
Each account gets its own unique video (a different hook variant), never the same MP4 twice; stagger
several accounts by a few minutes.

## Reading results (24–48 h after posting)

| Metric | Good | Great | Viral |
| --- | --- | --- | --- |
| Views | 10K+ | 100K+ | 1M+ |
| Likes / views | 5 %+ | 10 %+ | 15 %+ |
| Comments / views | 0.5 %+ | 1 %+ | 2 %+ |
| Shares / views | 0.3 %+ | 1 %+ | 3 %+ |

- "what app??" comments mean the curiosity gap worked; keep the product unnamed in the next round.
- Replicate a winner: same hook structure and emotion, a new line, a different creator or footage,
  the same demo angle. Retire formats that stay under "good" after a few posts.
- Write down what won (hook, format, sound) in the project's notes so the next batch starts there.
