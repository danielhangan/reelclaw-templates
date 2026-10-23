// @ts-check
/**
 * `reelclaw scaffold` as a library: analysis.json (or nothing) → a working
 * templates/<id>/ skeleton — template.mjs, SKILL.md, README.md, example.json.
 *
 * Two pure steps, so both are unit-tested: planTemplate() decides inputs and
 * clips from the analysis; render*() print the files. The skeleton validates
 * and renders as-is; the author then turns measured timings into format logic.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { ReelclawError } from "../core/errors.mjs";
import { flagName, flagsTable } from "../core/inputs.mjs";
import { loadTemplate } from "../core/loader.mjs";
import { CATEGORIES, RESERVED_FLAGS } from "../core/template.mjs";
import { FLAGS_END, FLAGS_START, replaceBlock } from "../cli/commands/docs.mjs";

/** @typedef {import('./analysis.mjs').Analysis} Analysis */

/**
 * @typedef {object} Footage   a video input
 * @property {string} key
 * @property {string} description
 * @property {string} fixture   example.json value (scripts/make-fixtures.mjs output)
 */
/**
 * @typedef {object} PlannedShot
 * @property {string} id
 * @property {string} input   Footage key
 * @property {number} start
 * @property {number} duration
 * @property {number} trim    seconds into the footage (> 0 when an earlier shot used the same footage)
 */
/**
 * @typedef {object} PlannedText
 * @property {string} key
 * @property {string} id
 * @property {string} text      example / reference text ("" = unknown)
 * @property {number} start
 * @property {number} duration
 * @property {'top'|'center'|'bottom'} position
 * @property {boolean} required
 */
/**
 * @typedef {object} Plan
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} category
 * @property {string[]} tags
 * @property {{ url?: string, notes?: string }} source
 * @property {Footage[]} footage
 * @property {PlannedShot[]} shots
 * @property {boolean} montage   footage is one list input (`clips`) cycled over the shots
 * @property {PlannedText[]} texts
 * @property {string} captionStyle
 * @property {string[]} header   lines for the template's top comment
 * @property {{ structure?: string, whyItWorks?: string }} notes
 */

/** More shots than this without roles → one `clips` list instead of one input per shot. */
export const MONTAGE_SHOTS = 6;
const ID_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const TEMPLATE_KEYS = ["captionStyle", "music", "musicVolume", "clips"];
const TODO_DESCRIPTION = "TODO: one or two sentences — what this format is and when it works.";

const r2 = (/** @type {number} */ n) => Math.round(n * 100) / 100;
const secs = (/** @type {number} */ n) => `${r2(n)}s`;
const span = (/** @type {number} */ a, /** @type {number} */ b) => `${r2(a)}–${r2(b)}s`;

/** "screen recording" / "b-roll" → "screenRecording" / "bRoll" */
export function camel(/** @type {string} */ s) {
  const words = s.trim().replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^a-zA-Z0-9]+/).filter(Boolean).map((w) => w.toLowerCase());
  const out = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join("");
  return /^[a-z]/.test(out) ? out : `clip${out[0]?.toUpperCase() ?? ""}${out.slice(1)}`;
}

const title = (/** @type {string} */ id) => id.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

/** Pick a fixture that looks like the footage a role names. */
export function fixtureFor(/** @type {string} */ role) {
  if (/screen|demo|app|record|desktop|ui|phone|website/i.test(role)) return "fixtures/landscape-screen.mp4";
  if (/green|cutout|cut-out/i.test(role)) return "fixtures/person-on-green.mp4";
  return "fixtures/portrait-talking.mp4";
}

/**
 * Decide inputs and clips.
 * @param {string} id
 * @param {Analysis | null} analysis
 * @returns {Plan}
 */
