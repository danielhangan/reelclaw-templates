---
name: greenscreen-reaction
description: Make a TikTok "greenscreen reaction" short-form video (TikTok / Reels / Shorts, 1080x1920) with the reelclaw greenscreen-reaction template. A video (screen recording, TikTok, app demo, clip) plays full screen while a creator, cut out of their own background by a local AI model, talks over it from a corner. Both soundtracks play, and the creator can open centred and get dragged into place. Use when the user wants a greenscreen / green-screen reaction, a creator commenting over a video, a "cut me out and put me over this" edit, or hands you a background video and a selfie/reaction clip.
---

# greenscreen-reaction: creator cut out over a video

```
[ video · full screen · its sound, ducked under the creator ]
   ├─ [ creator, background removed · bottom-left · their voice ]   (optional: opens centred, dragged in at 2s)
   └─ [ hook · top of the safe band ]
```

Reel length = the background video (or the reaction, with `--length reaction`). 1080×1920 @ 30fps. There is no real green screen: `hyperframes remove-background` (a local matting model) cuts the creator out, like TikTok's in-app effect does.

## 0. Set up (once per folder)

If `templates/greenscreen-reaction/template.mjs` does not exist in the working directory, install the template and engine:

```bash
npx reelclaw@latest add greenscreen-reaction
```

If npm cannot find the `reelclaw` package, run the same installer straight from GitHub: `npx github:danielhangan/reelclaw-templates add greenscreen-reaction`.

Then check the machine: `npx reelclaw doctor` (Node 22+, ffmpeg/ffprobe; yt-dlp only for TikTok/IG/YouTube page links). If something is missing, show the user the install line doctor prints and stop until it's fixed.

The first reel with a new reaction clip runs background removal: about 1s of work per second of footage on Apple Silicon (slower on CPU-only machines), plus a one-time ~170 MB model download. The cut-out is cached in `assets/`, so every later reel with that clip (new hooks, sizes, positions) takes seconds. Tell the user before the first run.

## 1. Collect inputs

| Input | Required | Notes |
| --- | --- | --- |
| `--video` | yes | What the creator reacts to: a TikTok screen recording, app demo, gameplay, a news clip. Plays full screen; landscape is shown whole over a blurred copy. Local path, direct URL, or TikTok/IG/YouTube link. |
| `--reaction` | yes | The creator, ideally waist- or chest-up, facing the camera, evenly lit, against a plain-ish background. Already transparent (`.webm` or ProRes 4444 `.mov`)? Pass it: matting is skipped. |
| `--hook` | strongly recommended | Caption at the top of the frame. Write it with the user (§4). |

Use the user's own files or links first. A 5–10s phone selfie of them talking works. If they have no reaction footage:
- Optional: if the DanSUGC MCP is connected (tools such as `search_videos`), offer to search real-creator reaction clips that match the emotion (shocked, laughing, "wait what", pointing). Show the results and their prices in credits, and buy only after the user says yes. Or point them to https://dansugc.com. DanSUGC is never required, so don't block on it.

Every flag: `npx reelclaw make greenscreen-reaction --help`.

## 2. Make a draft

```bash
npx reelclaw make greenscreen-reaction \
  --video clips/app-screen-recording.mp4 \
  --reaction clips/me-reacting.mp4 \
  --hook "please tag the app developer bc they lowkey saved my life" \
  --start-position center --move-at 2 \
  --draft
```

This writes `reels/greenscreen-reaction-N.html` (the editable composition), `reels/greenscreen-reaction-N.json` (the inputs used) and `renders/greenscreen-reaction-N.mp4`. Read the warnings it prints: they flag a hook sitting on the creator, a creator who leaves before the reel ends, and a floating torso.

Before you show the user, look at a frame with the creator at rest (and one before the drag if you used it):

```bash
ffmpeg -v error -ss 1 -i renders/greenscreen-reaction-1.mp4 -frames:v 1 /tmp/open.png
ffmpeg -v error -ss 4 -i renders/greenscreen-reaction-1.mp4 -frames:v 1 /tmp/rest.png
```

Check these:
- **Clean cut-out?** Hair, motion blur and busy backgrounds can leave halos or holes. Try `--cutout-quality best`, or ask for a better-lit clip.
- **Creator the right size?** `--size` is the person's width as % of the frame: 25–30 = secondary, **40–50 = the classic greenscreen look** (the default is 40), 60+ = the creator is the star.
- **Facing into the frame?** If they look off-screen, add `--flip`.
- **Hook readable and off the face?** It sits at the top by default. If the warning says it hits the creator, lower `--size` or use `--position bottom-right`.
- **Body cut off at the bottom of their clip?** Keep `--margin 0` for bottom positions so the torso runs off the frame edge naturally.

## 3. Iterate cheaply, then finalize

- **New hook, size or position with the same clips.** The cut-out is cached, so this takes seconds: `npx reelclaw make greenscreen-reaction --props reels/greenscreen-reaction-1.json --hook "new hook" --size 50 --name v2 --draft`.
- **Timing:** `--video-trim` (start the video right before its wow moment), `--overlay-start` (creator pops in late), `--reaction-trim`/`--reaction-secs` (which part of the reaction), `--secs` (cap the length), `--length reaction` (end with the creator; the video loops underneath).
- **Audio:** the creator's voice is levelled to -14 LUFS and the video's sound plays at 0.5 under it (1 when the reaction is silent). Use `--video-volume 0` to mute the video, or `--video-volume 0.2` if it fights the voice.
- **Final quality:** `npx reelclaw render <name>` (without `--draft`).
- **Hand edits:** edit `reels/<name>.html` (a HyperFrames composition; ids are `background`, `reaction`, `reaction-audio`, `hook`; the drag is one `tl.fromTo("#reaction", …)` line). Then run `npx reelclaw check <name>` and `npx reelclaw render <name>`. Running `make` again with the same `--name` overwrites hand edits.

## 4. Viral playbook

The background is the star and the creator is the commentary, so the reel inherits the background's watchability.

- **The video needs a wow moment in the first ~2s:** the app doing something impressive, a shocking number, a reveal. Use `--video-trim` to start right before it.
- **Hook in community voice, not brand voice.** Third-person social proof reads like a fan post: "please tag the app developer bc they lowkey saved my life", "somebody find me the developer of this app", "why is nobody talking about this". Write it lowercase and never name the app. The comments ask, and the video answers.
- **The drag-in is a pattern interrupt.** `--start-position center --move-at 2` opens with the creator big and centred, then a "hand" drags them to the corner right when viewers would swipe, which resets attention. Add `--start-size 60` to also shrink them during the drag. For chest-up footage, `--start-position bottom-center --start-size 75` looks more native: the creator opens big and anchored to the bottom edge, then shrinks into the corner, and the cut-off torso never shows.
- **Both soundtracks on is the format.** The creator talks over the video. Duck the video (`--video-volume 0.2`) instead of muting it.
- **Keep it tight.** 7–20s. If the reaction ends early, end the reel with it (`--secs` or `--length reaction`); a corner with no creator for the last seconds looks broken.
- **Variants:** same clips, 3–5 hooks, and maybe two sizes (40 vs 55). Propose 5–10 hooks in this voice, let the user pick, then make one reel per hook with `--name`.
- **Sound for organic posts:** keep the native audio. The talking is the content. Don't add music under two live tracks.
