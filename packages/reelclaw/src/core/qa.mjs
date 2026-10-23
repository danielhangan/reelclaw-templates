// @ts-check
/**
 * `reelclaw qa`: the review pass before a reel is delivered. Writes the frames
 * a reviewer (human or agent) must look at, plus measurements, into one folder:
 *
 *   NN-<t>s.png        540x960 frames, the text safe band outlined. For a reel
 *                      made by the engine the times come from its composition
 *                      (reels/<name>.html): 0.0/0.5/1.0s (scroll-stop, hook
 *                      readable), 0.2s before + 0.5s after every hard cut, the
 *                      middle of every caption window, the last frame
 *   font-check.png     full-resolution crop of the first caption's region
 *   contact-sheet.png  2 frames per second, left to right
 *   report.txt / .json resolution, fps, duration vs the composition, audio level
 *                      (or SILENT), music tail fade, black + frozen frames, and
 *                      the render log's silent-failure warnings (render-log.mjs)
 *
 * Problems (wrong canvas/length, silence when the composition has sound, black
 * frames, render warnings) fail QA; warnings are listed for a human to judge.
 */
import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { ReelclawError } from "./errors.mjs";
import { CANVAS, SAFE_BAND } from "./geometry.mjs";
import { audioLevel, checkRender, contactSheet, cropFrame, expectationsFor, frameStrip, probeRender, SILENCE_DB } from "./inspect.mjs";
import { displayPath } from "./log.mjs";
import { formatRenderWarnings, scanRenderLog } from "./render-log.mjs";
import { declaredDuration, renderLogPath } from "./render.mjs";

/** @typedef {import('./geometry.mjs').Box} Box */
/** @typedef {import('./inspect.mjs').Segment} Segment */
/** @typedef {import('./render-log.mjs').RenderWarning} RenderWarning */
/** @typedef {import('./log.mjs').Logger} Logger */

/** Height of each QA frame (half the canvas: 540x960). */
export const QA_FRAME_HEIGHT = CANVAS.height / 2;
/** Most individual frames written; extra cut/caption frames are thinned evenly (the contact sheet has everything). */
export const MAX_QA_FRAMES = 32;
/** The music tail check measures the last TAIL_SECONDS… */
export const TAIL_SECONDS = 0.5;
/** …which must sit at least this many dB below the reel's mean when the music fades out. */
export const TAIL_FADE_DB = 8;
/** Black frames fail QA from this many seconds in total (or any black at the very start); shorter is a warning. */
export const BLACK_FAIL_SECONDS = 0.3;
/** Contact sheets keep at most this many tiles (long reels get fewer frames per second). */
const MAX_SHEET_TILES = 64;

// ───────────────────────── composition → timeline facts (pure) ─────────────────────────

/** @typedef {'video'|'image'|'audio'|'caption'|'html'|'solid'} CompKind */

/**
 * One timed element of a compiled reel.
 * @typedef {object} CompClip
 * @property {string} id
 * @property {CompKind} kind      `caption` also covers html() clips that hold text (.rc-cap: karaoke, nativeText)
 * @property {number} start
 * @property {number} end
 * @property {Box} [box]          from the element's left/top/width/height (canvas px for top-level elements)
 * @property {number} [fadeOut]   data-fade-out (sound)
 * @property {number} [volume]    data-volume
 */

/** @typedef {{ duration: number | null, clips: CompClip[] }} Composition */

/**
 * Read the timing a compiled reel declares: every element with data-start /
 * data-duration (also after hand edits — the HTML is what gets rendered). Pure.
 * @param {string} html reels/<name>.html
 * @returns {Composition}
 */
