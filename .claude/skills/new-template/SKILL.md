---
name: new-template
description: Turn a viral short-form video (TikTok / Reels / Shorts link or file) into a reusable reelclaw template and open a pull request to danielhangan/reelclaw-templates. Use when someone says "make a template from <link>", "recreate this format", "add this video as a template", or wants to contribute a new template to reelclaw-templates.
metadata:
  internal: true
---

# new-template — viral video link → reelclaw template → PR

You reverse-engineer the *format* of a viral video (structure, pacing, text, layout — not its content) into `templates/<id>/`, prove it renders, and open a PR. One template per PR.

```
analyze → look → describe → scaffold → implement → make + render → compare → iterate → validate → registry → PR
```

Read before you start: `docs/TEMPLATE_API.md` (the whole contract), `templates/reaction-demo/template.mjs` (the reference template, 60 lines), `RULES.md` (safe zones, typography, audio). Field guide for step 3: [references/reading-a-reference.md](references/reading-a-reference.md). Review bar: [references/quality-bar.md](references/quality-bar.md).

## 0. Preconditions

You must be in a clone of `reelclaw-templates` (it has `packages/reelclaw/` and `templates/`). If not:

```bash
gh repo fork danielhangan/reelclaw-templates --clone && cd reelclaw-templates   # or git clone if the user has push access
```

Then, once per clone:

```bash
npm install            # links the `reelclaw` CLI used below (npx reelclaw … runs the checkout's engine)
npm run fixtures       # synthetic test media in fixtures/ (never real footage)
npx reelclaw doctor    # Node ≥ 22, ffmpeg, yt-dlp (for links)
git switch -c template/<id>   # once you know the id (step 5)
```

Search first — maybe the format exists: `npx reelclaw list`, or grep `registry.json` for its tags. If a template is close, propose an input/option on it instead of a near-duplicate.

## 1. Analyze the reference

```bash
npx reelclaw analyze "<link>" --beats                # add --transcribe when people talk on camera
```

Writes `analysis/<slug>/` (git-ignored): `analysis.json`, `contact-sheet.png` (one keyframe per shot), `filmstrip.png` (a frame every 0.5–2s), `shots/NNN.png`.

- Download blocked (private, login wall, region)? Ask the user to save the video, then `npx reelclaw analyze video.mp4 --source-url "<link>"`.
- Too many / too few cuts? Re-run with `--threshold 0.2` (soft cuts) or `0.45` (busy footage). Re-runs keep your `format` notes.
- `--transcribe` downloads a Whisper model on first use; skip it for music-only formats.

## 2. Look at it

Read `contact-sheet.png` and `filmstrip.png` with your image tool; open single `shots/NNN.png` when you need detail. Text often changes *without* a cut — the filmstrip shows that. Note for every beat: what is on screen, where the text sits, how big, what style, how long.

## 3. Describe the format — then check with the user

Tell the user in ≤ 8 lines: the structure beat by beat with timings, pacing (from `pacing` in analysis.json), the text/caption style, audio (music / voice / trending sound), and **why it works** (the retention mechanic). Then state which parts become **inputs** (footage, text, lengths) and which stay **fixed** (the format). Get a yes before building — this is the cheapest moment to be wrong.

Then fill the `format` block in `analysis/<slug>/analysis.json` (field guide: references/reading-a-reference.md): `name`, `description`, `category`, `tags`, `structure`, `whyItWorks`, `captionStyle`, `roles` (one per shot — the footage input feeding it; same name = same clip, so jump cuts continue through one clip), `texts` (every on-screen text with its window and position; `key` names the input, e.g. `payoff`).

## 4. Name it

- **id**: kebab-case, 2–4 words, names the format not the source: `pov-app-reveal`, `three-reasons-listicle`, `split-reaction`. Never a creator, brand or song name. It is the folder, the template id and the Agent Skills `name`; it is permanent (users type it).
- **category**: one of `reaction`, `tutorial`, `split-screen`, `greenscreen`, `talking-head`, `slideshow`, `listicle`, `meme`, `text-story`, `before-after`, `product-demo`, `ugc-ad`, `other` (`CATEGORIES` in `packages/reelclaw/src/core/template.mjs`; adding one needs a maintainer).
- **tags**: 3–6 kebab-case words people would search: `pov`, `hard-cut`, `app-promo`.

## 5. Scaffold

```bash
npx reelclaw scaffold <id> --from analysis/<slug>
```

Creates `templates/<id>/` — `template.mjs` (shots with measured cut times, one caption per text, caption style, music), `SKILL.md`, `README.md` (flags table generated), `example.json` (fixtures). It already makes and renders; everything marked `TODO` is yours, and `reelclaw validate` fails until none is left.

## 6. Implement the format

Turn measured timings into format logic with core primitives. Map what you saw:

