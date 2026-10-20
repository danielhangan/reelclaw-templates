# reelclaw-templates (legacy name)

This package is now **[`reelclaw`](https://www.npmjs.com/package/reelclaw)**. It stays published so old links keep working, and forwards everything to `reelclaw add`:

```bash
npx reelclaw-templates@latest                   # = npx reelclaw@latest add              (picker)
npx reelclaw-templates@latest reaction-demo     # = npx reelclaw@latest add reaction-demo --dir reaction-demo
npx reelclaw-templates@latest --list            # = npx reelclaw@latest add --list
```

Use the new command directly:

```bash
npx reelclaw@latest add reaction-demo
```

It sets up a reel project for Claude Code and Codex (templates, `AGENTS.md`, `CLAUDE.md`, skills, the engine) in the current folder. Requires Node 22+ and ffmpeg.

Templates, docs and install one-liners: https://github.com/danielhangan/reelclaw-templates (see `docs/INSTALL.md`).
