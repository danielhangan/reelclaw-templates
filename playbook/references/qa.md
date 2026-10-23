# QA: look at every frame before anyone else does

A render can "succeed" and still be broken: a fallback font, a caption under the TikTok buttons, a
frozen demo, a silent file, a cut in a dead moment. QA is mandatory for every reel you deliver.

## The tool: `reelclaw qa`

```bash
npx reelclaw make <template> … --draft         # renders, then runs qa automatically
npx reelclaw make <template> … --draft --no-qa # skip it (e.g. inside a quick experiment)
npx reelclaw qa <name>                         # by hand: after `render`, a hand edit, or --no-qa
```

`qa` reads the reel's timeline, so its frames land where they matter: the first frame, inside each
segment, just before and just after each cut, the payoff, and the last frame. It also writes a report:

| Report line | Meaning |
| --- | --- |
| canvas | 1080×1920 at 30 fps, as every reel should be |
| duration | matches what the composition declares |
| audio | levels, or **SILENT** (fine only when the user chose a silent organic post) |
| black | runs of (near-)black frames |
| frozen | stretches where the picture doesn't change (a clip ran out, or bad seeking) |
| music tail | with `--music`: the last moment is well below the mean, so the fade-out ran |
| render warnings | things the renderer logged but didn't fail on: a font, script or asset that didn't load |

**Then open every frame image it lists** (Claude Code: the Read tool on each `.png`; Codex:
`view_image`). Never judge from the report alone. Render warnings come first: fix them before
anything else, they usually explain what looks wrong.

## The checklist

| # | Check | Pass when | Typical fix |
| --- | --- | --- | --- |
| 1 | No render warnings | none in the report | restore a missing asset or font path; undo a hand edit that broke the script |
| 2 | Canvas | 1080×1920, 30 fps | only a hand edit can break this |
| 3 | Duration on target | in the template's range (SKILL.md table) | trim the source, lower segment flags (`--reaction-secs`, `--demo-secs`, `--secs`, `--duration`, `--item-secs`) |
| 4 | TikTok Sans rendered | compact letters, tall x-height, tight spacing | a wider, looser fallback (Helvetica / Arial / DejaVu) means the font didn't load: check `assets/fonts/` and the `@font-face` after hand edits |
| 5 | Text inside the safe band | no letter outside x 180–900, y 220–1420 (ads: x 192–888, y 288–1248) | shorter text, a different `--*-position`, a smaller `--*-size` |
| 6 | Hook readable in 1 s | fully on screen at frame 0, ≤ 3 lines, high contrast | shorten it, move it off busy areas, switch caption style |
| 7 | Nothing competes with the hook | no burned-in text, watermark or UI in the footage under it | another clip or trim window; move the hook away |
| 8 | Scroll-stopping first frame | a face mid-expression, a striking image, or the outcome, already on screen | trim so frame 0 is already interesting |
| 9 | Cuts land on the beat | reaction ≤ 3 s, cut right after the peak, not mid-blink or in dead air | `--trim`, `--reaction-secs`, the frame sheet in footage.md |
| 10 | Payoff within ~2 s of the cut | the product doing the thing, the after, item #1's wow: not a login, blank page or spinner | pre-trim the source to start at the aha |
| 11 | Framing | key UI, faces, hands and the subject in frame; nothing important cropped | fit / focus flags (footage.md); a portrait recording |
| 12 | Text doesn't hide the point | captions sit over empty areas, never over the face or the aha | position flags, shorter text |
| 13 | Payoff lands | the last caption (hook2, last step, payoff, CTA) is on screen ≥ 1.5 s | give earlier steps explicit timings; lengthen the last segment |
| 14 | No black or frozen frames | none, except where the screen is genuinely static | a clip ran out: a longer source, shorter segments |
| 15 | Audio | present, or silent on purpose | `--music`, a clip volume; for organic posts silent is fine if a sound is added in-app |
| 16 | Music ends cleanly | the tail fade ran; the track didn't stop early | earlier `--music-start` or a longer track |
| 17 | Format-specific | greenscreen: a clean cut-out (no halos or holes); talking head: words spelled right and in sync; before-after: matching framing; listicle: every badge and title readable | the template's SKILL.md knobs |
| 18 | Nothing private | no keys, emails, customer data, notifications | re-record or trim the source |
| 19 | Truthful | every claim on screen is backed by the brief | rewrite the line |

## Loop rules

- **At most 3 passes per reel.** Each pass changes one or two things, re-makes, and looks again.
- Input changes: `npx reelclaw make <template> --props reels/<name>.json --<flag> … --name <name> --draft`
  (same name replaces the reel; a new name keeps both).
- Hand edits to `reels/<name>.html`: `npx reelclaw check <name>`, `npx reelclaw render <name> --draft`,
  `npx reelclaw qa <name>`. Re-running `make` with the same name overwrites hand edits.
- Hook variants of a reel that already passed: check the hook frames (fit, line breaks, safe band)
  and the report; the footage didn't change.
- After 3 passes, deliver the best render and say exactly what is still off and why ("the reaction
  clip has burned-in text at 1–2 s; a different clip would fix it").
- Report to the user as a short list per reel: pass / fixed (what) / still off (what).