export function planTemplate(id, analysis) {
  if (!ID_RE.test(id) || id.length > 64) {
    throw new ReelclawError(`"${id}" is not a valid template id`, { hint: "use kebab-case: lowercase letters, digits and hyphens (e.g. pov-app-reveal) — it is also the folder and the Agent Skills name" });
  }
  if (!analysis) return blankPlan(id);

  const f = analysis.format ?? {};
  const duration = analysis.media.duration;
  const roles = (f.roles ?? []).map((r) => (r ? camel(r) : null));
  const montage = !roles.some(Boolean) && analysis.shots.length > MONTAGE_SHOTS;
  const taken = new Set([...RESERVED_FLAGS, ...TEMPLATE_KEYS]);
  const safeKey = (/** @type {string} */ k) => (taken.has(k) ? `${k}Clip` : k);

  /** @type {Map<string, number[]>} footage key → shot indexes */
  const byKey = new Map();
  const shots = analysis.shots.map((s, i) => {
    const key = montage ? "clips" : safeKey(roles[i] ?? `shot${s.index}`);
    const earlier = byKey.get(key) ?? [];
    byKey.set(key, [...earlier, i]);
    // jump cuts: a later shot of the same footage picks up where the previous one stopped
    const trim = montage ? 0 : r2(earlier.reduce((sum, j) => sum + analysis.shots[j].duration, 0));
    return { id: `shot-${s.index}`, input: key, start: r2(s.start), duration: r2(s.duration), trim };
  });
  /** @type {Footage[]} */
  const footage = montage
    ? [{ key: "clips", description: `Footage, used in order for the ${shots.length} shots (repeats when there are fewer clips)`, fixture: "" }]
    : [...byKey].map(([key, idx]) => ({
        key,
        description: `Footage for shot${idx.length > 1 ? "s" : ""} ${idx.map((i) => analysis.shots[i].index).join(", ")} (${idx.map((i) => span(analysis.shots[i].start, analysis.shots[i].end)).join(", ")} in the reference)`,
        fixture: fixtureFor(key),
      }));
  for (const k of byKey.keys()) taken.add(k);

  const sorted = [...(f.texts ?? [])].sort((a, b) => a.start - b.start).filter((t) => t.start < duration);
  /** @type {PlannedText[]} */
  const texts = sorted.map((t, i) => {
    let key = t.key ?? (i === 0 ? "hook" : `caption${i + 1}`);
    while (taken.has(key)) key = `${key}Text`;
    taken.add(key);
    const end = Math.min(t.end, duration);
    return { key, id: flagName(key), text: t.text, start: r2(t.start), duration: r2(end - t.start), position: t.position ?? "center", required: i === 0 };
  });
  if (!texts.length) {
    const first = analysis.shots[0];
    texts.push({ key: "hook", id: "hook", text: "", start: 0, duration: r2(first.duration), position: "center", required: true });
  }

  const p = analysis.pacing;
  const bpm = analysis.beats?.bpm;
  const facts = [`${p.shots} shot(s) in ${secs(duration)}`, `avg ${secs(p.avgShot)}/shot`, p.firstCut !== null && `first cut at ${secs(p.firstCut)}`, bpm && `${bpm} bpm`]
    .filter(Boolean).join(" · ");
  const url = analysis.source.url && /^https?:\/\//.test(analysis.source.url) ? analysis.source.url : undefined;
  const description = (f.description?.trim() || TODO_DESCRIPTION).slice(0, 400);

  return {
    id,
    name: f.name?.trim() || title(id),
    description: description.length >= 20 ? description : TODO_DESCRIPTION,
    category: f.category && CATEGORIES.includes(f.category) ? f.category : "other",
    tags: (f.tags ?? []).map((t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")).filter(Boolean),
    source: { ...(url ? { url } : {}), notes: [facts, f.structure?.trim()].filter(Boolean).join(". ") },
    footage,
    shots,
    montage,
    texts,
    captionStyle: f.captionStyle ?? "tiktok-outline",
    header: [`Recreates ${url ?? analysis.source.input} (scaffolded from analysis/${analysis.slug}).`, `Reference: ${facts}.`],
    notes: { structure: f.structure?.trim() || undefined, whyItWorks: f.whyItWorks?.trim() || undefined },
  };
}

/** @param {string} id @returns {Plan} */
function blankPlan(id) {
  return {
    id,
    name: title(id),
    description: TODO_DESCRIPTION,
    category: "other",
    tags: [],
    source: {},
    footage: [{ key: "clip", description: "The main clip", fixture: "fixtures/portrait-talking.mp4" }],
    shots: [{ id: "clip", input: "clip", start: 0, duration: 5, trim: 0 }],
    montage: false,
    texts: [{ key: "hook", id: "hook", text: "", start: 0, duration: 3, position: "center", required: true }],
    captionStyle: "tiktok-outline",
    header: ["Scaffolded by `reelclaw scaffold` (no reference analysis)."],
    notes: {},
  };
}

const q = (/** @type {unknown} */ v) => JSON.stringify(v);

/**
 * template.mjs source.
 * @param {Plan} plan
 */
export function renderTemplate(plan) {
  const o = [];
  o.push("// @ts-check", "/**", ` * ${plan.id} — ${plan.name}`, " *");
  for (const l of plan.header) o.push(` * ${l}`);
  if (plan.notes.structure) o.push(` * Structure: ${plan.notes.structure}`);
  if (plan.notes.whyItWorks) o.push(` * Why it works: ${plan.notes.whyItWorks}`);
  o.push(
    " *",
    " * TODO(author) — the skeleton renders as-is; make it a template (see .claude/skills/new-template/SKILL.md):",
    " *   - name inputs after what they hold (shot1 → reaction) and rewrite their descriptions",
    " *   - decide which timings the format fixes and which follow the footage (clipLength, trim inputs)",
    " *   - expose only the knobs people tweak (positions, lengths, sizes); delete this TODO list",
    " */",
  );
  o.push(`import { CAPTION_STYLES, caption, defineTemplate, input, music, timeline, video } from "reelclaw";`);
  if (plan.shots.some((s) => s.trim > 0)) {
    o.push(
      "",
      "/**",
      " * Where a later shot of the same footage picks up (jump cuts), wrapping to 0 when the clip is too short.",
      ' * @param {import("reelclaw").MediaRef} ref @param {number} at seconds',
      " */",
      "const pickUp = (ref, at) => (ref.duration - at >= 1 ? at : 0);",
    );
  }
  if (plan.montage) {
    o.push("", "/** [start, duration] of every shot, measured from the reference (seconds). */");
    o.push(`const SHOTS = ${q(plan.shots.map((s) => [s.start, s.duration]))};`);
  }
  o.push("", "export default defineTemplate({");
  o.push(`  id: ${q(plan.id)},`, `  name: ${q(plan.name)},`, `  description: ${q(plan.description)},`, `  category: ${q(plan.category)},`, `  tags: [${plan.tags.map(q).join(", ")}],`);
  const source = Object.entries(plan.source).filter(([, v]) => v).map(([k, v]) => `${k}: ${q(v)}`);
  if (source.length) o.push(`  source: { ${source.join(", ")} },`);
  o.push("", "  inputs: {");
  for (const f of plan.footage) {
    o.push(plan.montage
      ? `    clips: input.list(input.video({ description: "A clip" }), { min: 1, description: ${q(f.description)} }),`
      : `    ${f.key}: input.video({ required: true, description: ${q(f.description)} }),`);
  }
  for (const t of plan.texts) {
    const ex = t.text ? `, example: ${q(t.text)}` : "";
    o.push(`    ${t.key}: input.text({ ${t.required ? "required: true, " : ""}description: ${q(`On-screen text, ${span(t.start, t.start + t.duration)}`)}${ex} }),`);
  }
  o.push(
    `    captionStyle: input.enum(CAPTION_STYLES, { default: ${q(plan.captionStyle)}, description: "Caption look: classic outline, TikTok white/dark box, or plain" }),`,
    `    music: input.audio({ description: "Background music (fades out at the end); for organic posts add a trending sound in-app instead" }),`,
    `    musicVolume: input.number({ default: 1, min: 0, max: 1, description: "Music level" }),`,
    "  },",
    "",
    "  build({ inputs }) {",
    "    const look = { style: inputs.captionStyle };",
    "    return timeline([",
    "      // shots: cut times measured from the reference; loop fills a shot when the footage is shorter",
  );
  if (plan.montage) {
    o.push("      SHOTS.map(([start, duration], i) => video(inputs.clips[i % inputs.clips.length], { id: `shot-${i + 1}`, start, duration, loop: true })),");
  } else {
    for (const s of plan.shots) {
      const trim = s.trim > 0 ? `, trim: pickUp(inputs.${s.input}, ${s.trim})` : "";
      o.push(`      video(inputs.${s.input}, { id: ${q(s.id)}, start: ${s.start}, duration: ${s.duration}${trim}, loop: true }),`);
    }
  }
  o.push("      // on-screen text: static, auto-fitted inside the safe band (RULES.md §2–3)");
  for (const t of plan.texts) {
    const call = `caption(inputs.${t.key}, { id: ${q(t.id)}, start: ${t.start}, duration: ${t.duration}, position: ${q(t.position)}, ...look })`;
    o.push(`      ${t.required ? "" : `inputs.${t.key} && `}${call},`);
  }
  o.push("      inputs.music && music(inputs.music, { volume: inputs.musicVolume }),", "    ]);", "  },", "});", "");
  return o.join("\n");
}

/**
 * example.json — inputs CI makes with the synthetic fixtures.
 * @param {Plan} plan
 */
export function renderExample(plan) {
  /** @type {Record<string, unknown>} */
  const inputs = {};
  for (const f of plan.footage) {
    inputs[f.key] = plan.montage ? ["fixtures/portrait-talking.mp4", "fixtures/landscape-screen.mp4", "fixtures/portrait-silent.mp4"] : f.fixture;
  }
  for (const t of plan.texts) inputs[t.key] = t.text || "nobody tells you this until it's too late";
  inputs.music = "fixtures/music.m4a";
  inputs.musicVolume = 0.6;
  return `${JSON.stringify({ template: plan.id, inputs }, null, 2)}\n`;
}

/** A YAML double-quoted scalar on one line. */
const yaml = (/** @type {string} */ s) => `"${s.replace(/\s+/g, " ").replace(/\\/g, "/").replace(/"/g, "'").trim()}"`;

/**
 * SKILL.md stub (Agent Skills frontmatter + the playbook skeleton).
 * @param {Plan} plan
 */
export function renderSkill(plan) {
  const what = plan.description === TODO_DESCRIPTION ? "TODO: what it makes." : plan.description;
  const description = `Make a "${plan.name}" short-form video (TikTok / Reels / Shorts, 1080x1920) with the reelclaw ${plan.id} template. ${what} Use when TODO: the requests or footage that should trigger this template.`;
  const required = [...plan.footage.map((f) => ({ flag: f.key, req: true, note: f.description })), ...plan.texts.map((t) => ({ flag: t.key, req: t.required, note: `On-screen text, ${span(t.start, t.start + t.duration)}${t.text ? ` — reference: “${t.text}”` : ""}` }))];
  const example = [
    ...plan.footage.map((f) => `  --${flagName(f.key)} path/or/url.mp4`),
    ...plan.texts.filter((t) => t.required).map((t) => `  --${flagName(t.key)} ${q(t.text || "your hook")}`),
  ];
  return `---
name: ${plan.id}
description: ${yaml(description.slice(0, 1024))}
---

# ${plan.id} — ${plan.name}

${plan.notes.structure ? `\`\`\`\n${plan.notes.structure}\n\`\`\`\n\n` : ""}TODO: one paragraph — the format, its length, and what does the work.

**Planning, hooks, footage, music, QA and variants** work the same for every template and live in the shared \`reelclaw-playbook\` skill (installed with every template; skill-only: \`npx skills add danielhangan/reelclaw-templates --skill reelclaw-playbook\`). Load it first when planning. This file covers what is specific to ${plan.id}.

## 0. Set up (once per folder)

If \`templates/${plan.id}/template.mjs\` does not exist in the working directory, install the template and engine:

\`\`\`bash
npx reelclaw@latest add ${plan.id}
\`\`\`

If npm cannot find the \`reelclaw\` package, run the same installer straight from GitHub: \`npx github:danielhangan/reelclaw-templates add ${plan.id}\`.

Then check the machine: \`npx reelclaw doctor\`. If something is missing, show the user the install line doctor prints and stop until it's fixed.

## 1. Collect inputs

| Input | Required | Notes |
| --- | --- | --- |
${required.map((r) => `| \`--${flagName(r.flag)}\` | ${r.req ? "yes" : "no"} | ${r.note} |`).join("\n")}
| \`--music\` | no | Background track; otherwise the reel is silent (attach a trending sound in-app). |

Every flag: \`npx reelclaw make ${plan.id} --help\`.

**Footage.** The user's own files or links first; never pull someone else's post as footage. TODO: what good footage looks like for this format, and what to film if the user has none. Real-creator clips from DansUGC are optional: only if its MCP tools are connected or the user asks, follow \`reelclaw-playbook\` → \`references/dansugc.md\` (prices in credits, buy only after a yes). Never block on it.

## 2. Make a draft

\`\`\`bash
npx reelclaw make ${plan.id} \\
${example.join(" \\\n")} \\
  --draft
\`\`\`

This writes \`reels/${plan.id}-N.html\` (editable composition), \`reels/${plan.id}-N.json\` (inputs used) and \`renders/${plan.id}-N.mp4\`, then runs \`npx reelclaw qa\`. Open every frame it lists and go through the playbook's QA checklist (max 3 passes). For this format, check: TODO (what goes wrong most often, and the flag that fixes it).

## 3. Iterate cheaply, then finalize

- New text, same clips (media is cached): \`npx reelclaw make ${plan.id} --props reels/${plan.id}-1.json --${flagName(plan.texts[0].key)} "new text" --name v2 --draft\`
- Many variants at once: \`npx reelclaw batch ${plan.id} rows.json --props reels/${plan.id}-1.json --draft\`.
- Final quality: \`npx reelclaw render <name>\` (no \`--draft\`).
- Hand edits: change \`reels/<name>.html\`, run \`npx reelclaw check <name>\`, then \`npx reelclaw render <name>\`.

## 4. What makes this format work

${plan.notes.whyItWorks ? `- ${plan.notes.whyItWorks}\n` : ""}- TODO: hook voice and examples that work for this format.
- TODO: what to vary between variants (hooks, not footage).
- TODO: sound — trending sound in-app for organic posts, baked \`--music\` for ads.
`;
}

