// @ts-check
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ReelclawError } from "../../core/errors.mjs";
import { flagsTable, inputsJsonSchema } from "../../core/inputs.mjs";
import { loadTemplate } from "../../core/loader.mjs";

export const FLAGS_START = "<!-- reelclaw:flags:start -->";
export const FLAGS_END = "<!-- reelclaw:flags:end -->";

/** @type {import('../main.mjs').Command} */
export default {
  summary: "print a template's flags table (or write it into its README)",
  usage: `
Usage
  reelclaw docs <template>               print the markdown flags table
  reelclaw docs <template> --write       replace the table in templates/<id>/README.md
  reelclaw docs <template> --schema      print the JSON schema of its --props file

--write updates the block between these markers in README.md:
  ${FLAGS_START}
  ${FLAGS_END}`,
  options: { write: { type: "boolean" }, schema: { type: "boolean" } },
  async run(ctx) {
    const id = ctx.args.positionals[0];
    if (!id) throw new ReelclawError("which template?", { hint: "reelclaw docs <template>" });
    const { template, dir } = await loadTemplate(id, ctx.root);
    if (ctx.args.values.schema) {
      console.log(JSON.stringify(inputsJsonSchema(template.inputs), null, 2));
      return 0;
    }
    const table = flagsTable(template.inputs);
    if (!ctx.args.values.write) {
      console.log(table);
      return 0;
    }
    const readme = join(dir, "README.md");
    const text = await readFile(readme, "utf8");
    const updated = replaceBlock(text, table);
    if (updated === null) {
      throw new ReelclawError(`${readme} has no flags markers`, { hint: `add\n${FLAGS_START}\n${FLAGS_END}\nwhere the flags table should go` });
    }
    await writeFile(readme, updated);
    ctx.log.success(`updated flags table in ${readme}`);
    return 0;
  },
};

/**
 * Replace the generated block in a README. Null when the markers are missing.
 * @param {string} text
 * @param {string} table
 */
export function replaceBlock(text, table) {
  const a = text.indexOf(FLAGS_START);
  const b = text.indexOf(FLAGS_END);
  if (a < 0 || b < a) return null;
  return `${text.slice(0, a + FLAGS_START.length)}\n${table}\n${text.slice(b)}`;
}
