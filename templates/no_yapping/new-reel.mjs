#!/usr/bin/env node
/**
 * new-reel.mjs — "no yapping" step-tutorial reel.
 *
 * Format: creator footage fullscreen with a hook caption, then N silent steps —
 * each step slides a full-width screen-recording panel over the bottom ~57% of
 * the frame with a short imperative caption at the seam. No voiceover.
 *
 * Usage:
 *   node new-reel.mjs \
 *     --creator <file-or-url> \
 *     --hook "making $10k but no yapping" \
 *     --step "go to claude :: clips/claude.mov" \
 *     --step "paste ur script :: clips/paste.mov :: 4" \
 *     --step "easyyy 10 bands :: clips/revenue.mov" \
 *     --render
 *
 * Steps: repeat --step "caption :: clip [:: secs [:: trim]]", or pass
 * --steps steps.json with [{"caption","clip","secs"?,"trim"?}, ...].
 *
 * - --hook-secs (default 3): hook segment length before the first step.
 * - --step-secs (default 3): default per-step length (clip is trimmed to fit).
 * - Creator footage loops automatically if shorter than the total.
 *   --creator-trim <s> skips into the creator clip.
 * - Audio is silent by default (that's the format). --music <file|url> adds a
 *   track (--music-volume, --music-start); --creator-volume / --step-volume
 *   opt clip audio back in. Sources without an audio stream are skipped safely.
 * - Captions: TikTok Sans, white with black outline, static, auto-shrink to fit.
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

const creatorIn = arg("creator");
const hook = arg("hook");
if (!creatorIn || !hook) {
  console.error('Required: --creator <file|url> --hook "text" plus at least one --step');
  process.exit(1);
}

// collect steps from repeated --step "caption :: clip [:: secs [:: trim]]" or --steps json
const stepSecsDefault = parseFloat(arg("step-secs", "3"));
let steps = [];
const stepsFile = arg("steps");
if (stepsFile) {
  steps = JSON.parse(readFileSync(stepsFile, "utf8"));
} else {
  steps = argAll("step").map((raw) => {
    const parts = raw.split("::").map((s) => s.trim());
    if (parts.length < 2) {
      console.error(`--step needs "caption :: clip [:: secs [:: trim]]" — got: ${raw}`);
      process.exit(1);
    }
    return {
      caption: parts[0],
      clip: parts[1],
      secs: parts[2] ? parseFloat(parts[2]) : undefined,
      trim: parts[3] ? parseFloat(parts[3]) : undefined,
    };
  });
}
if (!steps.length) {
  console.error("At least one --step (or --steps file.json) is required");
  process.exit(1);
}

const hookSecs = parseFloat(arg("hook-secs", "3"));
const creatorTrim = parseFloat(arg("creator-trim", "0"));
const creatorVolume = parseFloat(arg("creator-volume", "0"));
const stepVolume = parseFloat(arg("step-volume", "0"));
const musicIn = arg("music");
const musicVolume = parseFloat(arg("music-volume", "1"));
const musicStart = parseFloat(arg("music-start", "0"));
const hookSize = parseFloat(arg("hook-size", "62"));
const stepSize = parseFloat(arg("step-size", "54"));

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
  const target = join("assets", basename(resolved));
  if (!existsSync(join(ROOT, target))) {
    mkdirSync(join(ROOT, "assets"), { recursive: true });
    execFileSync("cp", [resolved, join(ROOT, target)]);
  }
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

// stage everything
const creator = stage(creatorIn, "creator");
steps = steps.map((s, i) => ({ ...s, clip: stage(s.clip, `step${i + 1}`) }));
const music = musicIn ? stage(musicIn, "music", "audio") : null;

// resolve timing
const creatorDur = probeDuration(creator);
const loopLen = Math.floor((creatorDur - creatorTrim - 0.05) * 10) / 10;
if (loopLen <= 0.5) {
  console.error(`--creator-trim ${creatorTrim} leaves under 0.5s of creator footage (${creatorDur.toFixed(1)}s clip)`);
  process.exit(1);
}
steps = steps.map((s, i) => {
  const clipDur = probeDuration(s.clip);
  const trim = s.trim ?? 0;
  const avail = Math.floor((clipDur - trim - 0.05) * 10) / 10;
  if (avail <= 0.3) {
    console.error(`step ${i + 1}: trim ${trim}s leaves no usable footage (${clipDur.toFixed(1)}s clip)`);
    process.exit(1);
  }
  const secs = Math.min(s.secs ?? stepSecsDefault, avail);
  return { ...s, trim, secs };
});
const total = Math.round((hookSecs + steps.reduce((a, s) => a + s.secs, 0)) * 10) / 10;

const creatorVol = audioVolumeFor(creator, creatorVolume, "creator clip");
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
if (!music && creatorVol === 0 && stepVolume === 0) {
  console.warn("⚠ no --music and clip volumes are 0 — output will be silent (the format's default; add --music if unwanted)");
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const r1 = (n) => Math.round(n * 10) / 10;

// creator loops across the whole reel: sequential segments on track 0
let creatorSegments = "";
let t = 0;
let seg = 0;
while (t < total) {
  const d = r1(Math.min(loopLen, total - t));
  creatorSegments += `
        <video
          id="${name}-creator-${seg}"
          class="fill"
          src="${creator}"
          data-start="${r1(t)}"
          data-duration="${d}"
          data-media-start="${creatorTrim}"
          data-track-index="0"
          muted
          playsinline
        ></video>`;
  t += d;
  seg++;
}

// step panels (white bg, track 2), step videos (track 1), captions (track 3)
// panel geometry: full width, y 830 → 1920 (bottom ~57% of the frame)
let stepMarkup = "";
let stepAudio = "";
let cursor = hookSecs;
steps.forEach((s, i) => {
  const start = r1(cursor);
  const dur = r1(s.secs);
  stepMarkup += `
        <div id="${name}-panel-${i}" class="clip panel" data-start="${start}" data-duration="${dur}" data-track-index="2"></div>
        <video
          id="${name}-stepvid-${i}"
          class="step-vid"
          src="${s.clip}"
          data-start="${start}"
          data-duration="${dur}"
          data-media-start="${s.trim}"
          data-track-index="1"
          muted
          playsinline
        ></video>
        <div id="${name}-cap-${i}" class="clip step-cap" data-start="${start}" data-duration="${dur}" data-track-index="3">
          <div id="${name}-cap-${i}-wrap" class="cap-wrap">
            <span class="hook">${esc(s.caption)}</span>
          </div>
        </div>`;
  const vol = audioVolumeFor(s.clip, stepVolume, `step ${i + 1} clip`);
  if (vol > 0) {
    stepAudio += `
        <audio
          id="${name}-stepaud-${i}"
          src="${s.clip}"
          data-start="${start}"
          data-duration="${dur}"
          data-media-start="${s.trim}"
          data-track-index="${12 + i}"
          data-volume="${vol}"
        ></audio>`;
  }
  cursor += s.secs;
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
        .fill {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        /* bottom sheet the screen recording plays in */
        .panel {
          position: absolute;
          left: 0;
          right: 0;
          top: 830px;
          bottom: 0;
          background: #fff;
        }
        .step-vid {
          position: absolute;
          left: 0;
          top: 830px;
          width: 1080px;
          height: 1090px;
          object-fit: contain;
          object-position: top center;
        }
        /* hook caption: upper block of the creator segment */
        .hook-cap {
          position: absolute;
          left: 180px;
          right: 180px;
          top: 380px;
          text-align: center;
        }
        /* step caption: sits at the seam between face and panel */
        .step-cap {
          position: absolute;
          left: 120px;
          right: 120px;
          bottom: 1080px;
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
      >${creatorSegments}
        <div id="${name}-hookcap" class="clip hook-cap" data-start="0" data-duration="${hookSecs}" data-track-index="3">
          <div id="${name}-hookcap-wrap" class="cap-wrap">
            <span class="hook">${esc(hook)}</span>
          </div>
        </div>${stepMarkup}${
          creatorVol > 0
            ? `
        <audio
          id="${name}-creator-audio"
          src="${creator}"
          data-start="0"
          data-duration="${r1(Math.min(loopLen, total))}"
          data-media-start="${creatorTrim}"
          data-track-index="10"
          data-volume="${creatorVol}"
        ></audio>`
            : ""
        }${stepAudio}${
          music
            ? `
        <audio
          id="${name}-music"
          src="${music}"
          data-start="0"
          data-duration="${musicDur}"
          data-media-start="${musicStart}"
          data-track-index="11"
          data-volume="${musicVolume}"
        ></audio>`
            : ""
        }
      </div>

      <script>
        window.__timelines = window.__timelines || {};
        (function () {
          // auto text sizing: hook fits above the panel seam, step captions
          // stay on one or two lines; floor 26px
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
${steps.map((_, i) => `            fit("${name}-cap-${i}-wrap", ${stepSize}, 240);`).join("\n")}
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
console.log(`✔ compositions/${name}.html  (${hookSecs}s hook + ${steps.length} steps = ${total}s)`);
steps.forEach((s, i) => console.log(`   step ${i + 1}: "${s.caption}" · ${s.secs}s @${s.trim}s`));
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
