# Template rules

Shared rules every template in this repo follows. They encode platform constraints (TikTok + Instagram Reels) and the house caption style. If a template deviates, its README must say so and why.

## 1. Canvas

- 1080×1920 (9:16), 30fps, MP4 output.
- Footage of any resolution/orientation is center-cropped to fill (`object-fit: cover`).

## 2. Typography — TikTok Sans only

- All text overlays use **TikTok Sans** (`fonts/TikTokSans-Variable.ttf`, variable wght 300–900, SIL OFL 1.1).
- Embed it with `@font-face` from the template's `assets/fonts/` — never rely on the system having it installed.
- Classic TikTok caption style: **white fill, black outline, no background pill**:

```css
color: #fff;
font-family: "TikTok Sans", sans-serif;
font-weight: 700;
paint-order: stroke fill;
-webkit-text-stroke: 8px #000;
text-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
```

## 3. Captions are static

- **No entrance/exit transitions.** A caption is at full visibility on the first frame of its window.
- A caption's window matches its video segment exactly (same start, same end).

## 4. Safe zones (the green zone)

Platform UI covers the frame edges. Keep all text inside the cross-platform safe band — the intersection of TikTok and Instagram Reels UI margins on a 1080×1920 canvas:

| Edge | TikTok UI | IG Reels UI | Rule (worst case) |
| --- | --- | --- | --- |
| Top | ~130–150px (tabs) | ~140–220px (account row) | keep **220px** clear |
| Bottom | ~320–500px (caption/music/CTA) | ~320–500px (caption stack) | keep **500px** clear |
| Left | ~60–100px | ~60–90px | keep **180px** clear (symmetric with right) |
| Right | ~120–200px (action rail) | ~130–180px | keep **180px** clear |

Resulting text band: **720×1200px**, from y=220 to y=1420, horizontally centered. Numbers drift with app updates — re-verify occasionally and preview against a safe-zone overlay before big pushes.

## 5. Auto text sizing

- Captions start at a base size (58px default) and shrink in 2px steps until the text fits the safe band (fit box ~1150px tall), floor 26px.
- Never let text overflow the safe band; never clip mid-glyph. Long wall-of-text hooks are a supported input.
- Re-fit after `document.fonts.ready` so measurement uses the real font.

## 6. Audio defaults

- **Clip audio is muted by default** — the music track is the only sound.
- Per-clip volume is opt-in via flags (`--reaction-volume`, `--demo-volume`).
- Music fades out over the final 0.8s.
- Consider posting without baked music for organic TikTok — attaching the trending sound in-app feeds the algorithm; baked music suits ads and platforms where you can't attach sounds.

## 7. HyperFrames contract

- One paused GSAP timeline per composition, registered on `window.__timelines["<id>"]`.
- Deterministic renders: no clocks, no `Math.random`, no network fetches at render time.
- Generators emit a template-wrapped sub-composition (`compositions/<name>.html`) plus a standalone host page (`host-<name>.html`); **always render the host page** (`hyperframes render -c host-<name>.html`) — the CLI cannot render a template-wrapped file directly.
- Videos are `muted playsinline`; sound always lives on separate `<audio>` elements.