export function parseComposition(html) {
  const at = html.search(/<body\b/i);
  const markup = html
    .slice(Math.max(0, at))
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  const tags = [...markup.matchAll(/<(video|img|audio|div)\b([^>]*)>/gi)].map((m) => ({ m, attrs: parseAttrs(m[2]) }));
  /** @type {CompClip[]} */
  const clips = [];
  tags.forEach(({ m, attrs }, i) => {
    if ("data-composition-id" in attrs) return;
    const start = Number(attrs["data-start"]);
    const duration = Number(attrs["data-duration"]);
    if (!("data-start" in attrs) || !Number.isFinite(start) || !(duration > 0)) return;
    const tag = m[1].toLowerCase();
    const cls = (attrs.class ?? "").split(/\s+/);
    /** @type {CompKind} */
    let kind;
    if (tag === "video") kind = "video";
    else if (tag === "img") kind = "image";
    else if (tag === "audio") kind = "audio";
    else if (cls.includes("rc-cap")) kind = "caption";
    else if (cls.includes("rc-html")) {
      // an html() clip: text when it wraps a .rc-cap (karaoke chunk, nativeText)
      const next = tags.slice(i + 1).find((t) => "data-start" in t.attrs);
      const inner = markup.slice(/** @type {number} */ (m.index) + m[0].length, next ? next.m.index : undefined);
      kind = /class="[^"]*\brc-cap\b/.test(inner) ? "caption" : "html";
    } else kind = /background/i.test(attrs.style ?? "") ? "solid" : "html";
    /** @type {CompClip} */
    const clip = { id: attrs.id ?? `${kind}-${clips.length + 1}`, kind, start: r3(start), end: r3(start + duration) };
    const box = boxOf(attrs.style ?? "");
    if (box) clip.box = box;
    if (attrs["data-fade-out"] !== undefined) clip.fadeOut = Number(attrs["data-fade-out"]) || 0;
    if (attrs["data-volume"] !== undefined) clip.volume = Number(attrs["data-volume"]);
    clips.push(clip);
  });
  return { duration: declaredDuration(html), clips };
}

/**
 * Hard cuts: where a video or image clip starts or ends inside the reel (shot
 * changes, loop seams, overlays appearing). Pure.
 * @param {Composition} comp
 * @returns {number[]} sorted seconds, one per moment (clips cut together count once)
 */
export function hardCuts(comp) {
  const duration = comp.duration ?? Math.max(0, ...comp.clips.map((c) => c.end));
  const times = comp.clips
    .filter((c) => c.kind === "video" || c.kind === "image")
    .flatMap((c) => [c.start, c.end])
    .filter((t) => t > 0.1 && t < duration - 0.1);
  return dedupeTimes(times, 0.05);
}

/**
 * Caption windows (caption() clips and text html() clips), in time order. Pure.
 * @param {Composition} comp
 * @returns {{ id: string, start: number, end: number, box?: Box }[]}
 */
export function captionWindows(comp) {
  return comp.clips
    .filter((c) => c.kind === "caption")
    .map(({ id, start, end, box }) => (box ? { id, start, end, box } : { id, start, end }))
    .sort((a, b) => a.start - b.start);
}

/**
 * The background music track: a sound that runs to the end of the reel with a
 * fade-out (music()), or null. Pure.
 * @param {Composition} comp
 */
export function musicTrack(comp) {
  const end = comp.duration ?? Math.max(0, ...comp.clips.map((c) => c.end));
  return comp.clips.find((c) => c.kind === "audio" && (c.fadeOut ?? 0) > 0 && (c.volume ?? 1) > 0 && Math.abs(c.end - end) <= 0.15) ?? null;
}

/**
 * @typedef {object} QaFrame
 * @property {number} time      seconds
 * @property {string[]} reasons why this moment is checked
 * @property {string} file      file name inside the QA folder
 */

/**
 * Which frames to review. Pure.
 * @param {object} o
 * @param {number} o.duration       seconds of video
 * @param {number[]} [o.cuts]       hard cuts (seconds)
 * @param {{ id: string, start: number, end: number }[]} [o.captions]
 * @param {number} [o.fps]          default CANVAS.fps
 * @param {number} [o.maxFrames]    default MAX_QA_FRAMES
 * @returns {{ frames: QaFrame[], skipped: number }} frames in time order; `skipped` cut/caption frames dropped by the cap
 */
