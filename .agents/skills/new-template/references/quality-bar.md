# Quality bar for a template PR

What reviewers (and CI) check. CONTRIBUTING.md links here.

## Must

- **Recognisable format.** Side by side (`reelclaw analyze render.mp4 --compare analysis/<slug>`) a viewer would say "that's the same format": cut times within ~0.2s where the format fixes them, same layout, same text placement and style.
- **Works with any sensible footage.** Portrait, landscape, short, long, with and without sound. Impossible inputs fail with `fail(message, hint)` naming the fix. `example.json` exercises the optional inputs.
- **House rules (RULES.md).** TikTok Sans; text inside the safe band (or `unsafe: true` + a README note on why); static captions by default; clip audio muted unless the format needs it; 1080×1920 @ 30fps.
- **Engine API only.** `template.mjs` imports `"reelclaw"`, `node:` built-ins and its own files. `build()` is pure; async work lives in `prepare()` and is cached with `media.derive`. No `Math.random`, clocks or network at render time.
- **Small.** 40–150 lines of `template.mjs`. A reusable primitive goes into core (new file under `packages/reelclaw/src/core/components/` + unit test + docs), not into the template.
- **Docs agents can act on.** SKILL.md frontmatter `name` = id, `description` says what it makes and when to use it; the body bootstraps with `npx reelclaw@latest add <id>`, lists inputs, gives the exact make command and a viral playbook. DanSUGC is optional, never required. README has the generated flags table.
- **Green.** `npm run typecheck`, `npm test`, `npx reelclaw validate <id> --render`, `npm run registry` committed, no `TODO` left in `templates/<id>/`.
- **Clean rights.** The reference is a link in `source.url` and the PR body. No reference video, frames, audio, logos or verbatim captions committed. `preview.*` is rendered from fixtures or footage the contributor owns, and is small (< 2MB).

## Should

- Inputs named after what they hold (`reaction`, `demo`, `steps`), not `shot1`.
- Defaults that make a good reel with only the required inputs.
- Elements have semantic ids (`hook`, `demo`, `payoff`) so agents can hand-edit `reels/<name>.html`.
- A playbook with 3+ example hooks in the format's voice and what to vary between variants.

## Review criteria, in order

1. Is it a distinct, proven format (not a near-duplicate of an existing template)?
2. Does the render match the reference's structure?
3. Is the template robust to real footage and readable to the next contributor?
4. Are the docs enough for an agent to make a reel without reading the code?
