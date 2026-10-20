// @ts-check
import { findTemplates, loadTemplate } from "../../core/loader.mjs";
import { color, displayPath } from "../../core/log.mjs";
import { summarizeTemplate } from "../../core/manifest.mjs";

/** @type {import('../main.mjs').Command} */
export default {
  summary: "list the templates available in this project",
  aliases: ["ls"],
  usage: `
Usage
  reelclaw list [--json]

Shows templates installed in ./templates (and the repo's templates/ when
reelclaw runs from a git checkout). Install more with: npx reelclaw@latest add`,
  options: { json: { type: "boolean" } },
  async run(ctx) {
    /** @type {Array<Record<string, any>>} */
    const rows = [];
    for (const loc of findTemplates(ctx.root)) {
      try {
        const { template } = await loadTemplate(loc.id, ctx.root);
        rows.push({ ...summarizeTemplate(template), source: loc.source, dir: loc.dir });
      } catch (err) {
        rows.push({ id: loc.id, error: /** @type {Error} */ (err).message, source: loc.source, dir: loc.dir });
      }
    }
    if (ctx.args.values.json) {
      console.log(JSON.stringify(rows, null, 2));
      return 0;
    }
    if (!rows.length) {
      console.log(`No templates here yet. Install one:\n  npx reelclaw@latest add            ${color.dim("# pick from the catalog")}`);
      return 0;
    }
    for (const r of rows) {
      const where = color.dim(`(${displayPath(ctx.cwd, r.dir)})`);
      if ("error" in r) console.log(`${color.red("✖")} ${color.bold(r.id)} ${where}\n    ${color.red(r.error ?? "")}`);
      else console.log(`${color.bold(r.id)} ${color.dim(`· ${r.category}`)} ${where}\n    ${r.description}`);
    }
    return 0;
  },
};
