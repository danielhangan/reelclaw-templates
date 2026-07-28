#!/usr/bin/env node
/**
 * new-reel.mjs — stamp out a reaction+demo reel from the proven template.
 *
 * Usage:
 *   node new-reel.mjs --reaction <file-or-url> --demo <file-or-url> --hook "text" \
 *     [--name reel-6] [--trim 4.5] [--reaction-secs 3] [--render] [--draft]
 *
 * - reaction/demo accept local paths or URLs. Direct file URLs download via curl;
 *   TikTok/Instagram/YouTube page links download via yt-dlp when installed.
 * - --trim: offset (s) into the reaction clip where the 3s hook segment starts. Default 0.
 * - --reaction-secs: hook segment length. Default 3.
 * - Demo always plays full length (probed with ffprobe, rounded down to 0.1s).
 * - --music <file-or-url>: optional BGM under the whole reel (fades out at the end).
 *   --music-volume (default 1 — music is the only sound by default), --music-start (offset
 *   into the track, default 0). Page links (YouTube etc.) extract audio via yt-dlp;
 *   direct .mp3/.m4a/.wav via curl.
 * - Clip audio is MUTED by default (music-only output). Opt back in per clip with
 *   --reaction-volume 0..1 and/or --demo-volume 0..1.
 * - --hook-position top|center|bottom: where the hook sits on the reaction. Default center.
 * - --hook2 "text": optional second hook over the demo segment.
 *   --hook2-position top|center|bottom (default center).
 * - Auto text sizing: captions start at --hook-size (default 58px) and shrink
 *   automatically (down to 26px) until the text fits a max box of 1150px height,
 *   so long hooks never overflow the frame.
 * - --render: render renders/<name>.mp4 after generating (--draft for fast preview quality).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);

const reactionIn = arg("reaction");
const demoIn = arg("demo");
const hook = arg("hook");
if (!reactionIn || !demoIn || !hook) {
  console.error('Required: --reaction <file|url> --demo <file|url> --hook "text"');
  process.exit(1);
}
const trim = parseFloat(arg("trim", "0"));
const reactionSecs = parseFloat(arg("reaction-secs", "3"));
const musicIn = arg("music");
const musicVolume = parseFloat(arg("music-volume", "1"));
const musicStart = parseFloat(arg("music-start", "0"));
const reactionVolume = parseFloat(arg("reaction-volume", "0"));
const demoVolume = parseFloat(arg("demo-volume", "0"));

const hookSize = parseFloat(arg("hook-size", "58"));

const POSITIONS = ["top", "center", "bottom"];
const hookPosition = arg("hook-position", "center");
const hook2 = arg("hook2");
const hook2Position = arg("hook2-position", "center");
for (const [flagName, v] of [["hook-position", hookPosition], ["hook2-position", hook2Position]]) {
  if (!POSITIONS.includes(v)) {
    console.error(`--${flagName} must be one of: ${POSITIONS.join(", ")}`);
    process.exit(1);
  }
}
// vertical alignment within the cross-platform safe band (TikTok + IG Reels):
// the band itself (220px top / 500px bottom / 180px sides) is set on the clip CSS
const posCSS = (pos) =>
  pos === "top"
    ? "justify-content: flex-start;"
    : pos === "bottom"
      ? "justify-content: flex-end;"
      : "justify-content: center;";

// next free reel-N unless --name given
function nextName() {
  const used = readdirSync(join(ROOT, "compositions"))
    .map((f) => /^reel-(\d+)\.html$/.exec(f))
    .filter(Boolean)
    .map((m) => parseInt(m[1], 10));
  return `reel-${(used.length ? Math.max(...used) : 0) + 1}`;
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

// stage local files that live outside the project into assets/
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

const reaction = stage(reactionIn, "reaction");
const demo = stage(demoIn, "demo");
const music = musicIn ? stage(musicIn, "music", "audio") : null;

function probeDuration(rel) {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "format=duration", "-of", "csv=p=0",
    join(ROOT, rel),
  ]).toString().trim();
  return parseFloat(out);
}
const reactDur = probeDuration(reaction);
if (trim + reactionSecs > reactDur + 0.01) {
  console.error(`--trim ${trim} + ${reactionSecs}s exceeds reaction length (${reactDur.toFixed(1)}s)`);
  process.exit(1);
}
const demoDur = Math.floor((probeDuration(demo) - 0.05) * 10) / 10;
const total = Math.round((reactionSecs + demoDur) * 10) / 10;

let musicDur = 0;
if (music) {
  const trackDur = probeDuration(music);
  if (musicStart >= trackDur) {
    console.error(`--music-start ${musicStart} exceeds track length (${trackDur.toFixed(1)}s)`);
    process.exit(1);
  }
  musicDur = Math.min(total, Math.floor((trackDur - musicStart) * 10) / 10);
  if (musicDur < total) {
    console.warn(`⚠ music covers only ${musicDur}s of the ${total}s reel (ends early)`);
  }
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
        /* safe band = frame minus platform UI (worst case of TikTok + IG Reels):
           220px top (tabs/account), 500px bottom (caption/music/CTA stack),
           180px sides (right action rail; symmetric so text stays centered) */
        .hook-clip {
          position: absolute;
          inset: 0;
          left: 180px;
          right: 180px;
          padding-top: 220px;
          padding-bottom: 500px;
          display: flex;
          flex-direction: column;
          text-align: center;
          ${posCSS(hookPosition)}
        }
        .hook2-clip {
          position: absolute;
          inset: 0;
          left: 180px;
          right: 180px;
          padding-top: 220px;
          padding-bottom: 500px;
          display: flex;
          flex-direction: column;
          text-align: center;
          ${posCSS(hook2Position)}
        }
        .hook-wrap {
          width: 100%;
        }
        .hook {
          display: inline;
          color: #ffffff;
          font-family: "TikTok Sans", sans-serif;
          font-weight: 700;
          font-size: ${hookSize}px;
          line-height: 1.4;
          letter-spacing: -0.5px;
          paint-order: stroke fill;
          -webkit-text-stroke: 8px #000;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
        }
      </style>

      <div
        id="root"
        data-composition-id="${name}"
        data-start="0"
        data-width="1080"
        data-height="1920"
        data-duration="${total}"
      >
        <video
          id="${name}-react"
          class="fill"
          src="${reaction}"
          data-start="0"
          data-duration="${reactionSecs}"
          data-media-start="${trim}"
          data-track-index="0"
          muted
          playsinline
        ></video>
        <video
          id="${name}-demo"
          class="fill"
          src="${demo}"
          data-start="${reactionSecs}"
          data-duration="${demoDur}"
          data-track-index="1"
          muted
          playsinline
        ></video>
        <div id="${name}-hook" class="clip hook-clip" data-start="0" data-duration="${reactionSecs}" data-track-index="3">
          <div id="${name}-hook-wrap" class="hook-wrap">
            <span class="hook">${esc(hook)}</span>
          </div>
        </div>${
          hook2
            ? `
        <div id="${name}-hook2" class="clip hook2-clip" data-start="${reactionSecs}" data-duration="${demoDur}" data-track-index="4">
          <div id="${name}-hook2-wrap" class="hook-wrap">
            <span class="hook">${esc(hook2)}</span>
          </div>
        </div>`
            : ""
        }
