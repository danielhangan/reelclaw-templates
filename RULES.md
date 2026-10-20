# Template rules

Shared rules every template in this repo follows. They encode platform constraints (TikTok, Instagram Reels, YouTube Shorts) and the house caption style. If a template deviates, its README must say so and why. Last re-verified against platform specs: **2026-10-20** (sources in §4).

## 1. Canvas

- 1080×1920 (9:16), 30fps, MP4 output.
- Footage of any resolution/orientation is center-cropped to fill (`object-fit: cover`).

## 2. Typography — TikTok Sans only

- All text overlays use **TikTok Sans** (`shared/fonts/TikTokSans-Variable.ttf`, variable wght 300–900, SIL OFL 1.1).
- The engine copies it into each reel project's `assets/fonts/` and every composition embeds it with `@font-face` — never rely on the system having it installed.
- Default caption style (`tiktok-outline`): classic TikTok **white fill, black outline, no background pill**:

```css
color: #fff;
font-family: "TikTok Sans", sans-serif;
font-weight: 700;
paint-order: stroke fill;
-webkit-text-stroke: 0.14em #000; /* ≈ 8px at the 58px base size, scales when text shrinks */
text-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
```

- Other built-in styles: `tiktok-box` (TikTok's native text tool: black on white, line boxes merged into one rounded shape), `tiktok-box-dark`, `plain` (shadow only). Word-by-word captions come from the `karaokeCaptions()` component. See docs/TEMPLATE_API.md.

## 3. Captions are static

- **No entrance/exit transitions.** A caption is at full visibility on the first frame of its window.
- A caption's window matches its video segment exactly (same start, same end).
- Two exceptions, both deliberate:
  - **Spoken formats** (talking head, voiceover, TTS) use word-by-word captions (`karaokeCaptions()`). Use 1–3 words per group, with the current word highlighted. In 2026 this is the best-retaining style for speech.
  - **UI mockups** (chat, search bar, AI prompt) may type text in, because the typing is the content.

**Caption conventions**

- One idea per caption, in a native, lowercase-friendly tone. Text hooks are first person and specific.
- Reading time: show a caption for at least **1 s + 0.3 s per word**. This is a house heuristic. Walls of text are the exception: they are meant to be re-read.
- Size: the 58 px base sits inside the 50–75 px range that 2026 guides recommend for 1080-wide video. Only walls of text should shrink toward the 26 px floor.
- No emoji in captions yet. TikTok Sans has no emoji glyphs and the engine doesn't bundle an emoji font (catalog/PRIMITIVES_GAP.md).
- `tiktok-box` (white box) is low-contrast over white UI. Default to `tiktok-outline` over screen recordings.

## 4. Safe zones (the green zone)

Platform UI covers the frame edges. All text, faces in hook shots, and logos stay inside the **cross-platform safe band**. That band is the engine's `SAFE_BAND`, and captions warn when they leave it.

UI margins on a 1080×1920 canvas, in pixels:

| Edge | TikTok | IG Reels | YouTube Shorts | **House band (organic)** | Ads profile |
| --- | --- | --- | --- | --- | --- |
| Top | tabs / search ≈130–240 | account row ≈150–270 (Meta ads: 14% ≈ 269) | search / menu; 288 (Google ads) | **220** | 288 |
| Bottom | caption + sound ≈370–440; 660 with ad CTA | caption stack 20–35% ≈ 384–672 (Meta ads) | title, channel, subscribe; 672 (Google ads) | **500** | 672 |
| Left | ≈44–120 | 6% ≈ 65 | 48 | **180** | 192 |
| Right | action rail ≈120–180, from y≈840 down | 6% ≈ 65 (Meta); like/share rail ≈120 in practice | action rail 192 | **180** | 192 |

- **Organic band:** x 180–900, y 220–1420 (**720×1200**). This is the default and covers organic posts on all three apps.
  - Shorts' right rail is 192 px, so in the lower half keep text off the band's right edge. A proposal to make the side margins 192 is in catalog/PRIMITIVES_GAP.md.
- **Ads profile:** x 192–888, y 288–1248 (696×960). Paid placements add a CTA button and sponsor label, so Spark Ads and in-feed ads must keep critical text here. TikTok, Meta and Google publish their 2026 ad safe zones in very similar numbers. Even organic templates should put the **hook** in this core. `center` does; `top` starts near y 220, so ad variants should use `center` or the ads profile.
- **Feed and grid crops:** the first frame doubles as the cover.
  - Instagram shows Reels in the main feed cropped to 4:5, the centre 1080×1350 (y 285–1635).
  - The IG profile grid crops to 3:4, the centre 1080×1440 (y 240–1680).

  A first-frame hook inside y 285–1350 survives every placement.
- **Ad safe-zone margins** come from the platforms' ad specs. **Organic margins** are approximate (≈), because they vary with caption length, Shop/anchor links and app version. Preview against an overlay before a big push, and re-verify about every 6 months.

Sources, read 2026-10-20:
- [TikTok Ads: in-feed ad specs and safe-zone files](https://ads.tiktok.com/help/article/tiktok-auction-in-feed-ads). The safe zone depends on caption length and add-ons.
- [Meta Ads Guide: Reels](https://www.facebook.com/business/ads-guide/update/video/facebook-facebook-reels). Meta set one 9:16 safe zone (14% top, 35% bottom, 6% sides) across FB and IG Stories and Reels in March 2026, as summarised by [billo](https://billo.app/blog/meta-ads-safe-zones).
- [Google Ads: vertical video spec](https://support.google.com/google-ads/answer/9128498). The figure is an image only; its pixel values are transcribed by [socialync (read Oct 11, 2026)](https://www.socialync.io/tools/safe-zones/youtube-shorts).
- [socialync TikTok safe zones](https://www.socialync.io/tools/safe-zones/tiktok).
- [reap.video cross-platform margins (Sep 2026)](https://reap.video/blog/short-form-video-safe-zones).
- [Hopper HQ on the Reels 4:5 feed crop](https://www.hopperhq.com/blog/instagram-reel-size/).

## 5. Auto text sizing

- Captions start at a base size (58px default) and shrink in 2px steps until the text fits its region (default: the safe band, fit box 1150px tall), floor 26px. The engine does this for every `caption()`.
- Never let text overflow the safe band; never clip mid-glyph. Long wall-of-text hooks are a supported input.
- Re-fit after `document.fonts.ready` so measurement uses the real font.

## 6. Audio defaults

- **Clip audio is muted by default** — the music track is the only sound. In the IR: `video(ref)` has `volume: 0` unless the template sets one.
- Per-clip volume is opt-in via flags (`--reaction-volume`, `--demo-volume`). A clip with a volume keeps its sound on the `<video>` (`data-has-audio` + `data-volume`); sources without an audio stream are muted automatically with a warning.
- Music fades out over the final 0.8s (`music()` → `data-fade-out="0.8"`).
- Consider posting without baked music for organic TikTok — attaching the trending sound in-app feeds the algorithm; baked music suits ads and platforms where you can't attach sounds.

## 7. HyperFrames contract

The compiler (`packages/reelclaw/src/core/compile.mjs`) guarantees these; keep them when hand-editing `reels/<name>.html`:

- One **standalone** composition per reel (`reels/<name>.html`, root `<div data-composition-id>` directly in `<body>`, no `<template>` wrapper, no host page), rendered with `hyperframes render -c reels/<name>.html` — `reelclaw render <name>` does this with the pinned HyperFrames version.
- One paused GSAP timeline per composition, registered on `window.__timelines["<name>"]`.
- Deterministic renders: no clocks, no `Math.random`, no network fetches at render time. GSAP and the font load from the project's `assets/`.
- Silent videos are `muted playsinline`; music and voiceover live on separate `<audio id=…>` elements.
- Run `reelclaw check <name>` (HyperFrames lint) after hand edits.
