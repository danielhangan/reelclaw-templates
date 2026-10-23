// @ts-check
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { ReelclawError } from "../../core/errors.mjs";
import { cliOptions, flagName, valueHint } from "../../core/inputs.mjs";
import { loadTemplate } from "../../core/loader.mjs";
import { color, displayPath } from "../../core/log.mjs";
import { makeReel, readProps } from "../../core/make.mjs";
import { qaReel } from "../../core/qa.mjs";
import { QUALITIES } from "../../core/render.mjs";
import { numberFlag, parseFlags } from "../args.mjs";
import { printQa } from "./qa.mjs";

/** @typedef {import('../../core/render.mjs').Quality} Quality */
/** @typedef {import('../../core/template.mjs').Template<any, any>} AnyTemplate */

/** Flags `make` accepts for every template. */
export const MAKE_OPTIONS = /** @type {const} */ ({
  props: { type: "string", description: "JSON file with inputs ({ \"inputs\": {...} } or a flat object); CLI flags override it" },
  name: { type: "string", description: "reel name (kebab-case); default <template>-N" },
  render: { type: "boolean", description: "render renders/<name>.mp4 after generating" },
  draft: { type: "boolean", description: "fast draft-quality render (implies --render)" },
  quality: { type: "string", description: `render quality: ${QUALITIES.join(" | ")} (default looks)` },
  workers: { type: "string", description: "parallel render workers (number or auto)" },
  qa: { type: "boolean", description: "after rendering, run `reelclaw qa` (default on; --no-qa skips)" },
  help: { type: "boolean", short: "h", description: "show this template's inputs" },
});

/** @type {import('../main.mjs').Command} */
export default {
  summary: "generate a reel from a template (and optionally render it)",
  usage: `
Usage
  reelclaw make <template> --<input> <value> … [--render] [--draft]
  reelclaw make <template> --props reel.json [--name hook-b] [--render]
  reelclaw make <template> --help            show the template's inputs

Writes reels/<name>.html (an editable HyperFrames composition) and
reels/<name>.json (the inputs used). Media inputs accept local paths, direct
file URLs and TikTok/Instagram/YouTube page links (needs yt-dlp).
With --render/--draft it renders renders/<name>.mp4 and then runs
\`reelclaw qa <name>\` (frames to look at + checks; exit 1 on a problem).

Flags
${Object.entries(MAKE_OPTIONS).map(([k, o]) => `  --${k.padEnd(10)} ${o.description}`).join("\n")}

Examples
  reelclaw make reaction_demo --reaction clips/react.mp4 --demo demo.mov \\
    --hook "i was about to hit it and this app talked me out of it" --draft
  reelclaw make reaction_demo --props reels/reaction-demo-1.json --hook "new hook" --name hook-b --render`,
  rawArgs: true,
  async run(ctx) {
    const first = ctx.argv[0] && !ctx.argv[0].startsWith("-") ? ctx.argv[0] : undefined;
    const rest = first ? ctx.argv.slice(1) : ctx.argv;

    // the template can come from the props file when not given positionally
    const propsPath = flagValue(rest, "props");
    const props = propsPath ? await readProps(propsPath) : undefined;
    const templateId = first ?? props?.template;
    if (!templateId) {
      if (rest.includes("--help") || rest.includes("-h") || !rest.length) { ctx.help("make"); return 0; }
      throw new ReelclawError("which template?", { hint: "reelclaw make <template> … — run `reelclaw list` to see installed templates" });
    }

    const { template } = await loadTemplate(templateId, ctx.root);
    const args = parseFlags(rest, { ...cliOptions(template.inputs), ...MAKE_OPTIONS });
    if (args.values.help) {
      printTemplateHelp(template, ctx.root);
      return 0;
    }
    if (args.positionals.length) {
      throw new ReelclawError(`unexpected argument "${args.positionals[0]}"`, { hint: 'quote text values: --hook "two words"' });
    }

    /** @type {Record<string, unknown>} */
    const values = { ...(props?.inputs ?? {}) };
    for (const key of Object.keys(template.inputs)) {
      const v = args.values[flagName(key)];
      if (v !== undefined) values[key] = v;
    }
    const quality = /** @type {Quality | undefined} */ (args.values.draft ? "draft" : /** @type {string|undefined} */ (args.values.quality));
    if (quality && !QUALITIES.includes(/** @type {Quality} */ (quality))) {
      throw new ReelclawError(`--quality must be one of ${QUALITIES.join(", ")}`);
    }
    const workersRaw = /** @type {string | undefined} */ (args.values.workers);
    const workers = workersRaw === "auto" ? "auto" : numberFlag(workersRaw, "workers");

    const result = await makeReel({
      root: ctx.root,
      template,
      values,
      name: /** @type {string | undefined} */ (args.values.name),
      render: Boolean(args.values.render || args.values.draft),
      quality,
      workers,
      log: ctx.log,
    });

    if (result.output) {
      if (args.values.qa === false) return result.renderWarnings?.length ? 1 : 0;
      ctx.log.step(`qa ${result.name}…`);
      const report = await qaReel({ video: result.output, html: result.html, out: join(dirname(result.output), "qa", result.name), cwd: ctx.cwd });
      printQa(report, ctx.cwd, ctx.log);
      return report.ok ? 0 : 1;
    }
    const shown = displayPath(ctx.cwd, ctx.root);
    const cd = shown === "." ? "" : ` --project ${shown}`;
    console.log(`\n${color.bold("Next")}
  reelclaw render ${result.name}${cd} --draft     ${color.dim("# fast preview render")}
  reelclaw render ${result.name}${cd}             ${color.dim("# final quality")}
  reelclaw qa ${result.name}${cd}                 ${color.dim("# after rendering: frames to look at + checks")}
  ${color.dim(`edit reels/${result.name}.html by hand, or re-run make with new inputs (--props reels/${result.name}.json)`)}`);
    return 0;
  },
};

/**
 * Value of `--flag value` / `--flag=value` in raw argv (before full parsing).
 * @param {string[]} argv
 * @param {string} flag
 */
function flagValue(argv, flag) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === `--${flag}`) return argv[i + 1];
    if (argv[i].startsWith(`--${flag}=`)) return argv[i].slice(flag.length + 3);
  }
  return undefined;
}

/**
 * Terminal help for one template: its inputs as flags.
 * @param {AnyTemplate} template
 * @param {string} root
 */
function printTemplateHelp(template, root) {
  const rows = Object.entries(template.inputs).map(([key, spec]) => {
    const hint = valueHint(spec);
    const flag = `--${flagName(key)}${hint ? ` ${hint}` : ""}`;
    const def = spec.required ? color.yellow("required") : spec.default === undefined || (Array.isArray(spec.default) && !spec.default.length) ? "" : color.dim(`default ${JSON.stringify(spec.default)}`);
    return `  ${color.cyan(flag.padEnd(34))} ${spec.description}${spec.kind === "list" ? " (repeatable)" : ""}${def ? `  ${def}` : ""}`;
  });
  const example = existsSync(join(root, "templates", template.id, "example.json")) ? `\n  ${color.dim(`example inputs: templates/${template.id}/example.json`)}` : "";
  console.log(`${color.bold(template.name)} ${color.dim(`(${template.id})`)}
${template.description}

${color.bold("Inputs")}
${rows.join("\n")}

${color.bold("Make flags")}
${Object.entries(MAKE_OPTIONS).map(([k, o]) => `  ${color.cyan(`--${k}`.padEnd(34))} ${o.description}`).join("\n")}${example}`);
}
