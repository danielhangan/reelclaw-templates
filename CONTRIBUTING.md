# Contributing

reelclaw-templates grows by turning viral short-form videos into templates anyone can reuse with one line. Most templates come from contributors who paste a link into Claude Code or Codex. This guide covers that flow, the manual one, and what reviewers look for.

## The one-command flow (Claude Code or Codex)

```bash
gh repo fork danielhangan/reelclaw-templates --clone && cd reelclaw-templates
npm install && npm run fixtures
claude          # or: codex
```

Then say:

> make a template from https://www.tiktok.com/@creator/video/7301234567890123456

The repo ships a `new-template` skill (`.claude/skills/new-template/` for Claude Code, `.agents/skills/new-template/` for Codex). The agent analyzes the video, shows you the format it found and asks before building. It then scaffolds, implements and renders the template, compares the render with the reference frame by frame, validates, and opens the PR with `gh`. You review the description and the render, and confirm before anything is pushed.

No time to build it? [Open a template request](https://github.com/danielhangan/reelclaw-templates/issues/new?template=template-request.yml) with the link.

## By hand

Every step the skill runs is a plain CLI command:

```bash
npx reelclaw analyze "<link>" --beats        # → analysis/<slug>/: analysis.json, contact-sheet.png, filmstrip.png
#   look at the images, fill the "format" block in analysis.json
npx reelclaw scaffold <id> --from analysis/<slug>   # → templates/<id>/ (template.mjs, SKILL.md, README.md, example.json)
#   implement the format in templates/<id>/template.mjs (docs/TEMPLATE_API.md)
npx reelclaw make <id> --props templates/<id>/example.json --name check --draft --workers 2
npx reelclaw analyze renders/check.mp4 --compare analysis/<slug>   # → compare.png + pacing differences
npx reelclaw preview <id> --safe-zones       # → preview.png / preview.gif, safe-zone overlay
npx reelclaw docs <id> --write               # refresh the README flags table
npx reelclaw validate <id> --render
npm run typecheck && npm test && npm run registry
```

`npx reelclaw` runs this checkout's engine after `npm install`. A blank skeleton without a reference: `npx reelclaw scaffold <id>`.

What each step means, how to read a reference, and how to map what you see to engine primitives is all in [`.claude/skills/new-template/SKILL.md`](.claude/skills/new-template/SKILL.md). It is written for agents but reads fine for people.

## Rules that keep the library healthy

- **Link only.** Never commit a reference video, its frames, audio, logos or captions. `analysis/` is git-ignored for that reason. Templates recreate a format, not a video.
- **One template per PR**, on a branch named `template/<id>`.
- **ids are kebab-case** and name the format (`pov-app-reveal`), never a creator, brand or song. The id is the folder name, the template id and the Agent Skills name.
- **Templates use the engine API only.** `template.mjs` imports `"reelclaw"`. If you need a new primitive, add it to core as a new module with a unit test and a line in `docs/TEMPLATE_API.md`.
- **Footage is the user's.** Templates and skills work with the user's own files and links. DansUGC (dansugc.com, or its MCP) may be offered as an optional source of creator footage. It is never required.
- **House rules** in [RULES.md](RULES.md): TikTok Sans, text inside the safe band, static captions, clip audio muted by default, 1080×1920 @ 30fps.

## PR checklist

The [PR template](.github/PULL_REQUEST_TEMPLATE.md) has the full list. In short:

- [ ] `npx reelclaw validate <id> --render`, `npm run typecheck`, `npm test` pass
- [ ] `npm run registry` run; `registry.json`, `.claude-plugin/marketplace.json` and the `README.md` gallery committed
- [ ] no `TODO` left in `templates/<id>/`
- [ ] rendered and compared with the reference (`analyze --compare`); differences explained in the PR
- [ ] safe zones checked (`preview --safe-zones`); small `preview.*` from fixtures or your own footage
- [ ] SKILL.md tells an agent what it makes, when to use it, the inputs, the exact command, and what makes the format work; generic advice (hooks, footage, music, QA, variants, DansUGC) points to the shared [`playbook/`](playbook/SKILL.md) instead of being copied
- [ ] nothing from the reference committed

## Review criteria

1. **Distinct, proven format**, not a near-duplicate. Extending an existing template with an option is often the better PR.
2. **Faithful structure**: cut times, layout, text placement and style match the reference.
3. **Robust and readable**: works with real footage of any sensible length and orientation; 40–150 lines; good input names and defaults.
4. **Agent-ready docs**: an agent can make a good reel from SKILL.md alone.

Details: [quality bar](.claude/skills/new-template/references/quality-bar.md).

CI (`.github/workflows/ci.yml`) typechecks, unit-tests, validates every template, checks `registry.json` is fresh, and draft-renders the templates your PR touches. Rendered MP4s and frame strips are uploaded as artifacts for review.

## Engine changes

`packages/reelclaw/` is plain ESM JavaScript with JSDoc types (`// @ts-check`) and no build step. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Commands live one per file in `src/cli/commands/` and are discovered automatically. Add `node:test` tests for non-trivial logic and run `npm run check` before opening the PR. Keep the Codex copy of the skill in sync: `.agents/skills/new-template/` must match `.claude/skills/new-template/` (a unit test checks this).
