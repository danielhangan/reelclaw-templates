// @ts-check
import { basename } from "node:path";
import { ReelclawError } from "../../core/errors.mjs";
import { color } from "../../core/log.mjs";
import { lintReel } from "../../core/render.mjs";

/** @type {import('../main.mjs').Command} */
export default {
  summary: "lint a reel's composition with HyperFrames (run after hand edits)",
  usage: `
Usage
  reelclaw check <name> [<name> …] [--json]

Runs \`hyperframes lint\` on reels/<name>.html. Exit code 1 on errors.
Run it after editing a composition by hand, before rendering.`,
  options: { json: { type: "boolean" } },
  async run(ctx) {
    const names = ctx.args.positionals.map((p) => basename(p).replace(/\.html$/, ""));
    if (!names.length) throw new ReelclawError("which reel?", { hint: "reelclaw check <name>" });
    let errors = 0;
    /** @type {Record<string, unknown>} */
    const all = {};
    for (const name of names) {
      const findings = await lintReel(ctx.root, name);
      all[name] = findings;
      errors += findings.filter((f) => f.severity === "error").length;
      if (ctx.args.values.json) continue;
      if (!findings.length) ctx.log.success(`${name}: no lint findings`);
      for (const f of findings) {
        const mark = f.severity === "error" ? color.red("✖") : f.severity === "warning" ? color.yellow("⚠") : color.dim("i");
        console.log(`${mark} ${name}: ${f.code} — ${f.message}${f.fixHint ? `\n    ${color.cyan("→")} ${f.fixHint}` : ""}`);
      }
    }
    if (ctx.args.values.json) console.log(JSON.stringify(all, null, 2));
    return errors ? 1 : 0;
  },
};
