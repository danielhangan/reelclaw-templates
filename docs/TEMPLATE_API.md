# Template API

A reelclaw template turns a few inputs (clips, text, music) into a 1080×1920 @ 30fps short-form video. You describe **what** goes on screen and **when**; the engine handles media download/staging, probing, safe zones, caption fitting, the HyperFrames composition, linting and rendering.

The reference implementation is [`templates/reaction-demo/template.mjs`](../templates/reaction-demo/template.mjs) — 60 lines, read it first. Then skim one template close to what you want to build:

| Template | Shows how to |
| --- | --- |
| `reaction-demo` | the basics: inputs, `video`, `visual`, `caption`, `music` |
| `no-yapping` | split screen, looping clips, a step list with per-item timing (`steps.mjs`) |
| `wall-of-text` / `listicle` | b-roll sequences, beat-snapped cuts (`prepare()` + `detectBeats`) |
| `greenscreen-reaction` | background removal (`cutout`), motion, voice levelling |
| `talking-head-captions` | transcripts, jump cuts, word-by-word captions |
| `before-after` | focus crops and a wipe reveal |

**Starting from a viral video?** In a checkout, `npx reelclaw analyze <link>` writes a shot list, keyframes and a filmstrip to `analysis/<slug>/`, and `npx reelclaw scaffold <id> --from analysis/<slug>` writes a working template folder to finish. The `new-template` skill (`.claude/skills/`, `.agents/skills/`) drives the whole loop; see [CONTRIBUTING.md](../CONTRIBUTING.md).

## A template folder

```
templates/<id>/
  template.mjs     defineTemplate({...}) — the only code you write (aim for 40–150 lines)
  SKILL.md         agent skill (Claude Code + Codex): when to use, inputs, commands, viral playbook
  README.md        human docs; the flags table is generated (`reelclaw docs <id> --write`)
  example.json     inputs CI makes + compiles (fixture media from scripts/make-fixtures.mjs)
  preview.gif      optional, small (<2MB)
```