export function qaFramePlan({ duration, cuts = [], captions = [], fps = CANVAS.fps, maxFrames = MAX_QA_FRAMES }) {
  if (!(duration > 0)) return { frames: [], skipped: 0 };
  const last = lastFrameTime(duration, fps);
  const clamp = (/** @type {number} */ t) => r2(Math.min(last, Math.max(0, t)));
  /** @type {{ time: number, reason: string, fixed: boolean }[]} */
  const wanted = [
    { time: 0, reason: "first frame: does it stop the scroll?", fixed: true },
    { time: clamp(0.5), reason: "0.5s: hook on screen", fixed: true },
    { time: clamp(1), reason: "1.0s: hook fully readable", fixed: true },
    { time: last, reason: "last frame: does the payoff land?", fixed: true },
  ];
  for (const c of dedupeTimes(cuts, 0.05)) {
    wanted.push({ time: clamp(c - 0.2), reason: `0.2s before the cut at ${fmt(c)}s`, fixed: false });
    wanted.push({ time: clamp(c + 0.5), reason: `0.5s after the cut at ${fmt(c)}s`, fixed: false });
  }
  for (const cap of captions) {
    if (cap.start >= duration) continue;
    wanted.push({ time: clamp((cap.start + Math.min(cap.end, duration)) / 2), reason: `caption "${cap.id}" (${fmt(cap.start)}–${fmt(cap.end)}s)`, fixed: false });
  }

  // one frame per moment: merge requests within a frame of each other
  /** @type {{ time: number, reasons: string[], fixed: boolean }[]} */
  const merged = [];
  for (const w of [...wanted].sort((a, b) => a.time - b.time)) {
    const near = merged.find((m) => Math.abs(m.time - w.time) < 1 / fps);
    if (near) {
      if (!near.reasons.includes(w.reason)) near.reasons.push(w.reason);
      near.fixed ||= w.fixed;
    } else merged.push({ time: w.time, reasons: [w.reason], fixed: w.fixed });
  }

  let keep = merged;
  let skipped = 0;
  if (merged.length > maxFrames) {
    const fixed = merged.filter((m) => m.fixed);
    const rest = merged.filter((m) => !m.fixed);
    const budget = Math.max(0, maxFrames - fixed.length);
    const picked = budget >= rest.length ? rest : Array.from({ length: budget }, (_, i) => rest[Math.floor(((i + 0.5) * rest.length) / budget)]);
    skipped = rest.length - picked.length;
    keep = [...fixed, ...picked].sort((a, b) => a.time - b.time);
  }
  const frames = keep.map((m, i) => ({ time: m.time, reasons: m.reasons, file: `${String(i + 1).padStart(2, "0")}-${m.time.toFixed(2)}s.png` }));
  return { frames, skipped };
}

/**
 * Time of the last frame of a `duration`-second video at `fps` (a hair early,
 * so a seek lands inside it). Pure.
 * @param {number} duration
 * @param {number} [fps]
 */
export function lastFrameTime(duration, fps = CANVAS.fps) {
  const frames = Math.max(1, Math.round(duration * fps));
  return r2(Math.max(0, (frames - 1) / fps - 0.005));
}

// ───────────────────────── running QA ─────────────────────────

/**
 * @typedef {object} QaTarget
 * @property {string} name        reel name (or the video's base name)
 * @property {string} video       absolute MP4 path
 * @property {string | null} html absolute reels/<name>.html when the video is an engine reel
 * @property {string} out         default QA folder: <renders>/qa/<name>
 * @property {string} renderLog   where the render log would be (<video>.render.log)
 */

/**
 * Resolve `reelclaw qa <reel-name | path.mp4>`.
 * @param {{ root: string, target: string, cwd?: string }} o
 * @returns {QaTarget}
 */
export function resolveQaTarget({ root, target, cwd = process.cwd() }) {
  const looksLikeFile = /\.(mp4|mov|m4v|webm)$/i.test(target) || /[\\/]/.test(target.replace(/^reels[\\/]/, ""));
  if (looksLikeFile) {
    const video = [resolve(cwd, target), resolve(root, target)].find((p) => existsSync(p) && statSync(p).isFile());
    if (!video) throw new ReelclawError(`video not found: ${target}`, { hint: "pass a rendered MP4, or a reel name from reels/" });
    const name = basename(video, extname(video));
    // an engine reel when it sits in <project>/renders/ next to <project>/reels/<name>.html
    const html = [join(dirname(video), "..", "reels", `${name}.html`), isInside(video, root) ? join(root, "reels", `${name}.html`) : ""]
      .find((p) => p && existsSync(p));
    return { name, video, html: html ? resolve(html) : null, out: join(dirname(video), "qa", name), renderLog: renderLogPath(video) };
  }
  const name = basename(target).replace(/\.(html|json)$/i, "");
  const html = join(root, "reels", `${name}.html`);
  if (!existsSync(html)) {
    throw new ReelclawError(`no reel named "${name}" in ${displayPath(cwd, root)}`, { hint: "reelclaw qa <name> takes a reel from reels/ (or pass a path to any .mp4)" });
  }
  const video = join(root, "renders", `${name}.mp4`);
  if (!existsSync(video)) throw new ReelclawError(`reels/${name}.html has not been rendered yet`, { hint: `reelclaw render ${name} --draft, then reelclaw qa ${name}` });
  return { name, video, html, out: join(root, "renders", "qa", name), renderLog: renderLogPath(video) };
}

