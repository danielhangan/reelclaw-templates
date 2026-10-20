# Install: one line, Claude Code or Codex, with or without DanSUGC

Copy-paste install commands for the website, the README and template pages. Replace `reaction-demo` with any template id (`registry.json` → `templates[].id`).

## The one-liner (per template)

```bash
npx reelclaw@latest add reaction-demo --dir my-reels && cd my-reels && claude
```

```bash
npx reelclaw@latest add reaction-demo --dir my-reels && cd my-reels && codex
```

This creates `my-reels/` as a reel project with the template, the engine, and instructions for **both** Claude Code (`CLAUDE.md`, `.claude/skills/`) and Codex (`AGENTS.md`, `.agents/skills/`), checks the machine (`doctor`), and opens the agent. Then ask:

> make a reaction-demo reel with my footage: ~/Downloads/react.mp4 and demo.mov

Without `--dir`, it installs into the current folder. Running it again in the same folder adds more templates:

```bash
npx reelclaw@latest add no-yapping
```

## All the ways in

| Want | Command |
| --- | --- |
| One template, current folder | `npx reelclaw@latest add reaction-demo` |
| Several templates | `npx reelclaw@latest add reaction-demo no-yapping` |
| Pick from the catalog | `npx reelclaw@latest add` |
| Every template | `npx reelclaw@latest add --all` |
| See the catalog | `npx reelclaw@latest add --list` |
| Before the npm package is published (straight from GitHub) | `npx github:danielhangan/reelclaw-templates add reaction-demo` |
| Just the skill (Agent Skills CLI, any agent) | `npx skills add danielhangan/reelclaw-templates --skill reaction-demo` |
| Every template skill for Claude Code + Codex | `npx skills add danielhangan/reelclaw-templates --skill '*' -a claude-code -a codex` |
| Claude Code plugin (all template skills, every folder) | `claude plugin marketplace add danielhangan/reelclaw-templates && claude plugin install reelclaw-templates@reelclaw-templates` |
| Old command (still works) | `npx reelclaw-templates@latest reaction-demo` |

**Skill-only installs** (`npx skills add …`, the Claude Code plugin) put the template's `SKILL.md` where the agent finds it. The first time the agent uses it, the skill runs `npx reelclaw@latest add <id>` to set up the engine in the current folder. So "install the skill, then ask for a reel" also works in one step.

**Paste into the agent.** The same thing works as a prompt in Claude Code or Codex, which suits people who never open a terminal:

> Run `npx reelclaw@latest add reaction-demo` here, then make me a reaction-demo reel.

## With or without DanSUGC

**Without DanSUGC (default).** Nothing else to install. Templates take the user's own clips: local files, direct file URLs, or TikTok / Instagram / YouTube / X links (with `yt-dlp`). A 3-second phone selfie is a fine reaction clip.

**With DanSUGC (optional).** [DanSUGC](https://dansugc.com) sells real-creator UGC clips (reaction hooks, typing shots, intros). Connect its MCP server once and the agent can search clips that match a hook:

```bash
claude mcp add --transport http dansugc https://dansugc.com/mcp     # Claude Code
codex mcp add dansugc --url https://dansugc.com/mcp                 # Codex
```

Then ask: *"find a shocked reaction clip on DanSUGC for this hook and make the reel"*. The agent shows prices in credits and buys only after an explicit yes. Or download clips from dansugc.com and pass the files like any other footage.

Website copy, per template card:

```text
Install:      npx reelclaw@latest add reaction-demo --dir my-reels && cd my-reels && claude
Use Codex:    swap `claude` for `codex`
Footage:      your own clips, or real-creator UGC from DanSUGC (optional)
```

## Requirements

- **Node.js 22+** (the HyperFrames renderer needs it)
- **ffmpeg** (includes ffprobe): `brew install ffmpeg` · `sudo apt install ffmpeg` · `winget install ffmpeg`
- optional **yt-dlp** for page links: `brew install yt-dlp`
- headless Chrome is downloaded by HyperFrames on the first render

`add` runs `reelclaw doctor` at the end and prints the exact install line for anything missing.

## What `add` creates

```text
my-reels/
  templates/<id>/          template.mjs, SKILL.md, README.md, example.json (yours to edit)
  AGENTS.md                instructions for Codex and other agents (generated block + your notes)
  CLAUDE.md                imports AGENTS.md for Claude Code
  .claude/skills/<id>/     the template's SKILL.md for Claude Code
  .agents/skills/<id>/     the template's SKILL.md for Codex
  package.json             "reelclaw" dependency + which templates were installed from where
  node_modules/            the engine (npm install), so `npx reelclaw …` runs locally
  assets/  reels/  renders/  .reelclaw/
```

Re-running `add` is safe. It updates templates you have not edited, keeps the ones you have (`--force` replaces them), and refreshes the generated block in `AGENTS.md` / `CLAUDE.md` without touching text outside it. `--no-install` skips `npm install`.

## How it stays fresh

`add` reads [`registry.json`](../registry.json) from GitHub `main` at run time and downloads each template's files. A template merged into `main` is installable within minutes, with no npm release. Options for testing:

```bash
npx reelclaw add my-template --ref my-branch                             # a branch, tag or commit
npx reelclaw add my-template --repo me/reelclaw-templates --ref my-branch  # a fork (PR preview)
npx reelclaw add my-template --src ~/code/reelclaw-templates             # a local checkout
```

If GitHub is unreachable, `npx github:…` installs fall back to the templates bundled in that snapshot.

## For the website: registry.json

`https://raw.githubusercontent.com/danielhangan/reelclaw-templates/main/registry.json` has one entry per template:

| Field | Use |
| --- | --- |
| `id`, `name`, `description`, `category`, `tags` | card text, filters, search |
| `install.reelclaw` / `install.github` / `install.skills` | the three copy buttons |
| `inputs[]` (`flag`, `kind`, `required`, `default`, `options`, `description`) | "what you need" list, form builders |
| `media` | which inputs are footage (show "bring your own, or DanSUGC") |
| `preview.gif` / `preview.mp4` | raw URLs, when the template has a preview |
| `source.url` | the viral video it recreates |

```js
const { templates } = await (await fetch("https://raw.githubusercontent.com/danielhangan/reelclaw-templates/main/registry.json")).json();
for (const t of templates) render(card({ title: t.name, text: t.description, install: `${t.install.reelclaw} --dir my-reels && cd my-reels && claude` }));
```

## Maintainers

- Regenerate the catalog after adding or changing a template: `npm run registry` (writes `registry.json`, `.claude-plugin/marketplace.json` and the template gallery in `README.md`). CI: `npm run registry -- --check`.
- `.claude-plugin/marketplace.json` makes the repo a Claude Code plugin marketplace **and** tells `npx skills` where the template skills are (they live in `templates/`, outside its default search folders). Without it, any `.claude/skills/` folder in the repo would hide every template skill from `npx skills add`.
- Publishing order: `npm publish -w reelclaw` (its `prepack` copies `shared/fonts`), then `cd cli && npm publish` (`reelclaw-templates`, the legacy alias, depends on `reelclaw`).
