// @ts-check
import { existsSync } from "node:fs";
import { join } from "node:path";
import { TOOLS, run, toolVersion } from "../../core/exec.mjs";
import { color } from "../../core/log.mjs";
import { projectPaths } from "../../core/project.mjs";
import { HYPERFRAMES_VERSION, hyperframesCommand } from "../../core/render.mjs";

/**
 * @typedef {{ name: string, ok: boolean, optional?: boolean, detail: string, hint?: string }} Check
 */

/** @type {import('../main.mjs').Command} */
export default {
  summary: "check Node, ffmpeg, ffprobe, yt-dlp and the headless browser",
  usage: `
Usage
  reelclaw doctor [--json]

Checks everything reelclaw needs and prints the exact install command for
anything missing. Exit code 1 when a required tool is missing.`,
  options: { json: { type: "boolean" } },
  async run(ctx) {
    const checks = await runChecks(ctx.root);
    if (ctx.args.values.json) {
      console.log(JSON.stringify({ ok: checks.every((c) => c.ok || c.optional), checks }, null, 2));
    } else {
      console.log(color.bold("reelclaw doctor"));
      for (const c of checks) {
        const mark = c.ok ? color.green("✓") : c.optional ? color.yellow("○") : color.red("✖");
        console.log(`  ${mark} ${c.name.padEnd(12)} ${color.dim(c.detail)}`);
        if (!c.ok && c.hint) console.log(`    ${color.cyan("→")} ${c.hint}`);
      }
      const missing = checks.filter((c) => !c.ok && !c.optional);
      console.log(missing.length ? `\n${color.red(`${missing.length} required item(s) missing`)} — fix the ✖ lines above.` : `\n${color.green("ready to make reels")}`);
    }
    return checks.every((c) => c.ok || c.optional) ? 0 : 1;
  },
};

/**
 * @param {string} root
 * @returns {Promise<Check[]>}
 */
export async function runChecks(root) {
  const node = process.versions.node;
  /** @type {Check[]} */
  const checks = [
    { name: "Node.js", ok: Number(node.split(".")[0]) >= 22, detail: `v${node}`, hint: "Node 22+ is required: https://nodejs.org · nvm install 22" },
  ];
  for (const [tool, optional, purpose] of /** @type {const} */ ([
    ["ffmpeg", false, "encodes renders"],
    ["ffprobe", false, "reads media durations/sizes"],
    ["yt-dlp", true, "optional — lets inputs be TikTok/IG/YouTube page links"],
  ])) {
    const v = toolVersion(tool);
    checks.push({ name: tool, ok: v !== null, optional, detail: v ?? `not found (${purpose})`, hint: TOOLS[tool].install });
  }

  const hf = hyperframesCommand();
  const bundled = hf.cmd === process.execPath;
  checks.push({
    name: "HyperFrames",
    ok: true,
    detail: bundled ? `${HYPERFRAMES_VERSION} (installed)` : `${HYPERFRAMES_VERSION} via npx (downloads on first render)`,
  });
  const chrome = await hyperframesBrowserCheck(root);
  if (chrome) checks.push(chrome);

  const p = projectPaths(root);
  const isProject = existsSync(p.templates) || existsSync(p.reels);
  if (isProject) {
    const ready = existsSync(join(p.fonts, "TikTokSans-Variable.ttf")) && existsSync(join(p.vendor, "gsap.min.js"));
    checks.push({
      name: "Project",
      ok: true,
      detail: ready ? "font + GSAP staged in assets/" : "assets/ will be prepared on the first `reelclaw make`",
    });
  }
  return checks;
}

/**
 * Ask HyperFrames whether its headless Chrome is ready.
 * @param {string} cwd
 * @returns {Promise<Check | null>}
 */
async function hyperframesBrowserCheck(cwd) {
  try {
    const hf = hyperframesCommand();
    const r = await run(hf.cmd, [...hf.args, "doctor", "--json"], { cwd: existsSync(cwd) ? cwd : process.cwd() });
    const json = JSON.parse(r.stdout.slice(r.stdout.indexOf("{")));
    const c = (json.checks ?? []).find((/** @type {any} */ x) => x.name === "Chrome");
    if (!c) return null;
    return {
      name: "Chrome",
      ok: Boolean(c.ok),
      optional: true,
      detail: c.ok ? "headless Chrome ready" : String(c.detail ?? "not installed"),
      hint: c.hint ?? "HyperFrames downloads it automatically on the first render",
    };
  } catch {
    return { name: "Chrome", ok: false, optional: true, detail: "could not run `hyperframes doctor`", hint: "it is downloaded automatically on the first render" };
  }
}