/**
 * README.md stub; the flags table between the markers is filled in by scaffoldTemplate().
 * @param {Plan} plan
 */
export function renderReadme(plan) {
  const shots = plan.montage
    ? `${plan.shots.length} quick cuts over \`--clips\` (cycled)`
    : plan.shots.map((s) => `[ ${s.input} · ${secs(s.duration)} ]`).join(" → ");
  return `# ${plan.name}

${plan.description}

\`\`\`
${shots}
\`\`\`

${plan.source.url ? `Recreates the format of ${plan.source.url} (link only — the reference video is not part of this repo).\n\n` : ""}## Use

\`\`\`bash
npx reelclaw@latest add ${plan.id}
npx reelclaw make ${plan.id} --help
\`\`\`

Works with your own footage (local files or TikTok / Instagram / YouTube links). Need clips? [DansUGC](https://dansugc.com) has real-creator UGC — optional.

## Flags

${FLAGS_START}
${FLAGS_END}

## How it works

TODO: the structure, what each input controls, and any deliberate exceptions to RULES.md (e.g. text outside the safe band).
`;
}

/**
 * Write templates/<id>/ and fill the README flags table from the real template.
 * @param {{ id: string, root: string, analysis: Analysis | null, force?: boolean }} o
 * @returns {Promise<{ dir: string, files: string[], plan: Plan }>}
 */
