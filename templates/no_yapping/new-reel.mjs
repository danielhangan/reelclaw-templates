#!/usr/bin/env node
/**
 * new-reel.mjs — "no yapping" split-screen tutorial reel.
 *
 * Format (3 videos):
 *   1. INTRO — a 9:16 clip fullscreen with the hook caption
 *      (e.g. putting the mouth tape on). Default 6s.
 *   2. SPLIT — 50/50 split screen for the rest of the reel:
 *      TYPING video (creator working) in the top half,
 *      DEMO screen recording in the bottom half,
 *      step captions changing at the seam. No voiceover.
 *
 * Usage:
 *   node new-reel.mjs \
 *     --intro footage/mouth-tape.mp4 \
 *     --typing footage/typing.mp4 \
 *     --demo clips/screen-recording.mov \
 *     --hook "making $10k but no yapping" \
 *     --step "go to claude" \
 *     --step "paste ur script :: 4" \
 *     --step "easyyy 10 bands" \
 *     --render
 *
 * - --intro-secs (default 6): fullscreen intro length. The intro and typing
 *   clips loop automatically if shorter than their segment.
 * - The demo plays full length by default (--demo-secs caps it, --demo-trim
 *   skips into it). Total = intro + demo segment.
 * - Steps are captions over the video: repeat --step "caption [:: secs]"
 *   (sequential, default --step-secs 3) or --step "caption :: start-end"
 *   (absolute window, e.g. "buy now :: 10-15"), or --steps steps.json with
 *   [{"caption","secs"?} | {"caption","at","until"}]. Sequential captions run
 *   from the split point (or from the previous caption's end); the last
 *   sequential one holds to the end of the reel (the payoff line).
 * - --demo-fit cover|contain (default cover): cover fills the bottom half,
 *   contain shows the whole recording on white.
 * - Audio is silent by default. --music <file|url> adds a track
 *   (--music-volume, --music-start); --intro-volume / --typing-volume /
 *   --demo-volume opt clip audio back in. Sources without an audio stream
 *   are skipped safely.
 * - Captions: TikTok Sans, white with black outline, static, auto-shrink.
 * - --render / --draft render renders/<name>.mp4 after generating.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}
function argAll(name) {
  const out = [];
  process.argv.forEach((a, i) => {
    if (a === `--${name}`) out.push(process.argv[i + 1]);
  });
  return out;
}
const flag = (name) => process.argv.includes(`--${name}`);

const introIn = arg("intro");
const typingIn = arg("typing");
const demoIn = arg("demo");
const hook = arg("hook");
if (!introIn || !typingIn || !demoIn || !hook) {
  console.error('Required: --intro <file|url> --typing <file|url> --demo <file|url> --hook "text"');
  process.exit(1);
}

const introSecs = parseFloat(arg("intro-secs", "6"));
const introTrim = parseFloat(arg("intro-trim", "0"));
const typingTrim = parseFloat(arg("typing-trim", "0"));
const demoTrim = parseFloat(arg("demo-trim", "0"));
const demoSecsArg = arg("demo-secs");
const demoFit = arg("demo-fit", "cover");
if (!["cover", "contain"].includes(demoFit)) {
  console.error("--demo-fit must be cover or contain");
  process.exit(1);
}
const stepSecsDefault = parseFloat(arg("step-secs", "3"));
const introVolume = parseFloat(arg("intro-volume", "0"));
const typingVolume = parseFloat(arg("typing-volume", "0"));
const demoVolume = parseFloat(arg("demo-volume", "0"));
const musicIn = arg("music");
const musicVolume = parseFloat(arg("music-volume", "1"));
const musicStart = parseFloat(arg("music-start", "0"));
const hookSize = parseFloat(arg("hook-size", "62"));
const stepSize = parseFloat(arg("step-size", "54"));

// captions over the split segment
let steps = [];
const stepsFile = arg("steps");
if (stepsFile) {
  steps = JSON.parse(readFileSync(stepsFile, "utf8"));
} else {
  steps = argAll("step").map((raw) => {
    const parts = raw.split("::").map((s) => s.trim());
    const time = parts[1];
    const range = time && /^\d+(\.\d+)?\s*-\s*\d+(\.\d+)?$/.test(time)
      ? time.split("-").map((n) => parseFloat(n))
      : null;
    return range
      ? { caption: parts[0], at: range[0], until: range[1] }
      : { caption: parts[0], secs: time ? parseFloat(time) : undefined };
  });
}

// next free yap-N unless --name given
function nextName() {
  const used = readdirSync(join(ROOT, "compositions"))
    .map((f) => /^yap-(\d+)\.html$/.exec(f))
    .filter(Boolean)
    .map((m) => parseInt(m[1], 10));
  return `yap-${(used.length ? Math.max(...used) : 0) + 1}`;
}
const name = arg("name", nextName());
if (!/^[a-z0-9-]+$/.test(name)) {
  console.error(`Invalid --name "${name}" (kebab-case only)`);
  process.exit(1);
}

function resolveMedia(input, label, kind = "video") {
  if (!/^https?:\/\//.test(input)) {
    if (!existsSync(input)) {
      console.error(`${label}: file not found: ${input}`);
      process.exit(1);
    }
    return input;
  }
  mkdirSync(join(ROOT, "assets"), { recursive: true });
  const directExt =
    kind === "audio" ? /\.(mp3|m4a|wav|aac|ogg)(\?|$)/i : /\.(mp4|mov|webm|m4v)(\?|$)/i;
  const isDirectFile = directExt.test(input);
  const fallbackExt = kind === "audio" ? ".mp3" : ".mp4";
  const out = join(
    "assets",
    `${name}-${label}${isDirectFile ? extname(new URL(input).pathname) : fallbackExt}`
  );
  const abs = join(ROOT, out);
  console.log(`Downloading ${label}: ${input}`);
  if (isDirectFile) {
    execFileSync("curl", ["-L", "--fail", "-o", abs, input], { stdio: "inherit" });
  } else {
    const probe = spawnSync("yt-dlp", ["--version"]);
    if (probe.error) {
      console.error(`${label}: "${input}" is a page link — install yt-dlp (brew install yt-dlp) or pass a direct file URL / local path.`);
      process.exit(1);
    }
    if (kind === "audio") {
      execFileSync(
        "yt-dlp",
        ["-x", "--audio-format", "mp3", "-o", abs.replace(/\.mp3$/, ".%(ext)s"), input],
        { stdio: "inherit" }
      );
    } else {
      execFileSync("yt-dlp", ["-f", "mp4", "-o", abs, input], { stdio: "inherit" });
    }
  }
  return out;
}

function stage(path, label, kind = "video") {
  const resolved = resolveMedia(path, label, kind);
  if (resolved.startsWith("assets/") || resolved.startsWith(join(ROOT, "assets"))) return resolved.replace(`${ROOT}/`, "");
  let target = join("assets", basename(resolved));
  let abs = join(ROOT, target);
  if (existsSync(abs)) {
    const identical = spawnSync("cmp", ["-s", resolved, abs]).status === 0;
    if (identical) return target;
    // same filename, different content (e.g. two "0729 (1).mp4" from different
    // folders) — stage under a per-reel, per-role name instead of reusing the
    // stale copy, which silently swapped one video for another
    console.warn(`⚠ ${label}: assets/${basename(resolved)} already exists with different content — staging as ${name}-${label}${extname(resolved)}`);
    target = join("assets", `${name}-${label}${extname(resolved)}`);
    abs = join(ROOT, target);
  }
  mkdirSync(join(ROOT, "assets"), { recursive: true });
  execFileSync("cp", ["-f", resolved, abs]);
  return target;
}

function probeDuration(rel) {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "format=duration", "-of", "csv=p=0",
    join(ROOT, rel),
  ]).toString().trim();
  return parseFloat(out);
}

function hasAudioStream(rel) {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-select_streams", "a",
    "-show_entries", "stream=codec_type", "-of", "csv=p=0",
    join(ROOT, rel),
  ]).toString().trim();
  return out.length > 0;
}

function audioVolumeFor(rel, requested, label) {
  if (requested <= 0) return 0;
  if (hasAudioStream(rel)) return requested;
  console.warn(`⚠ ${label} has no audio stream — ignoring its volume setting`);
  return 0;
}

// stage inputs
const intro = stage(introIn, "intro");
const typing = stage(typingIn, "typing");
const demo = stage(demoIn, "demo");
const music = musicIn ? stage(musicIn, "music", "audio") : null;

// timing
const r1 = (n) => Math.round(n * 10) / 10;
function loopLenOf(rel, trim, label) {
  const len = Math.floor((probeDuration(rel) - trim - 0.05) * 10) / 10;
  if (len <= 0.5) {
    console.error(`${label}: trim ${trim}s leaves under 0.5s of footage`);
    process.exit(1);
  }
  return len;
}
const introLoop = loopLenOf(intro, introTrim, "intro clip");
const typingLoop = loopLenOf(typing, typingTrim, "typing clip");
const demoAvail = loopLenOf(demo, demoTrim, "demo clip");
const demoSecs = demoSecsArg ? Math.min(parseFloat(demoSecsArg), demoAvail) : demoAvail;
const total = r1(introSecs + demoSecs);

const introVol = audioVolumeFor(intro, introVolume, "intro clip");
const typingVol = audioVolumeFor(typing, typingVolume, "typing clip");
const demoVol = audioVolumeFor(demo, demoVolume, "demo clip");
if (music && !hasAudioStream(music)) {
  console.error("music file has no audio stream");
  process.exit(1);
}
let musicDur = 0;
if (music) {
  const trackDur = probeDuration(music);
  if (musicStart >= trackDur) {
    console.error(`--music-start ${musicStart} exceeds track length (${trackDur.toFixed(1)}s)`);
    process.exit(1);
  }
  musicDur = Math.min(total, Math.floor((trackDur - musicStart) * 10) / 10);
  if (musicDur < total) console.warn(`⚠ music covers only ${musicDur}s of the ${total}s reel (ends early)`);
}
if (!music && introVol === 0 && typingVol === 0 && demoVol === 0) {
  console.warn("⚠ no --music and clip volumes are 0 — output will be silent (the format's default; add --music if unwanted)");
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// emit sequential looping <video> segments for one source between [from, until)
function loopSegments(src, cls, track, from, until, trim, loopLen) {
  let html = "";
  let t = from;
  let i = 0;
  while (t < until - 0.01) {
    const elapsed = (t - from) % loopLen;
    const d = r1(Math.min(loopLen - elapsed, until - t));
    html += `
        <video
          id="${name}-${cls}-${i}"
          class="${cls}"
          src="${src}"
          data-start="${r1(t)}"
          data-duration="${d}"
          data-media-start="${r1(trim + elapsed)}"
          data-track-index="${track}"
          muted
          playsinline
        ></video>`;
    t += d;
    i++;
  }
  return html;
}
const introMarkup = loopSegments(intro, "intro-full", 0, 0, introSecs, introTrim, introLoop);
const typingMarkup = loopSegments(typing, "typing-top", 4, introSecs, total, typingTrim, typingLoop);

// step captions over the split segment, sequential from the split point
let stepMarkup = "";
let cursor = introSecs;
const placed = [];
steps.forEach((s, i) => {
  let start, dur;
  if (s.at != null) {
    // absolute window: "caption :: 10-15" or {"at":10,"until":15}
    if (s.until == null || s.until <= s.at) {
      console.error(`step ${i + 1} ("${s.caption}"): bad range — need start-end with end > start`);
      process.exit(1);
    }
    start = s.at;
    dur = Math.min(s.until, total) - start;
    if (start >= total - 0.05) {
      console.warn(`⚠ step ${i + 1} ("${s.caption}") starts past the end of the reel (${total}s) — dropped`);
      return;
    }
    cursor = s.until;
  } else {
    // sequential: continues after the previous caption
    if (cursor >= total - 0.05) {
      console.warn(`⚠ step ${i + 1} ("${s.caption}") starts past the end of the reel — dropped`);
      return;
    }
    start = cursor;
    dur = Math.min(s.secs ?? stepSecsDefault, total - cursor);
    const isLast = i === steps.length - 1;
    if (isLast) dur = r1(total - cursor); // last sequential caption holds to the end
    cursor += dur;
  }
  stepMarkup += `
        <div id="${name}-cap-${i}" class="clip step-cap" data-start="${r1(start)}" data-duration="${r1(dur)}" data-track-index="${7 + i}">
          <div id="${name}-cap-${i}-wrap" class="cap-wrap">
            <span class="hook">${esc(s.caption)}</span>
          </div>
        </div>`;
  placed.push({ i, caption: s.caption, start: r1(start), dur: r1(dur) });
});

const composition = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${name}</title>
  </head>
  <body>
    <template>
      <style>
        @font-face {
          font-family: "TikTok Sans";
          src: url("assets/fonts/TikTokSans-Variable.ttf") format("truetype");
          font-weight: 300 900;
        }
        #root {
          position: absolute;
          inset: 0;
          width: 1080px;
          height: 1920px;
          overflow: hidden;
          background: #000;
        }
        .intro-full {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        /* 50/50 split: typing top half, demo bottom half */
        .typing-top {
          position: absolute;
          left: 0;
          top: 0;
          width: 1080px;
          height: 960px;
          object-fit: cover;
        }
        .demo-panel {
          position: absolute;
          left: 0;
          top: 960px;
          width: 1080px;
          height: 960px;
          background: #fff;
        }
        .demo-bottom {
          position: absolute;
          left: 0;
          top: 960px;
          width: 1080px;
          height: 960px;
          object-fit: ${demoFit};
          object-position: center;
        }
        /* hook caption: upper block of the fullscreen intro */
        .hook-cap {
          position: absolute;
          left: 180px;
          right: 180px;
          top: 380px;
          text-align: center;
        }
        /* step captions: straddle the 50/50 seam */
        .step-cap {
          position: absolute;
          left: 120px;
          right: 120px;
          top: 895px;
          text-align: center;
        }
        .cap-wrap {
          width: 100%;
        }
        .hook {
          display: inline;
          color: #ffffff;
          font-family: "TikTok Sans", sans-serif;
          font-weight: 700;
          font-size: ${stepSize}px;
          line-height: 1.35;
          letter-spacing: -0.5px;
          paint-order: stroke fill;
          -webkit-text-stroke: 8px #000;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
        }
        .hook-cap .hook {
          font-size: ${hookSize}px;
        }
      </style>

      <div
        id="root"
        data-composition-id="${name}"
        data-start="0"
        data-width="1080"
        data-height="1920"
        data-duration="${total}"
      >${introMarkup}${typingMarkup}
        <div id="${name}-demo-panel" class="clip demo-panel" data-start="${introSecs}" data-duration="${r1(demoSecs)}" data-track-index="1"></div>
        <video
          id="${name}-demo"
          class="demo-bottom"
          src="${demo}"
          data-start="${introSecs}"
          data-duration="${r1(demoSecs)}"
          data-media-start="${demoTrim}"
          data-track-index="2"
          muted
          playsinline
        ></video>
        <div id="${name}-hookcap" class="clip hook-cap" data-start="0" data-duration="${introSecs}" data-track-index="6">
          <div id="${name}-hookcap-wrap" class="cap-wrap">
            <span class="hook">${esc(hook)}</span>
          </div>
        </div>${stepMarkup}${
          introVol > 0
            ? `
        <audio
          id="${name}-intro-audio"
          src="${intro}"
          data-start="0"
          data-duration="${r1(Math.min(introLoop, introSecs))}"
          data-media-start="${introTrim}"
          data-track-index="40"
          data-volume="${introVol}"
        ></audio>`
            : ""
        }${
          typingVol > 0
            ? `
        <audio
          id="${name}-typing-audio"
          src="${typing}"
          data-start="${introSecs}"
          data-duration="${r1(Math.min(typingLoop, demoSecs))}"
          data-media-start="${typingTrim}"
          data-track-index="41"
          data-volume="${typingVol}"
        ></audio>`
            : ""
        }${
          demoVol > 0
            ? `
        <audio
          id="${name}-demo-audio"
          src="${demo}"
          data-start="${introSecs}"
          data-duration="${r1(demoSecs)}"
          data-media-start="${demoTrim}"
          data-track-index="42"
          data-volume="${demoVol}"
        ></audio>`
            : ""
        }${
          music
            ? `
        <audio
          id="${name}-music"
          src="${music}"
          data-start="0"
          data-duration="${musicDur}"
          data-media-start="${musicStart}"
          data-track-index="43"
          data-volume="${musicVolume}"
        ></audio>`
            : ""
        }
      </div>

      <script>
        window.__timelines = window.__timelines || {};
        (function () {
          // auto text sizing: hook fits the intro block, step captions stay
          // to one or two lines around the seam; floor 26px
          function fit(wrapId, base, maxH) {
            const wrap = document.getElementById(wrapId);
            if (!wrap) return;
            const span = wrap.querySelector(".hook");
            let size = base;
            span.style.fontSize = size + "px";
            while (size > 26 && wrap.getBoundingClientRect().height > maxH) {
              size -= 2;
              span.style.fontSize = size + "px";
            }
          }
          function fitAll() {
            fit("${name}-hookcap-wrap", ${hookSize}, 400);
${placed.map((p) => `            fit("${name}-cap-${p.i}-wrap", ${stepSize}, 240);`).join("\n")}
          }
          fitAll();
          if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);

          const tl = gsap.timeline({ paused: true });
          // captions are static by design: no entrance/exit transitions${
            music && musicDur >= total
              ? `
          tl.to("#${name}-music", { volume: 0, duration: 0.8 }, ${(total - 0.8).toFixed(2)});`
              : ""
          }
          window.__timelines["${name}"] = tl;
        })();
      </script>
    </template>
  </body>