/**
 * @typedef {object} QaReport
 * @property {boolean} ok                 no problems
 * @property {string} video
 * @property {string | null} reel         the composition used for timing (timeline-aware) or null
 * @property {string} out
 * @property {{ width: number, height: number, fps: number, duration: number, expectedDuration: number | null, videoCodec: string, pixFmt: string }} format
 * @property {{ hasAudio: boolean, meanVolume: number | null, maxVolume: number | null, silent: boolean, expected: boolean | null,
 *   music: string | null, tail: { seconds: number, meanVolume: number | null, belowMean: number | null } | null }} audio
 * @property {Segment[]} black
 * @property {(Segment & { during: string[], expected: boolean })[]} freezes  `during`: videos playing then; `expected`: no video on screen
 * @property {number[]} cuts
 * @property {{ id: string, start: number, end: number }[]} captions
 * @property {QaFrame[]} frames            files are absolute paths
 * @property {number} skippedFrames
 * @property {{ file: string, caption: string | null, time: number }} fontCheck
 * @property {{ file: string, fps: number, frames: number }} contactSheet
 * @property {string | null} renderLog    null when there is no render log next to the video
 * @property {RenderWarning[]} renderWarnings
 * @property {string[]} problems
 * @property {string[]} warnings
 * @property {string} instruction
 */

/**
 * Run QA on a rendered video and write the review folder.
 * @param {object} o
 * @param {string} o.video          MP4 to check
 * @param {string | null} [o.html]  its composition (reels/<name>.html): timeline-aware frames and expectations
 * @param {string} o.out            folder for frames + reports (created; previous QA files in it are replaced)
 * @param {number[]} [o.cuts]       extra cut times to check (seconds) — the only cuts for a plain MP4
 * @param {string | null} [o.renderLog]  render log to scan (default <video>.render.log when it exists)
 * @param {string} [o.cwd]          for display paths in report.txt
 * @returns {Promise<QaReport>}
 */
