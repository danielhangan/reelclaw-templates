// @ts-check
import { locateAnalysis, readAnalysis } from "../../analyze/index.mjs";
import { scaffoldTemplate } from "../../analyze/scaffold.mjs";
import { ReelclawError } from "../../core/errors.mjs";
import { color, displayPath } from "../../core/log.mjs";

/** @type {import('../main.mjs').Command} */
export default {
  summary: "create templates/<id>/ (template.mjs, SKILL.md, README, example) — from an analysis or blank",
  usage: `
Usage
  reelclaw scaffold <id> --from analysis/<slug>     pre-filled from \`reelclaw analyze\`
  reelclaw scaffold <id>                            a blank one-clip + hook skeleton

<id> is kebab-case (pov-app-reveal): the folder, the template id and the
Agent Skills name.

From an analysis, the skeleton gets:
  - one video input per shot role (format.roles), or per shot, or one --clips
    list for fast montages — with the reference's cut times
  - one caption input per on-screen text (format.texts) at its time window
  - --caption-style (format.captionStyle), --music, --music-volume
  - name / description / category / tags / source from the analysis

It loads and validates as-is: \`reelclaw validate <id>\`. Then make it a real
template — see .claude/skills/new-template/SKILL.md.

Flags
  --from <analysis>  analysis/<slug>, its folder, or its analysis.json
  --force            overwrite an existing templates/<id>/ (its 4 generated files)`,
  options: { from: { type: "string" }, force: { type: "boolean" } },
  async run(ctx) {
    const id = ctx.args.positionals[0];
    if (!id) throw new ReelclawError("which template id?", { hint: "reelclaw scaffold my-format --from analysis/<slug>" });
    const from = ctx.args.values.from ? String(ctx.args.values.from) : undefined;
    const analysis = from ? await readAnalysis(locateAnalysis(from, { root: ctx.root, cwd: ctx.cwd })) : null;
    const { dir, files, plan } = await scaffoldTemplate({ id, root: ctx.root, analysis, force: Boolean(ctx.args.values.force) });

    ctx.log.success(`scaffolded ${displayPath(ctx.cwd, dir)}/ ${color.dim(`(${plan.shots.length} shot(s), ${plan.footage.length} footage input(s), ${plan.texts.length} caption(s))`)}`);
    for (const f of files) console.log(color.dim(`  ${f}`));
    if (analysis && !analysis.format.roles?.some(Boolean)) ctx.log.warn("format.roles was empty: inputs are named shot1, shot2… — rename them after what they hold");
    if (analysis && !analysis.format.texts?.length) ctx.log.warn("format.texts was empty: added one placeholder hook over the first shot");
    console.log(`
${color.bold("Next")}
  reelclaw make ${id} --props ${displayPath(ctx.cwd, dir)}/example.json --draft   ${color.dim("# renders as-is; needs npm run fixtures in the repo")}
  resolve every TODO:  grep -n TODO ${displayPath(ctx.cwd, dir)}/*
  reelclaw validate ${id}                                         ${color.dim("# fails until no TODO is left")}`);
    return 0;
  },
};
