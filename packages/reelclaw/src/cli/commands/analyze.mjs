// @ts-check
import { relative } from "node:path";
import { analyzeReference, compareWith, locateAnalysis } from "../../analyze/index.mjs";
import { ReelclawError } from "../../core/errors.mjs";
import { color, displayPath } from "../../core/log.mjs";
import { numberFlag } from "../args.mjs";

/** @type {import('../main.mjs').Command} */
export default {
  summary: "break a viral video into shots, frames, pacing (+ transcript, beats) to build a template from",
  usage: `
Usage
  reelclaw analyze <link|file> [flags]
  reelclaw analyze <your-render.mp4> --compare <analysis/slug>

Downloads the reference (TikTok / Instagram / YouTube / X via yt-dlp, or a direct
URL; a local file is read in place) and writes analysis/<slug>/:

  analysis.json      duration, size, fps, audio, shot list, pacing, metadata,
                     and a "format" block for you/the agent to fill in
  contact-sheet.png  one labelled keyframe per shot
  filmstrip.png      a frame every 0.5–2s (text and motion between cuts)
  shots/NNN.png      the keyframes, full size

analysis/ is git-ignored: never commit reference videos or frames (copyright).

Flags
  --slug <name>        output folder name (default: from the link, e.g. tiktok-73012…)
  --out <dir>          write somewhere else than analysis/<slug>/
  --source-url <url>   for a file you saved yourself: the link it came from (recorded only)
  --threshold <0-1>    scene-change sensitivity (default 0.3; 0.2 finds soft cuts)
  --transcribe         word-level transcript (hyperframes transcribe; first run downloads a model)
  --model <name>       Whisper model for --transcribe (tiny.en … large-v3)
  --beats              beat grid + BPM of the soundtrack (hyperframes beats)
  --refresh            download again even if analysis/<slug>/source.* exists
  --compare <analysis> also write compare.png: the reference (that analysis) vs. this video,
                       side by side at the same timestamps, plus pacing differences
  --json               print analysis.json (and the comparison) instead of a summary

Next
  look at the images, fill in "format" in analysis.json, then:
  reelclaw scaffold <template-id> --from analysis/<slug>`,
  options: {
    slug: { type: "string" },
    out: { type: "string" },
    "source-url": { type: "string" },
    threshold: { type: "string" },
    transcribe: { type: "boolean" },
    model: { type: "string" },
    beats: { type: "boolean" },
    refresh: { type: "boolean" },
    compare: { type: "string" },
    json: { type: "boolean" },
  },
  async run(ctx) {
    const v = ctx.args.values;
    const input = ctx.args.positionals[0];
    if (!input) throw new ReelclawError("what should I analyze?", { hint: "reelclaw analyze https://www.tiktok.com/@user/video/123  (or a local .mp4)" });
    if (ctx.args.positionals.length > 1) throw new ReelclawError("analyze takes one video at a time", { hint: "run it once per reference" });
    const sourceUrl = /** @type {string | undefined} */ (v["source-url"]);
    if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) throw new ReelclawError(`--source-url must be a link (got "${sourceUrl}")`);
    const referenceFile = v.compare ? locateAnalysis(String(v.compare), { root: ctx.root, cwd: ctx.cwd }) : undefined;

    const { dir, file, analysis: a } = await analyzeReference({
      input,
      root: ctx.root,
      cwd: ctx.cwd,
      out: v.out ? String(v.out) : undefined,
      slug: v.slug ? String(v.slug) : undefined,
      sourceUrl,
      threshold: numberFlag(v.threshold, "threshold"),
      transcribe: Boolean(v.transcribe),
      model: v.model ? String(v.model) : undefined,
      beats: Boolean(v.beats),
      refresh: Boolean(v.refresh),
      log: v.json ? undefined : ctx.log,
    });
    const comparison = referenceFile ? await compareWith({ dir, analysis: a }, referenceFile) : undefined;

    if (v.json) {
      console.log(JSON.stringify(comparison ? { analysis: a, comparison } : a, null, 2));
      return 0;
    }
    const at = (/** @type {string} */ p) => displayPath(ctx.cwd, p);
    const m = a.media;
    const p = a.pacing;
    const meta = [a.source.platform, a.source.uploader && `@${a.source.uploader}`, a.source.views !== undefined && `${a.source.views.toLocaleString("en")} views`].filter(Boolean).join(" · ");
    ctx.log.success(`analyzed ${a.source.url ?? a.source.input}${meta ? color.dim(`  ${meta}`) : ""}`);
    console.log(`  ${m.duration}s · ${m.width}×${m.height} (${m.aspect}) · ${m.fps}fps · ${m.hasAudio ? "sound" : "silent"}`);
    console.log(`  ${p.shots} shot(s) · avg ${p.avgShot}s · ${p.cutsPerMinute} cuts/min${p.firstCut !== null ? ` · first cut at ${p.firstCut}s` : ""}`);
    console.log(color.dim(`  cuts: ${a.shots.slice(1).map((s) => s.start).join(", ") || "none"}`));
    if (a.transcript) console.log(`  transcript: ${a.transcript.words.length} words — “${truncate(a.transcript.text, 90)}”`);
    if (a.beats) console.log(`  beats: ${a.beats.times.length}${a.beats.bpm ? ` · ${a.beats.bpm} bpm` : ""}`);
    else if (v.beats) console.log(color.dim("  beats: no steady beat (talking / ambient sound)"));
    if (!comparison) {
      console.log(`\n  ${color.bold("look at")}  ${at(`${dir}/${a.images.contactSheet}`)}  ${at(`${dir}/${a.images.filmstrip}`)}`);
      console.log(`  ${color.bold("then fill")} "format" in ${at(file)}`);
      console.log(`  ${color.bold("then run")}  reelclaw scaffold <template-id> --from ${relative(ctx.cwd, dir) || "."}`);
    } else {
      console.log(`\n${color.bold("compare")} ${at(comparison.image)} ${color.dim(`(reference left, yours right, every ${comparison.step}s)`)}`);
      if (!comparison.notes.length) ctx.log.success("pacing matches the reference (cuts within 0.15s, same length)");
      for (const n of comparison.notes) ctx.log.warn(n);
    }
    return 0;
  },
};

/** @param {string} s @param {number} n */
const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