</html>
`;

const host = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: 1080px; height: 1920px; overflow: hidden; background: #000; }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="host-${name}"
      data-start="0"
      data-duration="${total}"
      data-width="1080"
      data-height="1920"
    >
      <div
        id="${name}-host"
        data-composition-id="${name}"
        data-composition-src="compositions/${name}.html"
        data-start="0"
        data-duration="${total}"
        data-track-index="0"
        data-width="1080"
        data-height="1920"
      ></div>
    </div>

    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      window.__timelines["host-${name}"] = tl;
    </script>
  </body>
</html>
`;

writeFileSync(join(ROOT, "compositions", `${name}.html`), composition);
writeFileSync(join(ROOT, `host-${name}.html`), host);
console.log(`✔ compositions/${name}.html  (${introSecs}s intro + ${r1(demoSecs)}s split = ${total}s)`);
placed.forEach((p) => console.log(`   caption ${p.i + 1}: "${p.caption}" · ${p.start}s → ${r1(p.start + p.dur)}s`));
console.log(`✔ host-${name}.html`);

if (flag("render")) {
  const args = ["hyperframes", "render", "-c", `host-${name}.html`, "-o", `renders/${name}.mp4`];
  if (flag("draft")) args.push("--quality", "draft");
  console.log(`Rendering renders/${name}.mp4 …`);
  const r = spawnSync("npx", args, { cwd: ROOT, stdio: "inherit" });
  process.exit(r.status ?? 0);
} else {
  console.log(`Next: npx hyperframes render -c host-${name}.html -o renders/${name}.mp4`);
}