export async function qaReel({ video, html = null, out, cuts: extraCuts = [], renderLog, cwd = process.cwd() }) {
  if (!existsSync(video)) throw new ReelclawError(`video not found: ${video}`);
  const info = await probeRender(video);
  if (!(info.duration > 0) || !info.width) throw new ReelclawError(`${displayPath(cwd, video)} has no video to check`, { hint: "is the render complete? re-render it" });
  const source = html ? await readFile(html, "utf8") : null;
  const comp = source ? parseComposition(source) : null;
  const expect = source ? expectationsFor(source) : {};

  const cuts = dedupeTimes([...(comp ? hardCuts(comp) : []), ...extraCuts.filter((t) => t > 0 && t < info.duration)], 0.05);
  const captions = comp ? captionWindows(comp) : [];
  const plan = qaFramePlan({ duration: info.duration, cuts, captions, fps: info.fps || CANVAS.fps });

  await mkdir(out, { recursive: true });
  await clearQaFiles(out);

  // frames: 540x960 with the safe band outlined
  /** @type {QaFrame[]} */
  const frames = plan.frames.map((f) => ({ ...f, file: join(out, f.file) }));
  await pool(frames, 4, (f) => frameStrip(video, [f.time], f.file, { height: QA_FRAME_HEIGHT, safeZones: true, shade: false }));

  // font check: the first caption's region at the middle of its window, full resolution
  const firstCap = captions.find((c) => c.start < info.duration);
  const lastT = lastFrameTime(info.duration, info.fps || CANVAS.fps);
  const fontTime = firstCap ? r2(Math.min(lastT, (firstCap.start + Math.min(firstCap.end, info.duration)) / 2)) : r2(Math.min(1, lastT));
  const fontFile = await cropFrame(video, fontTime, firstCap?.box ?? SAFE_BAND, join(out, "font-check.png"));

  const sheetFps = Math.min(2, Math.max(0.25, Math.floor((MAX_SHEET_TILES / info.duration) * 4) / 4));
  const sheet = await contactSheet(video, join(out, "contact-sheet.png"), { duration: info.duration, fps: sheetFps });

  // audio: level, silence, the music tail
  const silent = !info.hasAudio || info.meanVolume === null || info.meanVolume < SILENCE_DB;
  const music = comp ? musicTrack(comp) : null;
  const tail = info.hasAudio && info.duration > TAIL_SECONDS * 2 ? await audioLevel(video, { from: info.duration - TAIL_SECONDS }) : null;
  const belowMean = tail && info.meanVolume !== null ? (tail.mean === null ? Infinity : r1(info.meanVolume - tail.mean)) : null;

  // render log: silent failures
  const logFile = renderLog === undefined ? (existsSync(renderLogPath(video)) ? renderLogPath(video) : null) : renderLog;
  const renderWarnings = logFile && existsSync(logFile) ? scanRenderLog(await readFile(logFile, "utf8")) : [];

  // freezes: expected when no video is on screen (stills, solid cards)
  const videos = comp ? comp.clips.filter((c) => c.kind === "video") : [];
  const freezes = (info.freezes ?? []).map((f) => {
    const during = [...new Set(videos.filter((v) => v.start < f.end - 0.1 && v.end > f.start + 0.1).map((v) => v.id))];
    return { ...f, during, expected: Boolean(comp) && during.length === 0 };
  });
  const black = info.black ?? [];

  /** @type {string[]} */
  const problems = [];
  /** @type {string[]} */
  const warnings = [];
  // format, length and audio presence; black frames are judged below with QA's stricter rule
  const base = checkRender({ ...info, blackSeconds: 0 }, expect);
  problems.push(...base.problems);
  warnings.push(...base.warnings);
  const blackTotal = r2(black.reduce((s, b) => s + b.duration, 0));
  if (black.length) {
    const where = black.map((b) => `${fmt(b.start)}–${fmt(b.end)}s`).join(", ");
    const msg = `black frames at ${where} (${blackTotal}s) — a clip failed to load, ran out, or starts late`;
    if (blackTotal >= BLACK_FAIL_SECONDS || black.some((b) => b.start <= 0.05)) problems.push(msg);
    else warnings.push(msg);
  }
  for (const f of freezes.filter((x) => !x.expected)) {
    const on = f.during.length ? ` while ${f.during.map((id) => `"${id}"`).join(", ")} ${f.during.length === 1 ? "plays" : "play"}` : "";
    warnings.push(`picture frozen ${fmt(f.start)}–${fmt(f.end)}s (${f.duration}s)${on} — fine for a static screen recording; wrong if footage ran out or stalled`);
  }
  if (silent && !expect.audible) warnings.push("the reel is SILENT — fine only if a sound will be added in-app");
  if (music && !silent && belowMean !== null && belowMean < TAIL_FADE_DB) {
    warnings.push(`music does not fade out: the last ${TAIL_SECONDS}s is only ${belowMean} dB below the mean (expect ≥ ${TAIL_FADE_DB} dB) — did the fade on "${music.id}" run? is the track shorter than the reel?`);
  }
  for (const w of renderWarnings) problems.push(renderWarningProblem(w));
  if (html && statSync(html).mtimeMs > statSync(video).mtimeMs + 1000) {
    warnings.push(`${displayPath(cwd, html)} changed after this render — re-render before judging`);
  }

  /** @type {QaReport} */
  const report = {
    ok: problems.length === 0,
    video,
    reel: html,
    out,
    format: { width: info.width, height: info.height, fps: info.fps, duration: info.duration, expectedDuration: expect.duration ?? null, videoCodec: info.videoCodec, pixFmt: info.pixFmt },
    audio: {
      hasAudio: info.hasAudio,
      meanVolume: info.meanVolume,
      maxVolume: info.maxVolume,
      silent,
      expected: source ? Boolean(expect.audible) : null,
      music: music?.id ?? null,
      tail: tail ? { seconds: TAIL_SECONDS, meanVolume: tail.mean, belowMean: belowMean === Infinity ? null : belowMean } : null,
    },
    black,
    freezes,
    cuts,
    captions: captions.map(({ id, start, end }) => ({ id, start, end })),
    frames,
    skippedFrames: plan.skipped,
    fontCheck: { file: fontFile, caption: firstCap?.id ?? null, time: fontTime },
    contactSheet: { file: sheet.out, fps: sheet.fps, frames: sheet.frames },
    renderLog: logFile && existsSync(logFile) ? logFile : null,
    renderWarnings,
    problems,
    warnings,
    instruction: "look at every frame before delivering",
  };
  await writeFile(join(out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(out, "report.txt"), `${formatQaReport(report, { cwd })}\n`);
  return report;
}

/**
 * report.txt: measurements, verdict, then every image to look at. Pure.
 * @param {QaReport} r
 * @param {{ cwd?: string }} [o]
 */
export function formatQaReport(r, { cwd = process.cwd() } = {}) {
  const p = (/** @type {string} */ f) => displayPath(cwd, f);
  const f = r.format;
  const b = SAFE_BAND;
  const db = (/** @type {number | null} */ v) => (v === null ? "-inf" : `${v}`);
  const okMark = (/** @type {boolean} */ ok) => (ok ? "ok" : "WRONG");
  const canvasOk = f.width === CANVAS.width && f.height === CANVAS.height && Math.abs(f.fps - CANVAS.fps) < 0.01;
  const lines = [
    `reelclaw qa — ${p(r.video)}`,
    `reel:        ${r.reel ? `${p(r.reel)} (timeline-aware: ${plural(r.cuts.length, "cut")}, ${plural(r.captions.length, "caption")})` : "plain video — fixed frame times (add --cut <s> for each cut)"}`,
    `canvas:      ${f.width}x${f.height} · ${f.fps}fps · ${f.videoCodec} ${f.pixFmt}   ${okMark(canvasOk)} (expect ${CANVAS.width}x${CANVAS.height} · ${CANVAS.fps}fps)`,
    `duration:    ${f.duration}s${f.expectedDuration !== null ? ` (composition: ${f.expectedDuration}s)` : ""}`,
    `audio:       ${!r.audio.hasAudio ? "no audio stream — SILENT" : r.audio.silent ? `SILENT (mean ${db(r.audio.meanVolume)} dB)` : `mean ${db(r.audio.meanVolume)} dB, max ${db(r.audio.maxVolume)} dB`}${r.audio.expected === true ? " · the composition has sound" : r.audio.expected === false ? " · the composition is silent" : ""}`,
    `music tail:  ${!r.audio.tail ? "n/a" : `last ${r.audio.tail.seconds}s ${db(r.audio.tail.meanVolume)} dB${r.audio.tail.belowMean !== null ? ` (${r.audio.tail.belowMean} dB below the mean)` : ""}${r.audio.music ? `; "${r.audio.music}" fades out → expect ≥ ${TAIL_FADE_DB} dB below` : ""}`}`,
    `black:       ${r.black.length ? r.black.map((s) => `${fmt(s.start)}–${fmt(s.end)}s`).join(", ") : "none"}`,
    `freezes:     ${r.freezes.length ? r.freezes.map((s) => `${fmt(s.start)}–${fmt(s.end)}s${s.expected ? " (no video on screen: expected)" : s.during.length ? ` (${s.during.join(", ")})` : ""}`).join(", ") : "none"}`,
    `render log:  ${r.renderLog ? `${p(r.renderLog)} — ${r.renderWarnings.length ? plural(r.renderWarnings.length, "warning") : "no warnings"}` : "none next to the video (rendered outside reelclaw?)"}`,
  ];
  if (r.reel) {
    lines.push(`cuts:        ${r.cuts.length ? r.cuts.map((c) => `${fmt(c)}s`).join(", ") : "none"}`);
    lines.push(`captions:    ${r.captions.length ? r.captions.map((c) => `${c.id} ${fmt(c.start)}–${fmt(c.end)}s`).join(", ") : "none"}`);
  }
  if (r.renderWarnings.length) lines.push("", formatRenderWarnings(r.renderWarnings, { reel: r.reel ? p(r.reel) : undefined, logFile: r.renderLog ? p(r.renderLog) : undefined }));
  lines.push("");
  if (r.problems.length) lines.push("PROBLEMS — fix before delivering:", ...r.problems.map((x) => `  ✖ ${x}`));
  if (r.warnings.length) lines.push("WARNINGS — look, then decide:", ...r.warnings.map((x) => `  ⚠ ${x}`));
  if (!r.problems.length && !r.warnings.length) lines.push("No problems measured. The frames still need a look.");
  lines.push(
    "",
    `Frames (540x960; green box = text safe band x ${b.x}–${b.x + b.w}, y ${b.y}–${b.y + b.h}: every caption must sit inside it):`,
    ...r.frames.map((fr) => `  ${p(fr.file)}   ${fr.reasons.join("; ")}`),
  );
  if (r.skippedFrames) lines.push(`  (${r.skippedFrames} more cut/caption moments are only in the contact sheet)`);
  lines.push(
    `  ${p(r.fontCheck.file)}   full-res ${r.fontCheck.caption ? `region of caption "${r.fontCheck.caption}"` : "text band"} at ${fmt(r.fontCheck.time)}s: TikTok Sans is compact with a tall x-height; a wide, loose fallback font means the font failed`,
    `  ${p(r.contactSheet.file)}   ${r.contactSheet.frames} frames, ${r.contactSheet.fps} per second, left to right`,
    "",
    `${r.ok ? "QA passed the measurable checks" : `QA FAILED (${plural(r.problems.length, "problem")})`} — ${r.instruction}.`,
  );
  return lines.join("\n");
}

/**
 * How a render-log warning is listed among a QA report's problems. Pure.
 * @param {RenderWarning} w
 */
export const renderWarningProblem = (w) => `render warning: ${w.message}`;

// ───────────────────────── helpers ─────────────────────────

/** Remove the files a previous QA run wrote (so stale frames never linger). @param {string} dir */
async function clearQaFiles(dir) {
  const ours = /^(\d{2}-\d+\.\d{2}s\.png|font-check\.png|contact-sheet\.png|report\.(txt|json))$/;
  for (const f of await readdir(dir)) if (ours.test(f)) await rm(join(dir, f), { force: true });
}

/**
 * Run `fn` over `items` with at most `n` at a time.
 * @template T
 * @param {T[]} items
 * @param {number} n
 * @param {(item: T) => Promise<unknown>} fn
 */
async function pool(items, n, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

/**
 * Sorted unique times; times within `eps` of the previous kept one are dropped. Pure.
 * @param {number[]} times
 * @param {number} eps
 */
export function dedupeTimes(times, eps) {
  /** @type {number[]} */
  const out = [];
  for (const t of [...times].sort((a, b) => a - b)) if (!out.length || t - out[out.length - 1] > eps) out.push(r3(t));
  return out;
}

/** @param {string} s attribute text of a tag */
function parseAttrs(s) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const m of s.matchAll(/([^\s=/"'>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return out;
}

/** left/top/width/height in px from an inline style. @param {string} style @returns {Box | null} */
function boxOf(style) {
  const px = (/** @type {string} */ k) => {
    const m = new RegExp(`(?:^|;|\\s)${k}\\s*:\\s*(-?[\\d.]+)px`).exec(style);
    return m ? Number(m[1]) : null;
  };
  const [x, y, w, h] = [px("left"), px("top"), px("width"), px("height")];
  return x !== null && y !== null && w !== null && h !== null ? { x, y, w, h } : null;
}

/** @param {string} child @param {string} parent */
function isInside(child, parent) {
  const rel = relative(resolve(parent), resolve(child));
  return Boolean(rel) && !rel.startsWith("..") && !rel.startsWith(sep) && !/^[A-Za-z]:/.test(rel);
}

/** @param {number} n @param {string} word */
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
/** Seconds for messages: "3", "2.8", "8.86". @param {number} t */
const fmt = (t) => `${Math.round(t * 100) / 100}`;
const r1 = (/** @type {number} */ n) => Math.round(n * 10) / 10;
const r2 = (/** @type {number} */ n) => Math.round(n * 100) / 100;
const r3 = (/** @type {number} */ n) => Math.round(n * 1000) / 1000;
