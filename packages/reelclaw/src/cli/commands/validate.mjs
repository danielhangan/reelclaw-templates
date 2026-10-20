// @ts-check
import { ReelclawError } from "../../core/errors.mjs";
import { findTemplates, locateTemplate } from "../../core/loader.mjs";
import { color, displayPath } from "../../core/log.mjs";
import { REPO_ROOT } from "../../core/project.mjs";
import { validateTemplate } from "../../core/validate.mjs";

/** @type {import('../main.mjs').Command} */
export default {
  summary: "validate templates: manifest, SKILL.md, example.json, compile (CI)",
  usage: `
Usage
  reelclaw validate [<template> …] [--render] [--json]

For each template (default: all): loads template.mjs, checks SKILL.md /
README.md / example.json, validates the example inputs, and runs a full make
(stage → build → compile) in a throwaway project. Example media paths are
relative to the repo root (fixtures/…; generate them with \`npm run fixtures\`).

Flags
  --render   also draft-render each example (slow; 1 worker)
  --keep     keep the throwaway projects (to inspect the output)
  --json     machine-readable results`,
  options: { render: { type: "boolean" }, json: { type: "boolean" }, keep: { type: "boolean" } },
  async run(ctx) {
    const locs = ctx.args.positionals.length
      ? ctx.args.positionals.map((id) => locateTemplate(id, ctx.root))
      : findTemplates(ctx.root);
    if (!locs.length) throw new ReelclawError("no templates found", { hint: "run inside the repo or a reel project with templates/" });
    const base = REPO_ROOT ?? ctx.root;
    const results = [];
    for (const loc of locs) {
      const r = await validateTemplate(loc, { root: ctx.root, base, render: Boolean(ctx.args.values.render), keep: Boolean(ctx.args.values.keep) });
      results.push(r);
      if (ctx.args.values.json) continue;
      const mark = r.errors.length ? color.red("✖") : color.green("✓");
      const meta = r.duration ? color.dim(` ${r.duration}s`) : "";
      const out = r.output ? color.dim(` → ${displayPath(ctx.cwd, r.output)}`) : "";
      console.log(`${mark} ${color.bold(r.id)}${meta}${out}`);
      for (const e of r.errors) console.log(`    ${color.red("✖")} ${e}`);
      for (const w of r.warnings) console.log(`    ${color.yellow("⚠")} ${w}`);
    }
    if (ctx.args.values.json) console.log(JSON.stringify(results, null, 2));
    const failed = results.filter((r) => r.errors.length).length;
    if (!ctx.args.values.json) console.log(failed ? color.red(`\n${failed}/${results.length} template(s) failed`) : color.green(`\n${results.length} template(s) OK`));
    return failed ? 1 : 0;
  },
};
