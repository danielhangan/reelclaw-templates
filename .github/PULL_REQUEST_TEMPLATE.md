<!--
Template PRs: fill every section. Engine / docs PRs: describe the change and delete the template sections.
Agents: .claude/skills/new-template/SKILL.md (Codex: .agents/skills/new-template/SKILL.md) walks you through this.
-->

## Template

- **id:** `<id>`
- **Reference:** <link to the viral video — link only, never upload the video or its frames>
- **Category / tags:** `<category>` · `tag`, `tag`

## The format

<!-- Structure beat by beat with timings, pacing, text style, audio, and why it works (the retention mechanic). -->

## Inputs → format

<!-- Which parts are inputs (footage, text, lengths) and which are fixed by the format. -->

| Input | Drives |
| --- | --- |
| `--…` | … |

## Comparison with the reference

<!-- Output of `npx reelclaw analyze renders/<name>.mp4 --compare analysis/<slug>`: pacing notes, and what still differs and why. Don't attach compare.png (it contains frames of the reference). -->

## Checklist

- [ ] `npx reelclaw validate <id> --render` passes
- [ ] `npm run typecheck` and `npm test` pass
- [ ] `npm run registry` run and `registry.json`, `.claude-plugin/marketplace.json` and `README.md` (gallery) committed
- [ ] `grep -rn TODO templates/<id>/` prints nothing
- [ ] Rendered and compared against the reference; cut times / layout / text placement match
- [ ] Works with portrait and landscape footage, with and without sound; bad inputs fail with a fix
- [ ] Text inside the safe band (checked with `npx reelclaw preview <id> --safe-zones`), or `unsafe: true` explained in the README
- [ ] Clip audio muted by default (or the README says why the format needs it)
- [ ] `template.mjs` imports only `"reelclaw"`, `node:` built-ins and its own files; `build()` is pure
- [ ] SKILL.md: `name` = id, description says what + when, bootstrap with `npx reelclaw@latest add <id>`, viral playbook; DanSUGC optional, never required
- [ ] `example.json` exercises the optional inputs; example text is original, not copied from the reference
- [ ] Nothing from the reference committed: no video, frames, audio, logos or verbatim captions; `preview.*` rendered from fixtures / own footage and < 2MB
- [ ] New core primitive (if any): new file under `packages/reelclaw/src/core/components/`, unit test, line in `docs/TEMPLATE_API.md`
