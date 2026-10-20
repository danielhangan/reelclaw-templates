#!/usr/bin/env node
// @ts-check
/**
 * Smoke-render templates from their example.json (CI and local):
 * make → draft render → ffprobe checks (1080x1920, 30fps, h264, declared
 * duration, audible when the composition has sound) → review images.
 *
 *   node scripts/smoke-render.mjs reaction-demo [more ids…] [--out .reelclaw/smoke] [--workers 2]
 *   node scripts/smoke-render.mjs --all
 *
 * Writes <out>/<id>/{<id>.mp4, frames.png, safe-zones.png, report.json} and
 * <out>/summary.json; appends a table to $GITHUB_STEP_SUMMARY when set.
 * Exit code 1 when any template fails. Needs fixtures: npm run fixtures.
 */
import { appendFileSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { checkRender, expectationsFor, frameStrip, frameTimes, probeRender } from "../packages/reelclaw/src/core/inspect.mjs";
import { makeExample } from "../packages/reelclaw/src/core/example.mjs";
import { ReelclawError } from "../packages/reelclaw/src/core/errors.mjs";
import { displayPath } from "../packages/reelclaw/src/core/log.mjs";
import { listTemplates } from "./changed-templates.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @typedef {object} SmokeReport
 * @property {string} id
 * @property {boolean} ok
 * @property {number} seconds        wall time for make + render
 * @property {string[]} problems
 * @property {string[]} warnings
 * @property {import('../packages/reelclaw/src/core/inspect.mjs').RenderInfo} [render]
 * @property {number[]} [frames]     strip sample times
 */

/**
 * @param {string} id
 * @param {{ out: string, workers: number, frames: number }} o
 * @returns {Promise<SmokeReport>}
 */
async function smoke(id, { out, workers, frames }) {
  const dir = join(out, id);
  await mkdir(dir, { recursive: true });
  const started = performance.now();
  /** @type {SmokeReport} */
  const report = { id, ok: false, seconds: 0, problems: [], warnings: [] };
  /** @type {Awaited<ReturnType<typeof makeExample>> | undefined} */
  let ex;
  try {
    ex = await makeExample({ template: id, root: ROOT, base: ROOT, render: true, workers });
    report.seconds = Math.round((performance.now() - started) / 100) / 10;
    const mp4 = join(dir, `${id}.mp4`);
    await copyFile(/** @type {string} */ (ex.made.output), mp4);
    await writeFile(join(dir, `${id}.html`), ex.html);
    const info = await probeRender(mp4);
    const check = checkRender(info, expectationsFor(ex.html));
    report.render = info;
    report.problems.push(...check.problems);
    report.warnings.push(...ex.made.warnings, ...check.warnings);
    report.frames = frameTimes(info.duration, frames);
    await frameStrip(mp4, report.frames, join(dir, "frames.png"), { height: 640 });
    await frameStrip(mp4, report.frames, join(dir, "safe-zones.png"), { height: 640, safeZones: true });
  } catch (err) {
    report.problems.push(err instanceof ReelclawError ? `${err.message}${err.hint ? ` (${err.hint})` : ""}` : String(/** @type {Error} */ (err)?.stack ?? err));
  } finally {
    await ex?.cleanup();
  }
  report.seconds ||= Math.round((performance.now() - started) / 100) / 10;
  report.ok = report.problems.length === 0;
  await writeFile(join(dir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

/**
 * Markdown table for the Actions job summary. Pure.
 * @param {SmokeReport[]} reports
 */
export function summaryMarkdown(reports) {
  const rows = reports.map((r) => {
    const i = r.render;
    const spec = i ? `${i.width}x${i.height} · ${i.fps}fps · ${i.duration}s · ${i.hasAudio ? `${i.meanVolume} dB` : "no audio"}` : "—";
    const notes = [...r.problems.map((p) => `❌ ${p}`), ...r.warnings.map((w) => `⚠️ ${w}`)].join("<br>").replaceAll("|", "\\|") || "";
    return `| ${r.ok ? "✅" : "❌"} | \`${r.id}\` | ${spec} | ${r.seconds}s | ${notes} |`;
  });
  return `### Smoke renders\n\n| | template | render | time | notes |\n|---|---|---|---|---|\n${rows.join("\n")}\n\nFrames, safe-zone strips and MP4s are in the job's artifacts.\n`;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      all: { type: "boolean" },
      out: { type: "string", default: ".reelclaw/smoke" },
      workers: { type: "string", default: "2" },
      frames: { type: "string", default: "4" },
    },
  });
  const ids = values.all ? listTemplates() : positionals.flatMap((p) => p.split(/[\s,]+/)).filter(Boolean);
  if (!ids.length) {
    console.error("usage: node scripts/smoke-render.mjs <template> [<template> …] | --all");
    return 2;
  }
  const out = resolve(values.out ?? ".reelclaw/smoke");
  const opts = { out, workers: Number(values.workers), frames: Number(values.frames) };
  /** @type {SmokeReport[]} */
  const reports = [];
  for (const id of ids) {
    console.log(`\n▶ ${id}`);
    const r = await smoke(id, opts);
    reports.push(r);
    for (const w of r.warnings) console.log(`  ⚠ ${w}`);
    for (const p of r.problems) console.log(`  ✖ ${p}`);
    console.log(`${r.ok ? "✓" : "✖"} ${id} (${r.seconds}s) → ${displayPath(process.cwd(), join(out, id))}`);
    if (!r.ok && process.env.GITHUB_ACTIONS) console.log(`::error title=smoke render ${id}::${r.problems.join(" · ").replaceAll("\n", " ")}`);
  }
  await writeFile(join(out, "summary.json"), `${JSON.stringify(reports, null, 2)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMarkdown(reports));
  const failed = reports.filter((r) => !r.ok).length;
  console.log(`\n${failed ? `✖ ${failed}/${reports.length} failed` : `✓ ${reports.length} rendered OK`}`);
  return failed ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = await main();
