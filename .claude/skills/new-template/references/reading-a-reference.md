# Reading a reference video

How to fill the `format` block in `analysis/<slug>/analysis.json` after looking at `contact-sheet.png` and `filmstrip.png`. `reelclaw scaffold --from` turns it into code, so precise notes mean less rewriting.

## What to look for

| Question | Where to look | Goes into |
| --- | --- | --- |
| How long until the first cut? | `pacing.firstCut` | `structure` (that is the hook length) |
| Same footage across cuts (jump cuts) or new footage? | contact sheet: same person/background? | `roles` (same name = same clip) |
| What is each shot? Selfie, screen recording, B-roll, product, text card? | contact sheet | `roles`: `selfie`, `screenRecording`, `product`, `broll` |
| Where does text sit? Top / center / bottom of the safe band? | filmstrip | `texts[].position` |
| When does text change? (often without a cut) | filmstrip timestamps | `texts[].start` / `end` |
| What style is the text? White + black outline (`tiktok-outline`), TikTok's native white box (`tiktok-box`), dark box (`tiktok-box-dark`), plain | keyframes up close | `captionStyle` |
| Word-by-word highlighted captions? | filmstrip (words light up in sequence) | `structure` + use `karaokeCaptions()` |
| Split screen, PiP, green-screen cut-out, zoom punch-ins? | contact sheet | `structure` |
| Voice, music only, or trending sound? | `media.hasAudio`, `transcript`, `beats.bpm` | `structure` |
| Do cuts land on beats? | compare cut times with `beats.times` | `structure` ("cuts on every 2nd beat") |

## Fields

```json
"format": {
  "name": "POV app reveal",
  "description": "A POV hook over a selfie, hard cut to the app solving it, then a payoff line. Works for app and product promos with a relatable problem.",
  "category": "product-demo",
  "tags": ["pov", "app-promo", "hard-cut"],
  "structure": "0–3s POV hook over a selfie → hard cut → 3–6s screen recording with a step caption → 6–8.5s payoff caption over the result",
  "whyItWorks": "The POV line is a relatable problem (curiosity gap); the answer arrives 3s in, before the swipe; the payoff line rewards finishing and drives rewatches.",
  "captionStyle": "tiktok-outline",
  "roles": ["selfie", "screen recording", "screen recording"],
  "texts": [
    { "text": "pov: you found the app", "start": 0, "end": 3, "position": "top" },
    { "text": "step 1", "start": 3, "end": 6 },
    { "text": "it actually works", "start": 6, "end": 8.5, "position": "bottom", "key": "payoff" }
  ]
}
```

- `description`: 20–400 chars, the format + when it works. Not the video's topic.
- `structure`: beat by beat with times — reviewers and the template's header comment read this.
- `whyItWorks`: the retention mechanics (curiosity gap, pattern interrupt, payoff, loop, rewatch bait, comment bait). This seeds the SKILL.md viral playbook.
- `roles`: exactly one entry per shot in `shots`, in order; `null` leaves a shot unassigned (`shotN`). Leave all null for fast montages (> 6 shots) to get one `--clips` list.
- `texts[].key`: optional camelCase input name. Defaults: `hook`, `caption2`, `caption3`… Only the first text is required.
- Text you transcribe here is reference material for timing and voice. Write fresh example copy in `example.json`.

## Formats that need more than the scaffold

- **Karaoke / word captions**: transcribe user footage in `prepare()` (`transcribeMedia()` / `loadTranscript()`), then `karaokeCaptions(words)` — see templates/talking-head-captions.
- **Cut-out over background (greenscreen)**: `prepare()` + `remove-background`, see `templates/greenscreen-reaction`.
- **Fixed text card / meme layout**: `solid()` + `caption({ region })`, or `html()` for anything custom.
- **Beat-synced montage**: pass `--beats`, keep `beats.times` as a constant only if the format ships its own sound; otherwise derive cut times from `inputs.music` in `prepare()`.
