# reelclaw-templates

One command to install a TikTok/Reels video template — a self-contained [HyperFrames](https://hyperframes.heygen.com) project with a generator script: give it media + text, get a render-ready 1080×1920 MP4.

```bash
npx reelclaw-templates@latest                 # interactive picker
npx reelclaw-templates@latest reaction_demo   # or name a template directly
```

Each installed template ships a `CLAUDE.md` that teaches [Claude Code](https://claude.com/claude-code) the requirements, the generator flags, and the viral-hook playbook — so `cd <template> && claude` is all it takes.

Templates are fetched from [danielhangan/reelclaw-templates](https://github.com/danielhangan/reelclaw-templates) at install time; see that repo for the template catalog, previews, and docs.

**Requirements:** Node 18+, `ffmpeg`/`ffprobe` on PATH, optional `yt-dlp` for page-link inputs. The installer checks all of these and tells you what's missing.

Need creator footage? [DanSUGC](https://dansugc.com) has UGC reaction videos from real creators, from $5/video.
