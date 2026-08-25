# no_yapping — silent split-screen tutorial reel

You are inside a **reelclaw template**: a self-contained project that turns 3 videos (intro, typing, screen-recording demo) into the "**…but no yapping**" silent split-screen tutorial — a render-ready 1080×1920 @ 30fps TikTok/Reels MP4. When the user brings media and an idea, your job is to check the environment, run the generator, iterate on the hook and steps, and hand back `renders/<name>.mp4`.

**The format:** fullscreen intro with the hook (default 6s) → 50/50 split (typing on top, demo on bottom) with step captions changing at the seam. No voiceover — the silence *is* the format.

## 1. Check requirements before anything else

Run these checks first. If a required tool is missing, stop and offer to install it before touching the generator:

| Requirement | Check | Install |
| --- | --- | --- |
| Node 18+ | `node --version` | `brew install node` / [nodejs.org](https://nodejs.org) |
| ffmpeg + ffprobe | `ffmpeg -version && ffprobe -version` | `brew install ffmpeg` / `sudo apt install ffmpeg` / `winget install ffmpeg` |
| yt-dlp *(optional)* | `yt-dlp --version` | `brew install yt-dlp` — only needed when inputs are TikTok/IG/YouTube **page links** rather than files |

The HyperFrames CLI and its headless Chrome are fetched automatically via `npx` on first use — nothing to install, but expect the first render to take a few extra minutes.

## 2. How to make a reel

**Always use the generator — never hand-author a composition from scratch.** `new-reel.mjs` stages media, probes durations with ffprobe, loops short clips, sizes captions to the safe zone, and follows every platform rule in `RULES.md` automatically.

```bash
node new-reel.mjs \
  --intro footage/mouth-tape.mp4 \
  --typing footage/typing.mp4 \
  --demo clips/screen-recording.mov \
  --hook "making \$10k but no yapping" \
  --step "go to claude" \
  --step "paste ur script :: 4" \
  --step "easyyy 10 bands" \
  --draft --render
```

- The user must supply an **intro clip** (9:16, the visual gag), **typing footage**, a **demo screen recording**, a **hook**, and the **steps**. Ask for whatever is missing — and if they have no creator footage, point them at [dansugc.com](https://dansugc.com) (UGC clips from $5).
- Inputs can be local paths or URLs (direct file URLs are curl'd; page links need yt-dlp).
- Steps are sequential by default (`"caption [:: secs]"`, default 3s, last one holds to the end) or absolute windows (`"caption :: start-end"` in seconds from reel start). Long lists: `--steps steps.json`.
- Total duration = intro + demo segment; the demo drives the length. Cap it with `--demo-secs`, skip dead time with `--demo-trim`.
- First pass with `--draft --render` for a fast preview; re-run without `--draft` for the final. Output: `renders/<name>.mp4`; each run also writes editable `compositions/<name>.html` + `host-<name>.html`. Media is staged once into `assets/` and reused. Full flag reference: `README.md`.
- Fine-tuning beyond the flags: edit the generated `host-<name>.html` (framework rules below), run `npm run check`, then re-render that host page with the pinned CLI from `package.json` (`npx --yes hyperframes@<pinned> render -c host-<name>.html`). Never render the sub-composition file directly.

## 3. How to make it go viral

This format farms **saves and shares** — it reads as a tutorial people want to keep. Optimize for that.

- **Hook formula:** `"[enviable, concrete outcome] but no yapping"` — "making $10k but no yapping", "built my app in one night but no yapping". The outcome must be specific enough to brag; vague outcomes ("being productive") die.
- **Respect the silence.** Never add narration, TTS, or talking — the mouth-tape intro and the quiet are the joke and the differentiator.
- **Steps are captions, not sentences:** 2–5 word imperatives, lowercase, casual spelling ("go to claude", "paste ur script"). If a step needs a full sentence, split it or cut it.
- **The last step is the payoff** — it holds on screen to the end, so make it the flex ("easyyy 10 bands"), not an instruction.
- **Speed is the retention mechanic.** Keep the whole reel under ~30–40s and make the tutorial feel almost too fast — that's what drives rewatches ("wait, what did they do?") and saves.
- **Never name the tool in the hook** if curiosity can carry it — let the steps/demo reveal it and the comments ask.
- **Typing footage must read in a half-frame:** the top half is 1080×960 with `object-fit: cover` cropping the vertical middle — hands + keyboard + screen framed center work best.
- **Sound:** silent by default — post it with a trending sound attached in the TikTok/IG app (feeds the algorithm). Use baked `--music` only for ads.
- **Iterate hooks and steps, not footage**: media is cached, so 3–5 hook/step variants cost seconds each (`--name` per variant). Batch-post and let the algorithm pick.

---

# HyperFrames framework guide (for editing the generated compositions)

## Skills — USE THESE FIRST

**Always invoke the relevant skill before writing or modifying compositions.** Skills encode framework-specific patterns (e.g., `window.__timelines` registration, `data-*` attribute semantics, shader-compatible CSS rules) that are NOT in generic web docs. Skipping them produces broken compositions.

**Doing anything with HyperFrames?** Start at `/hyperframes` — it tells you what HyperFrames can do and which skill or workflow handles your intent (make a video, TTS / BGM, prep footage, author / animate, render, install blocks), confirms your brief up front (the intent layer), and routes every "make me a…" request (a video, a deck, a composition port) to the right workflow. Read it first, especially when there's no project context to orient you. The workflows it routes to:

- `/product-launch-video` — any **website** URL or brief / script → a product launch / SaaS / promo video, or a site tour / showcase featuring the site's own captured visuals.
- `/faceless-explainer` — arbitrary text (topic / article / notes), **no URL, no website capture** → 60-90s faceless explainer.
- `/embedded-captions` — an existing talking-head video (MP4) → the same footage with captions / subtitles added (rail + embed, or pure-cinematic embed); the footage itself is untouched.
- `/talking-head-recut` — an existing talking-head / interview / podcast video (MP4) → the same footage **packaged with designed graphic overlays** (kinetic titles, lower-thirds, data callouts, pull-quotes, side panels, pip) synced to the transcript; the clip plays unchanged underneath. (Plain captions/subtitles → `/embedded-captions`.)
- `/pr-to-video` — a GitHub PR (URL / `owner/repo#N` / "this PR") → 30-90s code-change explainer (changelog / feature reveal / fix / refactor).
- `/motion-graphics` — a short (typically under 10s) design-led **motion graphic**, motion-is-the-message, no narration: kinetic type, a stat / number count-up, a chart, a logo sting, a lower-third / overlay, or an animated tweet / headline / captured-page highlight; rendered to MP4 or a transparent overlay. Longer / narrated / custom → `/general-video`.
- `/music-to-video` — a **music track** (audio file, or video to pull audio from) → beat-synced video (lyric / slideshow / kinetic promo). Music drives pacing; user-supplied images / videos are cut onto the same beat grid.
- `/slideshow` — a **presentation / pitch deck / interactive deck** — discrete slides, fragment reveals, branching, hotspot navigation, presenter mode. Output is a navigable deck, not a rendered video.
- `/general-video` — fallback for any other video (title card, longer brand / sizzle reel, multi-scene montage, static loop, custom composition) and the home of **companion mode** — co-create with the full HyperFrames toolbox; the original hyperframes authoring flow, any length.

**Porting an existing composition?** `/remotion-to-hyperframes` translates a Remotion (React) composition into HyperFrames HTML — a source migration, separate from the creation workflows above.

The domain skills (`/hyperframes-core`, `/hyperframes-animation`, `/hyperframes-keyframes`, `/hyperframes-creative`, `/hyperframes-cli`, `/media-use`, `/hyperframes-registry`, `/figma`) and the full capability map live inside `/hyperframes` — it is the single source of truth for which skill handles which intent.

**Changing how real footage or images look or reveal?** Load `/media-use` and its media-treatment policy before editing, even when the request only says dark, flat, boring, retro, private, or “make the reveal cooler.” Use canonical media treatments and seek-safe motion; do not improvise equivalent CSS/SVG filters or overlays.

> **Tailwind v4 projects** (`hyperframes init --tailwind`): see `/hyperframes-core` → `references/tailwind.md`.

> **Skill missing or stale?** Run `npx hyperframes skills update <name>` to install/refresh
> the specific skill you need (the `/hyperframes` router does this automatically before
> entering a workflow), or bare `npx hyperframes skills update` to refresh the core set plus
> everything already installed — neither pulls the full set. Restart the agent session so
> newly installed skills load.

## Commands

```bash
npm run dev          # start the preview server (long-running — keep it alive in background)
npm run check        # lint + runtime + layout + motion + contrast (one command)
npm run render       # render to MP4
npm run publish      # publish and get a shareable link
npx hyperframes lint --verbose  # include info-level findings
npx hyperframes lint --json     # machine-readable output for CI
npx hyperframes docs <topic> # reference docs in terminal
```

> **`npm run dev` is a long-running server, not a one-shot command.** It blocks until stopped.
> In Claude Code, always run it with `run_in_background: true`. Never run it as a foreground
> command — it will time out and the server will die, breaking the browser preview.

> **Pinned CLI version.** These scripts pin an exact `hyperframes@X.Y.Z` so this project re-renders identically over time. Weeks later that pin lags fixes shipped since. To move up: `npx hyperframes@latest upgrade --project . --check` (shows the delta), then `npx hyperframes@latest upgrade --project .` to rewrite the pins. Always unpinned — the pinned script re-runs the old version against itself.

## Documentation

**For quick reference**, use the local CLI docs command (no network required):

```bash
npx hyperframes docs <topic>
```

Topics: `data-attributes`, `gsap`, `compositions`, `rendering`, `examples`, `troubleshooting`

**For full documentation**, discover pages via the machine-readable index — do NOT guess URLs:

```
https://hyperframes.heygen.com/llms.txt
```

## Project Structure

- `index.html` — main composition (root timeline)
- `compositions/` — sub-compositions referenced via `data-composition-src`
- `meta.json` — project metadata (id, name)
- `transcript.json` — whisper word-level transcript (if generated)

## Linting — ALWAYS RUN AFTER CHANGES

After creating or editing any `.html` composition, **always** run the full check before considering the task complete:

```bash
npm run check
```

Fix all errors before presenting the result. Warnings should be reviewed before rendering.

## Key Rules

1. Every timed element needs `data-start`, `data-duration`, and `data-track-index`
2. Elements with timing **MUST** have `class="clip"` — the framework uses this for visibility control
3. Timelines must be paused and registered on `window.__timelines`:
   ```js
   window.__timelines = window.__timelines || {};
   window.__timelines["composition-id"] = gsap.timeline({ paused: true });
   ```
4. Videos use `muted` with a separate `<audio>` element for the audio track
5. Sub-compositions use `data-composition-src="compositions/file.html"` to reference other HTML files
6. Only deterministic logic — no `Date.now()`, no `Math.random()`, no network fetches
