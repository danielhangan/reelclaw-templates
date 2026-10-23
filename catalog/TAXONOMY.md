# Format taxonomy

How reelclaw classifies viral short-form formats (TikTok, Instagram Reels, YouTube Shorts; 1080×1920 @ 30fps). Use it to choose a category for a new template, to reverse-engineer a viral video into a template, and to see which engine primitives a format needs.

- **`catalog/formats.json`** has about 200 concrete format ideas that use these categories. It is the roadmap toward 600 templates.
- **`catalog/PRIMITIVES_GAP.md`** lists the engine features to build next, ranked by how many formats each one unlocks.
- **`RULES.md`** holds the platform rules (safe zones, typography, audio). They apply to every category.

Research basis (October 2026): DansUGC's tracked viral concepts (`reelclaw_suggest_formats`), [Motion's 2026 ad-format library](https://motionapp.com/library/formats/) (hit rates across 113 formats), [Lightreel's consumer-app TikTok report (Oct 2026)](https://www.lightreel.ai/blogs/consumer-apps-on-tiktok) and 2026 format guides ([eliro](https://eliro.pro/blog/10-video-formats-best-tiktok), [contentgrip](https://www.contentgrip.com/best-performing-tiktok-content-types/)). Treat the vendor percentages as directional, not as benchmarks.

## Rules every format shares

1. **The hook lives in the first 1–2 s.** Frame 1 must already show the hook caption and a face or a striking visual. Never open on a fade from black or a logo. Captions are static (RULES.md §3) because a caption that animates in is unreadable on the first frame.
2. **Show the result before the process.** Tutorials, before/after and demos all front-load the payoff, or tease it, and then explain.
3. **One idea per reel.** Typical lengths: app-growth reels 7–15 s; listicles and tutorials 15–35 s; talking heads 20–60 s. Shorter reels loop more, and loops count as rewatches.
4. **Sound off by default.** Most viewers start muted, so every format must read through its captions alone. Clip audio is muted unless the format is spoken (RULES.md §6).
5. **Looks native, not like an ad.** Use phone-shot UGC, TikTok Sans and native caption styles. Polished motion graphics are the exception. Motion and Lightreel both report organic-looking UGC beating produced creative.
6. **Hard cuts are the default transition.** Use fancy transitions only when the format is the transition (glow-up, beat-drop).

## Categories

`id` is the template `category` value. Ten categories already exist in the engine's `CATEGORIES` (`packages/reelclaw/src/core/template.mjs`). `trend` and `skit` were added for this taxonomy. The engine's `text-story` covers wall-of-text, POV and chat stories.

| id | What it is | Formats in catalog |
| --- | --- | --- |
| `reaction` | A creator's face reaction as the hook, then the thing they react to | 14 |
| `greenscreen` | A creator cut out over a background (screenshot, demo, post) | 10 |
| `tutorial` | How-to and no-yapping step formats | 15 |
| `text-story` | Text carries the story: wall of text, POV, chat or notes stories | 23 |
| `listicle` | Numbered items, rankings, tier lists, this-or-that | 18 |
| `talking-head` | Speech to camera with word captions: podcasts, interviews, faceless TTS | 17 |
| `before-after` | Transformations, wipes, old way vs new way | 10 |
| `slideshow` | Photo-mode carousel as video, Ken Burns, photo dumps | 12 |
| `meme` | Meme templates rebuilt with your own footage | 11 |
| `ugc-ad` | Performance-ad structures: testimonial, unboxing, offer-first, us-vs-them | 23 |
| `product-demo` | Screen-recording demos, phone mockups, feature callouts | 15 |
| `split-screen` | Two or three simultaneous streams: gameplay split, duet, A/B | 7 |
| `trend` *(proposed)* | Beat-sync montages, routines, day-in-the-life, challenge series | 16 |
| `skit` *(proposed)* | Acted scenarios: two characters, call or news parodies | 8 |

The sections below give each category's structure, pacing, captions and the primitives it needs. Primitives marked **(gap)** are not in the engine yet; PRIMITIVES_GAP.md describes them.

### reaction
- **Structure:** reaction (hook) → hard cut → proof (demo, screenshot, result). Variants keep the reaction on screen: split, PiP, or a stack of reactions.
- **Pacing:** reaction 1.5–3 s. The cut lands on or just before the peak of the expression. Proof runs 4–12 s.
- **Captions:** one hook caption (`tiktok-outline`) for exactly the reaction window, plus an optional payoff caption over the proof. Hooks are first person and specific: "i was about to cancel and this app…".
- **Audio:** music only. Reaction audio stays muted unless the creator speaks the hook.
- **Primitives:** video, caption, music, split / pip. **(gap)** sequence for multi-beat reactions, counter for stat reveals, comment_reply.
- **Footage:** your own clip or a creator's. DansUGC reaction clips are optional (`search_videos` or dansugc.com).

### greenscreen
- **Structure:** the background is the subject (screenshot, demo, post, chart) and the creator is cut out in the lower third. A cut-out that moves to a corner turns into a PiP.
- **Pacing:** background changes every 3–6 s, once per talking point. The creator speaks throughout.
- **Captions:** spoken, so word-by-word karaoke, in the upper-middle of the band (the cut-out covers the bottom). Any card text must also stay in the band.
- **Audio:** the creator clip's own audio at volume 1. Music, if any, sits low.
- **Primitives:** cutout (shipped, in prepare), motion, clip_audio. **(gap)** transcribe, social_card, slideshow, annotate, chroma_key.

### tutorial (incl. no-yapping)
- **Structure:** result or hook first, then 3–7 steps, then the finished result. Silent versions put step captions on the seam of a split; voiced versions run captions under speech.
- **Pacing:** 2–4 s per step. The last step holds to the end as the payoff.
- **Captions:** one short imperative per step ("paste ur script"), lowercase, native tone. Step numbers come from rank_badges, not from the caption text.
- **Primitives:** video, split, caption. **(gap)** caption_track (timed step list), sequence, rank_badges, zoom_punch for screen recordings, typewriter for code and prompts.

### text-story (wall of text, POV, chat or notes stories)
- **Structure:** a single looping background clip carries a long text (wall of text), or a sequence of short beats that replace each other (stacked reveals), or a UI mockup (chat, notes, search, notifications) that tells the story.
- **Pacing:** wall of text: one caption for the whole reel, sized so it can't be read in one pass, which drives rewatches. Stacked beats: 5–8 words every 2–3 s. Chat: a new bubble every 1–2.5 s.
- **Captions:** a wall of text uses `tiktok-box` or outline and relies on auto-fit (§5). POV opens with "POV:". Mockup text belongs to the mockup, so it is not a caption and needs no safe-band warning, though it still stays inside the band.
- **Primitives:** video, caption. **(gap)** caption_track, chat_ui, ai_chat_ui, notes_ui, search_ui, notification_ui, typewriter, tts (Reddit stories).

### listicle
- **Structure:** a title hook, then N items. Each item is a clip, a number badge and a one-line caption. Your product goes at #1 or in the last slot.
- **Pacing:** 2–4 s per item, with more time on #1. A countdown runs 5 → 1. Use 3–7 items.
- **Captions:** the title persists (top of band) or shows for the first 2 s. The item label sits mid-band.
- **Primitives:** **(gap)** sequence, rank_badges, caption_track. Tier lists and this-or-that also need grid and poll_ui.

### talking-head
- **Structure:** a face to camera. A hook title shows for the first ~3 s, then word captions. B-roll cutaways go over continuous voice. Jump cuts remove pauses.
- **Pacing:** speech-driven. Zoom or cut variation every 2–4 s keeps it moving.
- **Captions:** karaoke, 1–3 words per group, highlight `#ffe500`, centre-low of the band. Never in the bottom 500 px.
- **Audio:** clip audio on. Music ducked under voice, or none.
- **Primitives:** video, clip_audio, karaoke. **(gap)** transcribe (the blocker for the whole category), jump_cut, zoom_punch, tts and duck for faceless versions.

### before-after
- **Structure:** before (labelled) → optional process → after (labelled), or both on screen with a wipe.
- **Pacing:** before 1–3 s. The cut lands on a beat (beat_sync). After is held longest.
- **Captions:** two-word labels ("before", "day 30") plus one hook line.
- **Primitives:** video, caption. **(gap)** sequence, wipe, counter (day or money), filters (grayscale "old way"), speed (timelapse), beat_sync.

### slideshow
- **Structure:** photo-mode carousel as a video. Slide 1 is the hook (problem), the middle slides build the story, and the last slide is the payoff or product.
- **Pacing:** 2–3 s per slide (photo mode lets the viewer set the pace; video can't, so keep text ≤ 12 words a slide). Photo dumps cut on the beat.
- **Captions:** `tiktok-box` (native photo-mode text look), one block per slide.
- **Primitives:** image, motion. **(gap)** slideshow (Ken Burns + per-slide text), caption_track, beat_sync, phone_frame for app screenshots.
- **Note:** real TikTok photo-mode posts are images, not video. A later `reelclaw export --slides` could write the per-slide PNGs from the same template.

### meme
- **Structure:** a setup caption over a reaction clip, sometimes followed by a punchline cut. Rebuild famous memes with your own or licensed footage, never copyrighted stills.
- **Pacing:** 3–8 s. Punchline cuts are hard and often carry an SFX sting.
- **Captions:** a top bar (white panel, black text) or the outline style. "nobody: / me:", "when you…".
- **Primitives:** video, solid, caption. **(gap)** sequence, sfx, grid, filters.

### ugc-ad
- **Structure** follows the performance-ad playbooks:
  - problem → agitate → solve
  - testimonial
  - unboxing
  - offer-first banner
  - us vs them
  - 3 reasons why
  - "I tested it for 30 days"
  - social-proof mashup
  - genuine first use

  An end card closes.
- **Pacing:** under 15 s for in-feed ads; Spark Ads use the organic pacing of the underlying format.
- **Captions:** karaoke if spoken. Offer banners persist. Keep critical text inside the **ads profile** band (RULES.md §4) because ads add a CTA button.
- **Primitives:** **(gap)** sequence, caption_track, end_card, transcribe, social_card (reviews), annotate (us vs them), counter.

### product-demo
- **Structure:** a screen recording, raw or in a phone frame, with captions per feature. Zoom to the tapped area. A callout per feature.
- **Pacing:** 2–4 s per feature. Speed up dead time.
- **Captions:** a benefit (not the feature name) per segment.
- **Primitives:** video. **(gap)** phone_frame, caption_track, zoom_punch, annotate, blur_fill (landscape recordings), speed, end_card.

### split-screen
- **Structure:** two or three simultaneous streams (top/bottom, or left/right for duets). Gameplay-split: content on top, satisfying gameplay below.
- **Pacing:** continuous. Captions sit on the seam.
- **Captions:** a seam caption uses `layout.band(960, …)` with `unsafe: true` (documented exception).
- **Primitives:** split, video. **(gap)** grid (left/right, three-way), transcribe for spoken content.

### trend *(proposed)*
- **Structure:** templates that follow an audio or editing trend: beat-sync montage, beat-drop transition, routines, day in the life, GRWM, challenge series.
- **Pacing:** dictated by the music. Cuts land on beats; routines use 1.5–3 s per clip.
- **Captions:** one caption, or timestamps (7:00am). Minimal text.
- **Audio:** usually posted **without** baked music so the creator can attach the trending sound in-app (RULES.md §6). Templates should make music optional and beat-sync to the user's track.
- **Primitives:** **(gap)** sequence, beat_sync, caption_track, speed, transitions.

### skit *(proposed)*
- **Structure:** acted scenes with character labels. Call or news UIs frame them. The product is the punchline.
- **Pacing:** 2–5 s per line, cut on dialogue.
- **Captions:** karaoke for dialogue, labels for characters.
- **Primitives:** **(gap)** sequence, caption_track, transcribe, lower_third, notification_ui. Call UIs use html().

## Turning a viral video into a template

1. Watch it with the sound off. Write the shot list with timestamps (the `structure` field) and every caption, noting its window and position.
2. Classify it with the table above and pick the closest entry in `formats.json`. If none fits, add one there first.
3. Map each shot to primitives. If a primitive is a gap, use `html()` for now and note it in the template README. Three or more templates needing the same `html()` workaround is the signal to promote it into core (see PRIMITIVES_GAP.md).
4. The inputs are what changes between versions (clips, hook text, music). Everything the viral video does on purpose (timing, positions, styles) becomes the defaults.
5. Credit the reference in `defineTemplate({ source: { url, notes } })`. Never commit the reference media.

## formats.json fields

| Field | Meaning |
| --- | --- |
| `id` | snake_case catalog id. The template folder is `template_id` (kebab-case, Agent Skills naming) |
| `category` | one of the ids above |
| `status` | `exists` (in `templates/`), `building` (v2 template in progress), `idea` |
| `priority` | 1 = build next (proven, high reach, cheap); 2 = strong; 3 = long-tail breadth |
| `difficulty` | easy / medium / hard, assuming the gap primitives exist |
| `ready_today` | `true` if every primitive it needs already ships in the engine |
| `structure` | the shot list with timings |
| `primitives_needed` | keys of the top-level `primitives` map (`status: shipped | gap`) |
| `example_reference` | `description`, plus `url` only when a real public reference was found. URLs are pointers to study, not footage to reuse |
