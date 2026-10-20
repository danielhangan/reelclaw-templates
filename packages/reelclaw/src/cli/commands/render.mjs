// @ts-check
import { basename } from "node:path";
import { displayPath } from "../../core/log.mjs";
import { ReelclawError } from "../../core/errors.mjs";
import { QUALITIES, renderReel } from "../../core/render.mjs";
import { numberFlag } from "../args.mjs";

/** @typedef {import('../../core/render.mjs').Quality} Quality */

/** @type {import('../main.mjs').Command} */
export default {
  summary: "render reels/<name>.html to renders/<name>.mp4",
  usage: `
Usage
  reelclaw render <name> [<name> …] [--draft | --quality looks|delivery] [--workers n]

Renders with the pinned HyperFrames CLI, then checks the MP4's duration.
<name> is a reel in reels/ (reels/<name>.html also works). Hand-edited
compositions render the same way.

Flags
  --draft          fast preview quality
  --quality <q>    ${QUALITIES.join(" | ")} (default looks)
  --workers <n>    parallel Chrome workers (default auto; each ~256MB RAM)
  --output <path>  output file (single reel only)`,
  options: {
    draft: { type: "boolean" },
    quality: { type: "string" },
    workers: { type: "string" },
    output: { type: "string" },
  },
  async run(ctx) {
    const names = ctx.args.positionals.map((p) => basename(p).replace(/\.html$/, ""));
    if (!names.length) throw new ReelclawError("which reel?", { hint: "reelclaw render <name> — reel names are the files in reels/" });
    const v = ctx.args.values;
    const quality = /** @type {Quality} */ (v.draft ? "draft" : v.quality ?? "looks");
    if (!QUALITIES.includes(quality)) throw new ReelclawError(`--quality must be one of ${QUALITIES.join(", ")}`);
    if (v.output && names.length > 1) throw new ReelclawError("--output only works with a single reel");
    const workers = v.workers === "auto" ? "auto" : numberFlag(v.workers, "workers");
    for (const name of names) {
      const r = await renderReel({ root: ctx.root, name, quality, workers, output: /** @type {string|undefined} */ (v.output), log: ctx.log });
      ctx.log.success(`${displayPath(ctx.cwd, r.output)}  (${r.duration}s)`);
    }
    return 0;
  },
};
