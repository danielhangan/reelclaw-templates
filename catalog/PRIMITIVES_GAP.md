# Primitives gap: what to build next

Which engine primitives unlock the most templates. The counts come from `catalog/formats.json` (199 formats). Re-derive them when you change the catalog.

> **Update (v2 integration, 2026-10-20):** the first template wave shipped `sequence`, `transcribe`, `beat_sync`, `rank_badges`, `wipe`, `blur_fill` and `jump_cut` as core components (see the Components table in docs/TEMPLATE_API.md). `formats.json` marks them shipped, and **66 of 199** formats are now `ready_today`. The ranking below is the original plan; the cheapest open gaps are now `caption_track` and `end_card`.

**Where we are.** 28 of 199 formats can be built today with shipped primitives: video, image, music, clip_audio, caption, karaoke, split, pip, solid, motion, cutout and html. Most of the rest are blocked by a small number of helpers. Five of those helpers are cheap: sequence, caption_track, transcribe, rank_badges and end_card. With them, **90 of 199** formats become buildable, including 32 of the 58 priority-1 formats. Add counter, slideshow and phone_frame and the figure reaches **117**.

## Ranking

Columns:
- **formats**: how many catalog formats need the primitive.
- **weighted**: the sum over those formats of (4 − priority), so a priority-1 format counts 3 and a priority-3 format counts 1.
- **P1**: priority-1 formats that need it.
- **sole blocker**: formats for which this is the *only* missing primitive.
- **cost**: S is pure JS over the existing IR (no compiler change). M is a new `html()` component or a `prepare()` helper. L needs compiler/runtime work or third-party assets.

| # | primitive | formats | weighted | P1 | sole blocker | cost | what it is |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **sequence** | 68 | 148 | 25 | 13 | S | N clips back-to-back as hard cuts, each with an optional caption; the reel length is derived |
| 2 | **caption_track** | 40 | 89 | 17 | 8 | S | timed caption list from a script: `"text :: 4"` sequential, `"text :: 10-15"` absolute |
| 3 | **transcribe** | 30 | 62 | 8 | 9 | M | word timestamps from speech, cached; feeds `karaoke()` and auto-captions |
| 4 | **end_card** | 21 | 44 | 6 | 1 | M | CTA end card / persistent offer banner (icon, name, store badge, handle) |
| 5 | **rank_badges** | 16 | 36 | 7 | 0 | S/M | number badges, countdown labels, item titles per segment |
| 6 | **counter** | 19 | 32 | 3 | 5 | M | animated number / money / day counter, progress bar, timer |
| 7 | **slideshow** | 14 | 27 | 4 | 1 | S | image slides with per-slide duration, Ken Burns, per-slide text |
| 8 | **phone_frame** | 10 | 24 | 4 | 0 | M | device frame around a recording (flat or tilted) |
| 9 | **annotate** | 10 | 21 | 1 | 0 | M | arrow, circle, X, check, highlight, redaction blur at a box |
| 10 | **zoom_punch** | 8 | 19 | 3 | 1 | S | punch-in / shake presets that generate `motion` keyframes |
| 11 | **sfx** | 9 | 17 | 1 | 2 | M | bundled CC0 sound effects (pop, whoosh, ding, shutter, keys) |
| 12 | **typewriter** | 8 | 16 | 2 | 2 | M | char/word reveal for typed prompts, code, search queries |
| 13 | **grid** | 11 | 16 | 0 | 8 | S | `layout.grid(cols, rows, gap)`, `layout.columns(n)` (left/right, three-way) |
| 14 | **beat_sync** | 7 | 13 | 1 | 0 | M | beat times from music, then cuts snapped to beats |
| 15 | **speed** | 6 | 11 | 2 | 1 | S/M | playback rate (timelapse, slow-mo); reverse / freeze via derive |
| 16 | **social_card** | 6 | 10 | 0 | 1 | M | tweet / Reddit / review / App Store review card |
| 17 | **filters** | 6 | 9 | 1 | 1 | S | named colour presets: grayscale, warm, VHS, grain |
| 18 | **comment_reply** | 3 | 8 | 2 | 1 | M | "Reply to @user's comment" sticker |
| 19 | **tts** | 4 | 8 | 1 | 0 | M | text-to-speech voiceover, cached |
| 20 | **wipe** | 2 | 6 | 2 | 1 | M | before/after slider wipe (clip-path tween) |
| 21 | chat_ui | 3 | 6 | 1 | 0 | M | chat bubbles appearing over time |
| 22 | notification_ui | 3 | 6 | 0 | 0 | M | lock-screen notification stack |
| 23 | ai_chat_ui | 2 | 5 | 1 | 0 | M | AI chat prompt + streamed answer |
| 24 | notes_ui | 3 | 5 | 0 | 0 | M | notes-app page |
| 25 | blur_fill | 2 | 5 | 1 | 1 | S | landscape over a blurred, scaled copy of itself |
| 26 | duck | 2 | 5 | 1 | 0 | S | duck music under voice |
| 27 | transitions | 3 | 5 | 0 | 0 | S | flash / whip / zoom presets |
| 28 | search_ui | 2 | 4 | 0 | 0 | M | search bar with typed query |
| 29 | poll_ui | 2 | 4 | 0 | 0 | M | poll / quiz / this-or-that bars |
| 30 | jump_cut | 1 | 3 | 1 | 0 | L | auto-remove silences, remapping transcript times |
| 31 | lower_third | 2 | 2 | 0 | 1 | M | name tag / news chyron |
| 32 | emoji | 1 | 2 | 0 | 0 | L | colour emoji overlays (needs a bundled OFL/CC emoji font) |
| 33 | chroma_key | 1 | 1 | 0 | 1 | S/M | key out solid green/blue via `media.derive` + ffmpeg `chromakey` |
| 34 | waveform | 1 | 1 | 0 | 0 | M | audiogram waveform (ffmpeg `showwaves` → derived video) |
| 35 | reframe | 0 | 0 | 0 | 0 | L | 16:9 → 9:16 subject tracking; no catalog format needs it yet, so skip |