${
          reactionVolume > 0
            ? `        <audio
          id="${name}-react-audio"
          src="${reaction}"
          data-start="0"
          data-duration="${reactionSecs}"
          data-media-start="${trim}"
          data-track-index="10"
          data-volume="${reactionVolume}"
        ></audio>
`
            : ""
        }${
          demoVolume > 0
            ? `        <audio
          id="${name}-demo-audio"
          src="${demo}"
          data-start="${reactionSecs}"
          data-duration="${demoDur}"
          data-track-index="11"
          data-volume="${demoVolume}"
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
          data-track-index="12"
          data-volume="${musicVolume}"
        ></audio>`
            : ""
        }
      </div>

      <script>
        window.__timelines = window.__timelines || {};
        (function () {
          // auto text sizing: shrink from the base size until the caption fits
          // its max box (1150px tall, frame minus UI safe zones); floor 26px
          function fitHook(wrapId) {
            const wrap = document.getElementById(wrapId);
            if (!wrap) return;
            const span = wrap.querySelector(".hook");
            let size = ${hookSize};
            span.style.fontSize = size + "px";
            while (size > 26 && wrap.getBoundingClientRect().height > 1150) {
              size -= 2;
              span.style.fontSize = size + "px";
            }
          }
          function fitAll() {
            fitHook("${name}-hook-wrap");
            fitHook("${name}-hook2-wrap");
          }
          fitAll();
          if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);

          const tl = gsap.timeline({ paused: true });
          // captions are static by design: no entrance/exit transitions,
          // hook windows match their video segments exactly${
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

if (!music && reactionVolume === 0 && demoVolume === 0) {
  console.warn("⚠ no --music and clip volumes are 0 — output will be silent (pass --reaction-volume / --demo-volume to keep clip audio)");
}

writeFileSync(join(ROOT, "compositions", `${name}.html`), composition);
writeFileSync(join(ROOT, `host-${name}.html`), host);
console.log(`✔ compositions/${name}.html  (${reactionSecs}s reaction @${trim}s + ${demoDur}s demo = ${total}s)`);
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
