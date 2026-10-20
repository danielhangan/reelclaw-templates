# before-after

The **transformation reveal** from two photos or clips: a full-screen swipe from before to after (`--layout wipe`, default), or a labelled top/bottom split (`--layout split`, optionally with the after half swiped in after a beat). Hook and labels use TikTok's native text box. ~4–10s, 1080×1920 @ 30fps.

```
wipe:   [ before · "before" ] ──swipe──▶ [ after · "after" ]      hook on top (→ payoff after the swipe)
split:  [ before (top) ]  hook on the seam
        [ after (bottom) ]
```

## Install

```bash
npx reelclaw@latest add before-after      # Claude Code + Codex instructions included
```

Then ask your agent "make a before/after from before.jpg and after.mp4", or run it yourself:

```bash
npx reelclaw make before-after --before before.jpg --after after.mp4 \
  --hook "6 months of fixing my posture" --render
# → renders/before-after-1.mp4
```

## Flags

<!-- reelclaw:flags:start -->
| Flag | Default | Meaning |
| --- | --- | --- |
| `--before <file\|url>` | **required** | Before photo or clip |
| `--after <file\|url>` | **required** | After photo or clip |
| `--layout wipe\|split` | `wipe` | wipe: full-screen swipe from before to after; split: before on top, after below |
| `--hook "text"` | — | Hook text for the whole reel |
| `--payoff "text"` | — | Optional line that replaces the hook once the after is revealed |
| `--before-label "text"` | `before` | Label on the before (empty string hides it) |
| `--after-label "text"` | `after` | Label on the after (empty string hides it) |
| `--theme white\|dark\|black\|red\|yellow` | `white` | Text look for hook and labels: TikTok's native text box |
| `--before-secs <0.5..15s>` | — | How long the before shows alone (wipe, or split with --reveal); default 2s for a photo, up to 3s of a clip |
| `--after-secs <1..30s>` | — | How long the after holds once revealed (split without --reveal: the reel length); default 3–8s from the media |
| `--wipe-secs <0.2..3s>` | `0.7` | Length of the swipe |
| `--direction right\|left\|down\|up` | `right` | Which way the swipe travels |
| `--reveal` | `false` | split: keep the after half dark, then swipe it in after --before-secs |
| `--focus-x <0..100%>` | `50` | Horizontal focus kept in frame when footage is cropped |
| `--focus-y <0..100%>` | `45` | Vertical focus kept in frame (split halves crop a lot: lower = keep the top) |
| `--music <file\|url>` | — | Background music (fades out over the last 0.8s) |
| `--music-volume <0..1>` | `1` | Music level |
| `--music-start <secs>` | `0` | Offset into the music (start on the drop) |
| `--before-volume <0..1>` | `0` | Before clip's own sound (muted by default) |
| `--after-volume <0..1>` | `0` | After clip's own sound (muted by default) |
<!-- reelclaw:flags:end -->

Plus the flags every template takes: `--props file.json`, `--name`, `--render`, `--draft`, `--quality`, `--workers` (`npx reelclaw make --help`).

## Examples

Split comparison of two app screens, the after swiped in after 1.2s:

```bash
npx reelclaw make before-after --before old-ui.png --after new-ui.png \
  --layout split --reveal --before-secs 1.2 --hook "redesigned our app in 2 weeks" --render
```

Room makeover, slower top-to-bottom swipe, payoff line, music:

```bash
npx reelclaw make before-after --before room-before.mp4 --after room-after.mp4 \
  --direction down --wipe-secs 1.2 --hook "my \$200 bedroom makeover" --payoff "the lamp did all the work" \
  --music track.mp3 --music-start 8 --render
```

## Notes

- Timing: `--before-secs` (before alone) → `--wipe-secs` → `--after-secs` (hold). Defaults come from the media: ~2s on a photo / up to 3s of a clip before, 3–8s after. A plain split is one hold of `--after-secs`.
- Photos slowly push in (1 → 1.06); the after starts its push-in only once the swipe ends, so the swipe edge stays exact. Clips shorter than their slot loop.
- Clip sound is muted by default (`--before-volume` / `--after-volume`), RULES.md §6.
- All text sits inside the safe band (RULES.md §4); in split layout the hook straddles the seam on purpose (y 810–1110, still inside the band).
- Need footage? Use your own, or browse real-creator UGC at [dansugc.com](https://dansugc.com) (optional).
