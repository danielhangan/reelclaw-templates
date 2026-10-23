# Music: when to bake a sound in, and which one

## First decide: organic or ad?

| Where it runs | Do this |
| --- | --- |
| **Organic post** from a personal / creator account | Usually render **without** `--music` and add a trending sound in the TikTok / Instagram app when posting. In-app sounds are licensed for organic use and feed the algorithm (the sound page sends viewers). |
| **Organic post** from a TikTok **business** account | Treat it like an ad: business accounts are limited to the Commercial Music Library, even organically. |
| **Paid ad** (Spark Ads, Meta ads, anything boosted) | Only Commercial Music Library tracks (or music the user licensed). Render without music and add the track in Ads Manager, or bake in a track the user confirms is cleared. |
| Reposting the same file across platforms, or the user wants a finished file | Bake `--music` in with a track the user has the rights to. |

Never tell the user a sound is "cleared for ads"; you can't know. A metadata flag saying a track is
commercial is a hint, not a license: the user confirms the exact track in their ads tool.

Some formats carry their own sound: `greenscreen-reaction` plays both the video and the creator (no
music flag, by design), and `talking-head-captions` keeps the voice on top with music at 12%.
`no-yapping` is silent on purpose (`--typing-volume 0.5` for keyboard ASMR is the one native sound
that fits).

## Choosing a sound

1. **Match the hook's energy.** Shocked / hype / "wait what" → punchy, upbeat, fast. Relatable /
   emotional / "pov: you finally…" → mellow, lo-fi, nostalgic. Funny → meme sounds. Listen before you
   pick.
2. **Rising beats huge.** A sound climbing in the niche beats a giant generic one.
3. **Long enough.** The track (from `--music-start`) must outlast the reel, or it ends early.
4. **Vary it across variants.** 2–3 different sounds across a set doubles as a sound test.
5. Tell the user what you picked, one line each (title · artist · why).

Where trending sounds come from: the user (a file they have, or a sound they name), TikTok's Creative
Center or the in-app sound pages for browsing, or, if the DansUGC MCP is connected, its trending-music
lookup for the niche ([dansugc.md](dansugc.md#trending-music)).

## Using a track

```bash
npx reelclaw make <template> … --music footage/track.m4a --music-start 12.5 --music-volume 0.8
```

- `--music` takes a local file or a direct audio URL. Download first when the URL has no file
  extension or may expire, and check its length:
  `ffprobe -v error -show_entries format=duration -of csv=p=0 footage/track.m4a`.
- `--music-start` skips the intro and starts on the drop; `--music-volume` sets the level (0.6–0.8
  under silent footage, 0.1–0.2 under a voice).
- The music fades out over the last 0.8 s automatically; QA checks that the tail fade happened.
- `listicle` and `wall-of-text` snap their cuts to the music's beats (`--beat-sync`, on by default):
  pick a track with a clear beat and start it on the drop.
- A TikTok sound **page** link is not an audio file and won't work as `--music`. Use it only to show
  the user the sound in the app.
- Clip audio is muted by default in most templates; raise `--<clip>-volume` only when the clip's own
  sound is part of the format.
