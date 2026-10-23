# Reel project (reelclaw)

This folder makes short-form videos (TikTok / Reels / Shorts, 1080×1920 @ 30fps) from templates with the [reelclaw](https://github.com/danielhangan/reelclaw-templates) engine. You (the agent) run the commands; the user brings footage, hooks and taste.

## Start here: the playbook

{{PLAYBOOK}}

## Installed templates

{{TEMPLATES}}

Before making a reel with a template, **read its SKILL.md**: inputs to collect, the exact command, and what makes that format work. More templates: `npx reelclaw@latest add --list`, then `npx reelclaw@latest add <template>`.

## Workflow

1. `npx reelclaw doctor` once. If a required tool is missing, show the user the install line it prints and stop until it is fixed.
2. Plan with the playbook: brief, format, hooks. Collect the inputs from the template's SKILL.md, the user's own footage first (see **Footage**). `npx reelclaw make <template> --help` lists every flag.
3. Draft: `npx reelclaw make <template> --<input> <value> … --draft` writes `reels/<name>.html` (composition), `reels/<name>.json` (inputs used) and `renders/<name>.mp4`, then runs `npx reelclaw qa <name>`.
4. Look before you show it: open every frame image `qa` lists and go through the playbook's QA checklist (text readable, inside the safe area, off the face; no black, frozen or silent surprises). Max 3 fix passes.
5. Iterate cheaply (media is cached): `npx reelclaw make <template> --props reels/<name>.json --hook "…" --name <new-name> --draft`.
6. Variants (one reel per hook, etc.): write `rows.json` as `[{ "name": "hook-b", "hook": "…" }, …]` and run `npx reelclaw batch <template> rows.json --props reels/<name>.json --draft`.
7. Final quality: `npx reelclaw render <name>` → `renders/<name>.mp4`, then `npx reelclaw qa <name>`.

**Hand edits.** `reels/<name>.html` is a plain HyperFrames composition (semantic element ids, one GSAP timeline). Edit it, run `npx reelclaw check <name>`, then `npx reelclaw render <name>`. Running `make` again with the same `--name` overwrites hand edits, so use a new name.

**Changing a template.** Edit `templates/<id>/template.mjs` ([template API](https://github.com/danielhangan/reelclaw-templates/blob/main/docs/TEMPLATE_API.md)). `npx reelclaw@latest add <id>` updates templates you have not edited and keeps the ones you have (`--force` replaces them).

## Footage (with or without DansUGC)

- **Default: the user's own media.** Inputs take local paths, direct file URLs, or links to the user's own TikTok / Instagram / YouTube / X posts (needs yt-dlp). Files are copied into `assets/` under content-hashed names; originals are never touched. Only use footage the user has the rights to; never pull someone else's post as footage.
- **Optional: DansUGC** ([dansugc.com](https://dansugc.com)) sells real-creator UGC clips (reaction hooks, typing shots, intros). Only if its MCP tools are available (for example `search_videos`) or the user wants creator footage: follow the playbook's `references/dansugc.md` (prices in credits, quote first, buy only after an explicit yes). To connect it: `claude mcp add --transport http dansugc {{DANSUGC_MCP}}` (Claude Code) or `codex mcp add dansugc --url {{DANSUGC_MCP}}` then `codex mcp login dansugc` (Codex).
- Never block on DansUGC. A 3-second phone selfie is a fine reaction clip.

## House rules

- Text stays inside the safe band (x {{SAFE_X}}, y {{SAFE_Y}} on the 1080×1920 canvas); the engine warns when it does not. Font: TikTok Sans (bundled).
- Captions are static by default. Hooks are lowercase, first-person, specific and truthful, and never name the product (the demo answers "what app??").
- Clip audio is muted unless the format needs it. For organic posts, render without `--music` and add a trending sound in the TikTok / Instagram app.
- Never deliver a render you have not looked at. Never spend the user's money or credits without an explicit yes.

## Files

| Path | What |
| --- | --- |
| `templates/<id>/` | installed templates (`template.mjs`, `SKILL.md`, `README.md`, `example.json`), editable |
| `.claude/skills/`, `.agents/skills/` | copies of each `templates/<id>/SKILL.md`, plus the shared `reelclaw-playbook` skill, for Claude Code and Codex (refreshed by `add`) |
| `assets/` | staged media, font, GSAP (gitignored) |
| `reels/` | generated compositions + the inputs that made them |
| `renders/` | MP4 output (gitignored) |
| `.reelclaw/` | caches, safe to delete |