`<id>` is **kebab-case** and equals the folder name and the SKILL.md `name` (the [Agent Skills](https://agentskills.io) spec requires lowercase letters, digits and hyphens, matching the folder). v1 snake_case ids (`reaction_demo`) still resolve as aliases.

## The smallest useful template

```js
// @ts-check
import { caption, defineTemplate, input, music, timeline, video } from "reelclaw";

export default defineTemplate({
  id: "hook-over-clip",
  name: "Hook over a clip",
  description: "One clip, full screen, with a hook caption for the first 3 seconds.",
  category: "talking-head",
  inputs: {
    clip: input.video({ required: true, description: "The video" }),
    hook: input.text({ required: true, description: "Hook caption" }),
    music: input.audio({ description: "Optional background music" }),
  },
  build({ inputs }) {
    const clip = video(inputs.clip, { id: "clip" });
    return timeline([
      clip,
      caption(inputs.hook, { id: "hook", start: 0, duration: Math.min(3, clip.duration) }),
      inputs.music && music(inputs.music),
    ]);
  },
});
```

```bash
npx reelclaw make hook-over-clip --clip me.mp4 --hook "nobody tells you this about…" --draft
```

Imports: templates may import only `"reelclaw"`, `node:` built-ins and files inside their own folder. (`"reelclaw"` always resolves to the engine that is running, even in a reel project without `node_modules`.)

## `defineTemplate(def)`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | kebab-case, = folder name, ≤ 64 chars |
| `name` | string | human title |
| `description` | string | 20–400 chars: the format and when it works |
| `category` | string | one of `CATEGORIES`: `reaction`, `tutorial`, `split-screen`, `greenscreen`, `talking-head`, `slideshow`, `listicle`, `meme`, `text-story`, `before-after`, `product-demo`, `ugc-ad`, `trend`, `skit`, `other` (add new ones in `src/core/template.mjs`) |
| `tags` | string[] | kebab-case search tags |
| `source` | `{ url?, notes? }` | the viral video this template recreates |
| `inputs` | `{ [camelCaseKey]: input.*() }` | see below |
| `prepare` | `async (ctx) => P` | optional async step (cut-outs, transcripts); see below |
| `build` | `(ctx) => Timeline` | **pure and synchronous**: same inputs → same timeline |

The manifest is validated when the module loads; mistakes fail with the exact field.

## Inputs

Every input is declared once and drives the CLI flag, validation, `--props` JSON, the README flags table, the JSON schema in `registry.json`, and `--help`.

| Helper | CLI | `build()` receives |
| --- | --- | --- |
| `input.video({ description, required? })` | `--clip <file\|url>` | `MediaRef` (staged + probed) |
| `input.image({ … })` | `--logo <file\|url>` | `MediaRef` (`isImage: true`, `duration: 0`) |
| `input.audio({ … })` | `--music <file\|url>` | `MediaRef` (video files accepted: their sound is used) |
| `input.visual({ … })` | `--broll <file\|url>` | `MediaRef` — a video **or** a photo (check `ref.isImage`); pair with `visual()` |
| `input.text({ description, required?, default?, maxLength? })` | `--hook "text"` | `string` |
| `input.number({ description, default?, min?, max?, integer?, unit? })` | `--trim 1.5` | `number` |
| `input.boolean({ description, default? })` | `--loop` / `--no-loop` | `boolean` (always defined, default false) |
| `input.enum(["top","center","bottom"], { description, default? })` | `--hook-position top` | the literal union |
| `input.list(input.text({…}), { description, min?, max? })` | `--step a --step b` | `string[]` (always defined, default `[]`) |

- Keys are camelCase; the flag is kebab-case (`hookPosition` → `--hook-position`). Props files accept either.
- An input is `T | undefined` in `build()` unless it is `required: true` or has a `default` — the types (JSDoc + `// @ts-check`) enforce this, so `npm run typecheck` catches a forgotten `inputs.hook2 &&`.
- Reserved keys (built-in `make` flags): `name`, `props`, `render`, `draft`, `quality`, `workers`, `project`, `help`, `json`, `open`.
- Media values may be local paths (relative to where the command runs), direct file URLs (downloaded), or page links — TikTok/Instagram/YouTube/X (yt-dlp). Everything is copied into `assets/<slug>-<sha256:12>.<ext>`: same bytes reuse one file, different bytes never collide.

### `MediaRef`

```ts
{ kind, label, src: "assets/clip-3cab25a7ddc7.mp4", path: "/abs/…",
  duration, width, height, fps, hasVideo, hasAudio, hasAlpha, isImage }
```

Width/height are the displayed size (phone rotation applied). Use them for geometry (crops, aspect-aware boxes) and `duration` for timing.

## `build({ inputs, prepared, canvas, safe, warn })`

Return `timeline([...clips], { duration?, background? })`.

- Clips paint in array order (later = on top). Falsy entries are dropped and nested arrays flattened, so optional clips go inline: `inputs.hook2 && caption(...)`.
- Times are absolute reel seconds. The reel's duration defaults to the end of the last **visual** clip (audio never extends a reel).
- `warn(msg)` reports a non-fatal problem to the user (it is printed and returned by `makeReel`). For fatal problems `throw new ReelclawError(msg, { hint })` / `fail(msg, hint)` from `"reelclaw"` — always include the fix.

### Clip builders

All builders take `id` (element id — give the important ones semantic ids like `"hook"`, `"demo"`; agents edit by id later), `start` and `duration`.

**`video(ref, o)`** — `trim` (seconds into the source, default 0), `duration` (default: the rest of the source, via `clipLength`), `box` (default full frame), `fit` (`cover` | `contain`), `objectPosition`, `volume` (default **0 = muted**, RULES.md §6), `fadeIn`/`fadeOut` (audio, seconds), `loop` (repeat a short source to fill `duration`), `mirror`, `crop` (region of the *source* in source px shown in `box`), `motion`, `style` (extra inline CSS).

**`image(ref, o)`** — `duration` (required), `box`, `fit`, `objectPosition`, `motion`, `style`.

**`audio(ref, o)`** — `trim`, `duration` (default rest of file), `volume` (default 1), `fadeIn`, `fadeOut`.

**`music(ref, { trim, volume, fadeOut = 0.8 })`** — background track from 0 to the end of the reel, fading out over the last 0.8s. A track shorter than the reel ends early with a warning.

**`caption(text, o)`** — `style`, `position` (`top` | `center` | `bottom` inside the region), `align` (`center` | `left`), `size` (base px, default 58), `minSize` (default 26), `region` (box the text must fit in; default the safe band), `maxHeight` (default `region.h - 50`), `motion`, `unsafe` (silence the safe-band warning for deliberate placements). Newlines in text are kept. Word-by-word captions are the `karaokeCaptions()` component (below).

**`solid(color, o)`** — a flat box (e.g. a white panel behind a letterboxed recording).

**`html({ html, css, script, box, start, duration })`** — escape hatch for custom motion graphics. `css` goes into the page `<style>`; `script` is a function body run once with `(tl, el, start, duration)` — add GSAP tweens to `tl` at **absolute** times. Must stay deterministic: no `Math.random`, clocks or network.

### Caption styles (RULES.md §2)

| Style | Look |
| --- | --- |
| `tiktok-outline` (default) | white fill, black outline (0.14em), soft shadow — the classic |
| `tiktok-box` | TikTok's native text tool: black text on white boxes, one per line, merged into one rounded shape |
| `tiktok-box-dark` | the same with white text on a translucent black shape |
| `plain` | white with a soft drop shadow, no outline |

Use `CAPTION_STYLES` / `CAPTION_POSITIONS` from `"reelclaw"` for style and position inputs, so every template speaks the same vocabulary (`--hook-style tiktok-box`). `tiktok-outline` is the safer default over screen recordings (a white box disappears on a white UI).

Captions are **static** by default (RULES.md §3): fully visible on their first frame. Text auto-shrinks in 2px steps from `size` to `minSize` until it fits `maxHeight` and the region width — measured in the browser with the real font, so walls of text are fine. A caption region outside the safe band produces a warning.

### Layout helpers

```js
import { CANVAS, SAFE_BAND, layout, place } from "reelclaw";

CANVAS                 // { width: 1080, height: 1920, fps: 30 }
SAFE_BAND              // { x: 180, y: 220, w: 720, h: 1200 } — where text may go
layout.full()          // whole frame
layout.split(0.5)      // { top, bottom } halves (ratio of the top part)
layout.pip({ anchor: "bottom-right", widthPct: 35, aspect: 9 / 16, margin: 40 })
layout.band(960, 240)  // a strip centred on y=960 (e.g. a caption on a split seam)
place(w, h, "top-left", margin)   // anchors: top|center|bottom × left|center|right, or "center"
```

Boxes are `{ x, y, w, h }` in canvas pixels.

### Motion

Videos, images and captions accept `motion: [{ at, duration, from?, to, ease? }]` — GSAP tweens of `x`, `y`, `scale`, `rotation`, `opacity`, `xPercent`, `yPercent` on the clip's wrapper (video/image) or text (caption), in absolute reel time. The clip sits in its `from` state until `at`, so seeking anywhere renders correctly. `from` defaults to the resting state. Example — a cut-out dragged from the centre into the corner:

```js
video(cutout, { box: corner, motion: [{ at: 2, duration: 0.9, from: { x: -300, y: -700, scale: 2 }, to: { x: 0, y: 0, scale: 1 }, ease: "power3.inOut" }] })
```

### Timing helpers

`clipLength(ref, trim)` — playable seconds from `trim`, rounded down to 0.1s with a safety margin. `end(clip)` — `start + duration`. `ms(n)` — round to the millisecond.

## `prepare(ctx)` — the async step (optional)

For work that must happen before layout: background removal, transcription, beat detection, proxies. It receives `{ inputs, root, cwd, media, hyperframes, log, warn }` and returns any object, passed to `build()` as `prepared`. Most of the time a component does the work and the caching for you:

```js
import { cutout, placeCutout, video, timeline } from "reelclaw";

async prepare({ inputs, ...ctx }) {
  return { cut: await cutout(ctx, inputs.reaction) };      // cached by content hash: re-runs are instant
},
build({ inputs, prepared: { cut } }) {
  const box = placeCutout(cut.subject, { widthPct: 40, anchor: "bottom-left" });
  return timeline([video(inputs.video), video(cut.video, { box, crop: cut.subject })]);
},
```

For your own derived files use `media.derive({ from, key, ext, kind, produce })`: it names the output after the source's content hash + `key` (put every option that changes the output into `key`), runs `produce(inPath, outPath)` once, and probes the result. `media.stage(value, kind, label)` stages an extra file. `hyperframes(args)` runs the pinned HyperFrames CLI in the project. `cwd` is where the user ran the command — resolve user-given paths (a transcript file) against it.

## Components

Reusable building blocks on top of the clip builders, all exported from `"reelclaw"` (source and a usage example at the top of each file in `packages/reelclaw/src/core/components/`). Reach for these before writing an `html()` clip.

| Component | What it does |
| --- | --- |
| `visual(ref, { start, duration, fill?, focus?, box?, trim?, volume? })` | any video or photo framed natively: 9:16 fills, landscape sits whole over a blurred copy (`fill: "auto"`, `FILLS`), stills get a slow push-in, short clips loop. `FOCUS` presets pick what stays in frame |
| `sequence(refs, { start, duration, cuts?, slot? })`, `evenCuts`, `slotBounds` | cut a list of b-roll into back-to-back slots; reused clips continue where they left off |
| `nativeText(text, { start, duration, theme?, align?, region? })` | TikTok's native text box with extra themes (`NATIVE_TEXT_THEMES`: white, dark, black, red, yellow) |
| `karaokeCaptions(words, { style?, region?, highlight? })`, `karaokeRegion`, `chunkWords` | word-by-word captions (1–4 words, spoken word lit) — one timed element per chunk |
| `loadTranscript(file)`, `transcribeMedia({ root, from, hyperframes })` | word timings from a JSON/SRT/VTT file or the pinned `hyperframes transcribe` (cached) |
| `speechRanges`, `sentenceBreaks`, `splitRanges`, `layoutSegments`, `mapWords`, `toReel` | jump cuts: tighten pauses, punch-in zooms per sentence, map source times onto the reel |
| `cutout(ctx, ref, { quality? })`, `placeCutout`, `dragFrom` | background removal (cached), the subject's bounding box, placement and a drag-in move |
| `normalizedVoice(media, ref)` | the clip's voice levelled to -14 LUFS as a separate audio track |
| `detectBeats({ root, music })`, `snapToBeats`, `toReelTime` | beat times of the music (cached) and cut snapping |
| `focusCrop(ref, box, { x, y, zoom })` | the source region to show for an off-centre subject or a punch-in (`video(ref, { crop })`) |
| `wipeReveal({ target, box, at, duration })` | the before → after swipe, seek-safe |
| `numberBadge(n, { start, duration, center })` | list number badge |
| `readingSeconds(text)`, `splitTimed("text :: 4")`, `clamp` | pacing helpers for text formats |

A new component belongs in core when a second template needs it: add `components/<name>.mjs` with JSDoc and a usage example, export it from `src/index.mjs`, add a `node:test` file, and a row here.

## What `make` produces

```
reels/<name>.html   standalone HyperFrames composition (no <template>/host page)
reels/<name>.json   { "template": id, "inputs": {...} } with media as staged assets/ paths
renders/<name>.mp4  with --render / --draft
```

The HTML is meant to be edited — by people and agents — after generation: semantic ids, plain CSS, one paused GSAP timeline on `window.__timelines[<name>]`, media paths `../assets/…`, `data-start` / `data-duration` / `data-media-start` / `data-volume` / `data-fade-out` attributes. After hand edits: `reelclaw check <name>` (HyperFrames lint), then `reelclaw render <name>`. Re-running `make` with the same `--name` overwrites the file.

`makeReel()` lints every generated reel; a lint error means a template bug (usually inside an `html()` clip).

## `example.json` and CI

```json
{ "template": "reaction-demo", "inputs": { "reaction": "fixtures/portrait-talking.mp4", "hook": "…" } }
```

Paths are relative to the repo root. Fixtures (all synthetic, gitignored) come from `npm run fixtures`:

| File | What |
| --- | --- |
| `fixtures/portrait-talking.mp4` | 720×1280, 6s, with audio — a reaction stand-in |
| `fixtures/portrait-silent.mp4` | 720×1280, 5s, no audio stream |
| `fixtures/landscape-screen.mp4` | 1280×720, 6s, screen-recording look |
| `fixtures/person-on-green.mp4` | 720×1280, 5s, person-like shape on green, with audio (cut-out tests) |
| `fixtures/music.m4a` | 20s, 100 bpm beat over a tone bed (beat sync detects it) |
| `fixtures/photo.jpg` / `fixtures/logo.png` | still image / transparent PNG |

`reelclaw validate [id]` checks the manifest, SKILL.md frontmatter, README/example presence, leftover `TODO` markers, validates `example.json`, and runs a full make (stage → prepare → build → compile → lint) in a throwaway project; `--render` adds a draft render. Exercise your template's optional inputs in `example.json` so CI covers them. `reelclaw preview <id> --props real.json` writes `preview.gif` (≤ 2MB) for the gallery from footage you have the rights to; CI's gates are in [CI.md](CI.md).

## SKILL.md

Agent Skills frontmatter, then the playbook:

```md
---
name: <id>
description: <what it makes + when to use it, ≤ 1024 chars — this is what agents match on>
---
```

The body must: (0) bootstrap with `npx reelclaw@latest add <id>` when `templates/<id>/template.mjs` is missing, then `npx reelclaw doctor`; (1) list the inputs to collect; (2) give the exact `npx reelclaw make <id> … --draft` command; (3) explain iterating (`--props reels/<name>.json`, `--name`), final render and hand edits (`reelclaw check`); (4) the viral playbook for the format. Footage sourcing: the user's own files/links first; DanSUGC (MCP `search_videos` if connected, or dansugc.com) is an optional extra — never required. See `templates/reaction-demo/SKILL.md`.

## Gotchas

- **`build()` must be pure.** No file I/O, network, `Date`, `Math.random` — do async work in `prepare()`.
- **Video sound is off unless you set `volume`.** Only formats that need native sound (greenscreen talk-over, voiceover) should default a clip volume above 0; say so in the README.
- **A video that needs more footage than its source has is an error**, not a silent clamp (so the cut timing stays right). Use `loop: true`, a shorter `duration`, or validate `trim` against `ref.duration` and `fail()` with a hint.
- **Don't nest timed clips.** Every builder emits flat, independently timed elements; for custom groups use one `html()` clip and animate its children with GSAP.
- **Ids must be unique** across the reel; give repeated clips distinct ids (`step-1`, `step-2`) or omit them.
- **Never tween `visibility`/`display` on a clip** in `html()` scripts; the runtime owns clip visibility — animate `opacity` on a child.
- Keep text inside `SAFE_BAND`; if a format deliberately puts text elsewhere (a caption on a split seam), pass `unsafe: true` and say why in the README.