| In the reference | Use |
| --- | --- |
| hard cuts between clips | `video()` clips back to back; let footage decide lengths with `clipLength(ref, trim)` where the format allows |
| jump cuts in one talking clip | same input, increasing `trim` (the scaffold's `pickUp()`), or one clip + `audio()` |
| top/bottom split, picture-in-picture | `layout.split(ratio)` / `layout.pip({...})` as `box`; `fit: "contain"` + `solid()` panel for screen recordings |
| person cut out over a background | `prepare()` + `media.derive(...)` with `hyperframes(["remove-background", …])` (see TEMPLATE_API.md) |
| hook / step / payoff text | `caption()` — styles `tiktok-outline` (default), `tiktok-box`, `tiktok-box-dark`, `plain`; `position` top/center/bottom |
| word-by-word captions | `loadTranscript()` / `transcribeMedia()` in `prepare()`, then `karaokeCaptions(words)` (see talking-head-captions) |
| zoom punch-in, slide, drag | `motion: [{ at, duration, from, to, ease }]` on video/image/caption |
| list of N steps / items | `input.list(input.text(...))` and map items to timed captions |
| custom graphics (progress bar, emoji pop, counter) | `html({ html, css, script })` — deterministic GSAP only |

Rules (reviewers check these):
- `build()` is pure and synchronous; async work (cut-outs, transcripts) goes in `prepare()` and is cached with `media.derive`.
- Inputs drive the reel: footage of any sensible length must work (no hard-coded 8.5s timeline unless the format *is* fixed-length). Validate impossible values with `fail(message, hint)`.
- Clip audio stays muted (`volume` 0) unless the format needs it (talk-over, voiceover); text stays inside `SAFE_BAND` (else `unsafe: true` + a README note); captions are static.
- Expose the knobs people actually tweak (text positions, segment lengths, trims, volumes) with good defaults. Every input has a one-line description. 40–150 lines total.
- Need something core doesn't have? Add a reusable primitive as a **new** file under `packages/reelclaw/src/core/components/` with a `node:test` unit test and a line in `docs/TEMPLATE_API.md` — ideally its own PR first. Never fork engine code into a template.

## 7. Make, render, compare — iterate

```bash
npx reelclaw make <id> --props templates/<id>/example.json --name check --draft --workers 2
npx reelclaw analyze renders/check.mp4 --compare analysis/<slug>
```

Read `analysis/check/compare.png` (reference left, yours right, same timestamps) and the printed pacing notes ("reference cuts at 3s; your nearest cut is 2.4s"). Fixtures look nothing like the reference — compare **structure**: cut times, layout, text position, size and style, motion. Fix, re-run, repeat until a viewer would recognise the format. Two or three rounds is normal.

Then check the safe zones and make the preview: `npx reelclaw preview <id> --safe-zones` → look at `renders/preview/<id>-safe-zones.png`; it writes `templates/<id>/preview.png` + `preview.gif` (rendered from fixtures — never frames of the reference).

## 8. Docs

- `SKILL.md`: resolve every TODO. The `description` is what agents match on: what it makes + when to use it, ≤ 1024 chars. Keep the bootstrap (`npx reelclaw@latest add <id>`), the pointer to the shared `reelclaw-playbook` skill, the inputs table, the exact make command, the format-specific QA checks, iteration, and a **"What makes this format work"** section (hook voice with 3+ example hooks in the format's style, what to vary between variants, sound advice for this format). Advice that is true for every template (hook rules, footage sourcing, music licensing, the QA checklist, variants, DansUGC) lives in `playbook/`: link it, don't copy it. Footage: the user's own first; DansUGC optional, via the playbook's `references/dansugc.md` — never required.
- `README.md`: what it is, the structure diagram, how inputs map to it, any deliberate RULES.md exceptions. Refresh the flags table with `npx reelclaw docs <id> --write`.
- `example.json`: exercise the optional inputs too (CI makes it). Write your own example text in the format's voice — don't copy the creator's captions.

## 9. Validate

```bash
npm run typecheck && npm test
npx reelclaw validate <id> --render
grep -rn "TODO" templates/<id>/          # must print nothing
npm run registry                          # updates registry.json + .claude-plugin/marketplace.json
```

All green, no TODOs, registry regenerated. Fix failures; don't silence them.

## 10. Open the PR

Confirm with the user before pushing. Then:

```bash
git add templates/<id> registry.json .claude-plugin/marketplace.json    # + any new core primitive and its test/docs
git status --short    # must NOT include analysis/, renders/, reels/, fixtures/, assets/ or any .mp4/.mov from the reference
git commit -m "Add <id> template"
git push -u origin template/<id>
gh pr create --repo danielhangan/reelclaw-templates --title "Add <id> template" --body-file <filled .github/PULL_REQUEST_TEMPLATE.md>
```

Fill every section of `.github/PULL_REQUEST_TEMPLATE.md` (reference link, format description, how inputs map, checklist ticked honestly, compare.png findings). Attach nothing derived from the reference video. Give the user the PR URL.

## Copyright — non-negotiable

- Store the **link only** (`source.url` in template.mjs, the PR body). Never commit the reference video, its frames, audio, or stills; `analysis/` is git-ignored for this reason.
- Templates recreate a *format*. Don't bake in the creator's text, logo, face, voice or music; preview media comes from fixtures or footage the contributor owns.
- No music from the reference in the repo. Templates take `--music` as an input.