Usage of the shipped primitives: caption 114, video 112, music 91, clip_audio 46, karaoke 34, image 19, motion 19, html 15, split 14, cutout 10, pip 5, solid 2. `karaoke` is used by 34 formats but needs `transcribe` before it is usable without hand-typed word timings.

## Build plan

Each wave counts what becomes buildable (greedy order by weighted unlock).

### Wave 1: pure-JS helpers (≈ 2 days, no compiler change, new files under `src/core/components/`)
1. **`sequence(items, { start })`**: `[{ src, trim?, duration?, caption?, id? }]` → flat clips with computed starts, plus `end`. It handles video and image items, and a `loop` fallback for short sources. This is the single biggest unlock (68 formats).
2. **`captionTrack(steps, { start, end, defaultSecs, ...captionStyle })`** plus `parseStep()`: lift no-yapping's `"caption :: 4"` / `"caption :: 10-15"` grammar into core. Overlapping windows are an error. The last sequential step holds to `end`. Pair it with an `input.steps()` (or `input.list(input.text())`) convention so CLI, props and the docs table stay uniform.
3. **`rankBadge(n, o)` / `listItem(o)`**: a static badge, built on `html()` or a new caption style.
4. **`layout.grid` / `layout.columns`**: geometry only.
5. **`punch(at, { scale, duration })` / `shake()`**: presets that return `motion` arrays.
6. **`filters` presets**: wrappers over the existing `style` option (`filter: grayscale(1)` already works today).
7. **`slideshow(slides, { kenBurns })`**: composed from `image()` + `motion` + `caption()`.

→ **86 / 199** formats buildable (29 of 58 priority-1).

