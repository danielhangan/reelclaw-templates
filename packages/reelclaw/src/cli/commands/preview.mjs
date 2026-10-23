// @ts-check
import { copyFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ReelclawError } from "../../core/errors.mjs";
import { makeExample } from "../../core/example.mjs";
import { checkRender, expectationsFor, frameStrip, frameTimes, previewGif, previewMp4, probeRender } from "../../core/inspect.mjs";
import { color, displayPath } from "../../core/log.mjs";
import { projectPaths } from "../../core/project.mjs";
import { numberFlag } from "../args.mjs";

/** @type {import('../main.mjs').Command} */
export default {
  summary: "render a template's example and write preview.png / preview.gif",
  usage: `
Usage
  reelclaw preview <template> [--frames 3] [--safe-zones] [--mp4] [--props file]

Makes the template from its example.json (or --props) in a throwaway project,
renders it at draft quality, checks the MP4 (1080x1920, 30fps, duration,
audio) and writes into templates/<id>/:

  preview.png   a strip of --frames frames (README, registry, website)
  preview.gif   a small looping GIF (≤ 2MB)
  preview.mp4   a 540x960 web preview with sound (--mp4)

The full render goes to renders/preview/<id>.mp4. --safe-zones also writes
renders/preview/<id>-safe-zones.png with the platform UI zones shaded and the
text band (RULES.md §4) outlined, so reviewers can see captions stay inside.

Flags
  --frames <n>     frames in the strip (default 3)
  --safe-zones     also write the safe-zone debug strip
  --mp4            also write preview.mp4
  --no-gif         skip preview.gif
  --props <file>   inputs to preview instead of example.json (paths relative to cwd)
  --out <dir>      write previews here instead of the template folder
  --workers <n>    render workers (default 2)`,
  options: {
    frames: { type: "string" },
    "safe-zones": { type: "boolean" },
    mp4: { type: "boolean" },
    gif: { type: "boolean" },
    props: { type: "string" },
    out: { type: "string" },
    workers: { type: "string" },
  },
  async run(ctx) {
    const [id, ...extra] = ctx.args.positionals;
    if (!id || extra.length) throw new ReelclawError("preview one template at a time", { hint: "reelclaw preview <template>" });
    const v = ctx.args.values;
    const frames = numberFlag(v.frames, "frames") ?? 3;
    if (!Number.isInteger(frames) || frames < 1 || frames > 12) throw new ReelclawError("--frames must be a whole number from 1 to 12");
    const workersRaw = /** @type {string | undefined} */ (v.workers);

    ctx.log.step(`making + rendering ${id} (draft)…`);
    const ex = await makeExample({
      template: id,
      root: ctx.root,
      props: /** @type {string | undefined} */ (v.props),
      render: true,
      workers: workersRaw === "auto" ? "auto" : numberFlag(workersRaw, "workers") ?? 2,
    });
    try {
      const mp4 = /** @type {string} */ (ex.made.output);
      const info = await probeRender(mp4);
      const check = checkRender(info, expectationsFor(ex.html));

      const out = v.out ? resolve(ctx.cwd, String(v.out)) : ex.dir;
      const debug = join(projectPaths(ctx.root).renders, "preview");
      await Promise.all([mkdir(out, { recursive: true }), mkdir(debug, { recursive: true })]);
      const times = frameTimes(info.duration, frames);
      /** @type {string[]} */
      const written = [];

      written.push(await frameStrip(mp4, times, join(out, "preview.png")));
      if (v.gif !== false) {
        const gif = await previewGif(mp4, join(out, "preview.gif"));
        written.push(gif.out);
        if (gif.bytes > 2_000_000) ctx.log.warn(`preview.gif is ${(gif.bytes / 1e6).toFixed(1)}MB even at ${gif.width}px/${gif.fps}fps — consider --no-gif and --mp4`);
      }
      if (v.mp4) written.push(await previewMp4(mp4, join(out, "preview.mp4")));
      const full = join(debug, `${ex.template.id}.mp4`);
      await copyFile(mp4, full);
      written.push(full);
      if (v["safe-zones"]) written.push(await frameStrip(mp4, times, join(debug, `${ex.template.id}-safe-zones.png`), { safeZones: true }));

      for (const w of ex.made.warnings) ctx.log.warn(w);
      for (const w of check.warnings) ctx.log.warn(w);
      for (const p of check.problems) ctx.log.error(p);
      const renderWarnings = ex.made.renderWarnings ?? [];
      for (const w of renderWarnings) ctx.log.error(`render warning: ${w.message} — ${w.line}`);
      for (const f of written) ctx.log.success(displayPath(ctx.cwd, f));
      console.log(color.dim(`  ${info.width}x${info.height} · ${info.fps}fps · ${info.duration}s · audio ${info.hasAudio ? `${info.meanVolume} dB mean` : "none"} · frames at ${times.join("s, ")}s`));
      return check.problems.length || renderWarnings.length ? 1 : 0;
    } finally {
      await ex.cleanup();
    }
  },
};
