# CI and quality gates

Every gate runs locally too. Generate the synthetic fixture media once with `npm run fixtures`.

| Gate | Local command | CI job | Fails when |
| --- | --- | --- | --- |
| Types | `npm run typecheck` | `check` (Node 22 + 24) | `tsc --noEmit` (checkJs) finds an error |
| Unit tests | `npm test` | `check` | a `node:test` fails (`packages/*/test`, `test/unit`) |
| Template validation | `npm run validate` | `templates` | manifest, SKILL.md frontmatter, README/example.json, or make (stage → prepare → build → compile → lint) fails |
| Integration | `npm run test:integration` | `templates` | example.json fails `hyperframes lint`, the compiled HTML isn't byte-identical across re-makes and projects, or the HTML loads from the network / uses clocks or randomness / embeds absolute paths |
| Registry | `npm run registry -- --check` | `templates` | `registry.json`, `.claude-plugin/marketplace.json` or the README gallery is stale: run `npm run registry` and commit |
| Smoke render | `npm run smoke -- <id> [<id> …]` | `smoke` | the draft render isn't 1080x1920 / 30fps / h264, its duration differs from the composition's by more than 0.15s, or it's silent while the composition has music or a clip with sound |

`REELCLAW_RENDER=1 npm run test:integration` also renders every example. `REELCLAW_TEMPLATES=a,b` limits it to those templates.

## Which templates CI renders

`scripts/changed-templates.mjs` plans the `smoke` matrix:

- **Pull requests and pushes** render the templates whose folders changed. Edits to `*.md` and `preview.*` files alone don't trigger a render.
- A change to anything every render depends on (`packages/reelclaw/src|bin`, `shared/`, the lockfile, `scripts/make-fixtures.mjs`, `scripts/smoke-render.mjs`, the workflow) renders **all** templates. On PRs this is thinned to an even sample of 24.
- The **nightly** run (03:23 UTC) and a manual run with an empty `templates` input render everything.
- Templates are grouped into shards of 8 per job, because an Actions matrix allows at most 256 jobs.

Each smoke job uploads `smoke-<template|shard-N>` with `<id>/<id>.mp4`, `<id>.html`, `frames.png`, `safe-zones.png` and `report.json`. The job summary has a table of results. In `safe-zones.png` the platform UI zones are shaded and the 720x1200 text band from RULES.md §4 is outlined in green. Check that every caption sits inside the band.

## Previews

```bash
reelclaw preview <id> [--frames 3] [--safe-zones] [--mp4] [--props my-inputs.json]
```

This renders the example at draft quality and writes these files into `templates/<id>/`:

- `preview.png`: a frame strip.
- `preview.gif`: at most 2 MB. The command steps the size and frame rate down until the GIF fits.
- `preview.mp4`: 540x960 with sound. Only with `--mp4`.

The full render goes to `renders/preview/<id>.mp4` and the safe-zone strip to `renders/preview/<id>-safe-zones.png`. Example fixtures are synthetic test patterns, so for a website-quality preview pass real (licensed) footage with `--props`.

## Linux runner notes

- Ubuntu 24.04 needs `ffmpeg`, `unzip` (to extract HyperFrames' managed chrome-headless-shell) and Chrome's shared libraries. The libraries use the `t64` package names on 24.04. `.github/workflows/ci.yml` lists them all.
- HyperFrames launches Chrome with `--no-sandbox`, so Ubuntu's AppArmor user-namespace restriction doesn't apply.
- `~/.cache/hyperframes` (Chrome and the matting models) is cached, keyed on `package-lock.json`.
- A draft render of an 8.9s reel takes about 40s with software GL.
- Fixture clips have a keyframe every second. HyperFrames warns about sparse keyframes and can freeze frames when they're missing.