### Wave 2: `prepare()` helpers around the pinned HyperFrames 0.8.181 (all verified present in `hyperframes --help`)
1. **`media.transcribe(ref, { language })`**: runs `hyperframes transcribe` (whisper / parakeet, word-level) through `media.derive` (key includes model + language) and returns `[{ text, start, end }]` in source time. Add **`autoCaptions(words, { offset, maxWords: 3 })`** to group words for `karaoke()`. This unblocks the whole talking-head category.
2. **`media.tts(text, { voice, speed })`**: runs `hyperframes tts` (Kokoro, local), cached, then transcribed for karaoke.
3. **`media.beats(ref)`**: `hyperframes beats` writes `beats/<audio>.json` for a project dir. Wrap it to return `number[]`, plus `snapToBeats(times, beats)`.
4. **duck**: HyperFrames has a volume automation lane (`data-automation`, see `hyperframes docs data-attributes`). Emit it for music under voice segments.

→ **109 / 199** (35 P1).

### Wave 3: `html()` component families (deterministic GSAP, no network, TikTok Sans, generic UI)
- **end_card / banner**, **counter** (tween a proxy object and write formatted text in `onUpdate`; this is seek-safe because the timeline is paused and seeked), **phone_frame**, **annotate**, **typewriter**, **wipe** (`clip-path` tween; needs `clipPath` added to the motion whitelist or done inside `html()`).
- **Mockups:** one module, data-driven, sharing CSS tokens. It covers comment_reply, social_card, chat_ui, ai_chat_ui, notes_ui, search_ui, notification_ui, poll_ui and lower_third.

  **Mockups must be generic look-alikes.** No Apple, TikTok, OpenAI, X or Reddit logos or trade dress copied pixel-for-pixel. Use the user's own name and handle. Never present a fake post as a real person's (RULES.md and the repo's no-impersonation stance).

→ **175 / 199** (53 P1).

### Wave 4: assets and heavier media
- **sfx**: ship about 10 CC0 effects in `shared/sfx/` with a LICENSE manifest. The engine copies them into `assets/` like the font.
- **emoji**: bundle an OFL colour-emoji font (e.g. Noto Color Emoji) under `shared/fonts/`, which adds about 10 MB. Weigh that against SVG Twemoji (CC-BY, needs attribution).
- **speed**: the HyperFrames 0.8.181 runtime handles `data-playback-rate` (present in `dist`, not listed in `docs data-attributes`). Verify it with a render. Then add `rate` to `video()` and divide the source span by `rate` in `clipLength`. Do reverse and freeze-frame with `media.derive` + ffmpeg.
- **jump_cut** (ffmpeg `silencedetect` → derived cut file + time map), **chroma_key**, **waveform**, **blur_fill** (two `video()` of one ref: a blurred cover behind a contained copy; check decode cost), **transitions**.

→ **199 / 199**.

## Small core changes this research recommends (owners: core team)

1. **Add `trend` and `skit` to `CATEGORIES`** in `src/core/template.mjs` (catalog/TAXONOMY.md). This is backwards compatible.
2. **Safe band right edge.** YouTube Shorts reserves 192 px on the right (Google Ads vertical spec, as summarised by [socialync, read Oct 11 2026](https://www.socialync.io/tools/safe-zones/youtube-shorts)). The band's right edge is x = 900, which leaves 180 px. Make `SAFE_ZONE` left and right **192** (band 696 × 1200), or accept the 12 px risk. See RULES.md §4.
3. **Ads safe profile.** Export `SAFE_BANDS = { organic, ads }` and add a `make --safe ads` flag. The ads band is y 288–1248 and x 192–888, the intersection of the TikTok, Meta and Google ad specs. Ads add CTA buttons that cover far more of the bottom than organic UI does.
4. **Photo-mode export.** A future `reelclaw export <name> --slides` would write one PNG per slide (HyperFrames `snapshot`), so slideshow templates can also post as native TikTok photo carousels, which TikTok reports get more likes and shares than video.