export async function scaffoldTemplate({ id, root, analysis, force = false }) {
  const plan = planTemplate(id, analysis);
  const dir = join(root, "templates", id);
  if (existsSync(dir) && !force) {
    throw new ReelclawError(`templates/${id}/ already exists`, { hint: "pick another id, or pass --force to overwrite its template.mjs, SKILL.md, README.md and example.json" });
  }
  await mkdir(dir, { recursive: true });
  /** @type {[string, string][]} */
  const files = [
    ["template.mjs", renderTemplate(plan)],
    ["example.json", renderExample(plan)],
    ["SKILL.md", renderSkill(plan)],
    ["README.md", renderReadme(plan)],
  ];
  for (const [name, text] of files) await writeFile(join(dir, name), text);

  // load what we wrote: proves the skeleton is a valid template, and gives the flags table
  let template;
  try {
    ({ template } = await loadTemplate(dir, root));
  } catch (cause) {
    throw new ReelclawError(`the generated ${relative(root, dir)}/template.mjs does not load: ${/** @type {Error} */ (cause).message}`, {
      hint: "this is a scaffold bug — please report it (https://github.com/danielhangan/reelclaw-templates/issues) and fix the file by hand",
      cause,
    });
  }
  const readme = join(dir, "README.md");
  await writeFile(readme, replaceBlock(await readFile(readme, "utf8"), flagsTable(template.inputs)) ?? "");
  return { dir, files: files.map(([n]) => relative(root, join(dir, n))), plan };
}
