#!/usr/bin/env node
/**
 * new-reel.mjs — stamp out a greenscreen-reaction reel: a full video (usually a
 * TikTok screen recording) fullscreen, with a background-removed UGC reaction
 * cut out and pinned in a corner on top of it.
 *
 * Usage:
 *   node new-reel.mjs --video <file-or-url> --reaction <file-or-url> \
 *     [--size 15] [--position bottom-left] [--margin 0] [--hook "text"] \
 *     [--start-position center] [--move-at 2] [--render] [--draft]
 *
 * - video/reaction accept local paths or URLs. Direct file URLs download via curl;
 *   TikTok/Instagram/YouTube page links download via yt-dlp when installed.
 * - The reaction's background is removed with `hyperframes remove-background`
 *   (local AI model, no network at render time) into a transparent WebM, cached in
 *   assets/ and reused on later runs unless the source changed or --force-cutout.
 * - The cut-out is auto-cropped to the subject's alpha bounding box (union over all
 *   frames) so --size / --position apply to the person, not to empty transparent
 *   padding. --crop none keeps the full source frame instead.
 * - --size: cut-out width as a % of the 1080px canvas width. Default 15.
 * - --position: bottom-left (default) | bottom-right | bottom-center | top-left |
 *   top-right | top-center | center-left | center-right | center.
 *   --margin insets it from the frame edges (default 0 = flush to the corner).
 *   --x / --y override the preset with exact px from the top-left of the frame.
 * - --hook "text": caption over the reel, TikTok style (white fill, black outline),
 *   auto-shrunk to fit the safe band. --hook-position top|center|bottom (default top),
 *   --hook-size (base px, default 58), --hook-start / --hook-secs to bound its window.
 * - --start-position (or --start-x/--start-y/--start-size): the cut-out opens here and
 *   is dragged to --position at --move-at (default 2s) over --move-secs (default 0.9s,
 *   eased like a hand drag). Without a --start-* flag the cut-out is simply pinned.
 * - BOTH audio tracks are ON by default (--video-volume 1, --reaction-volume 1).
 *   This is a deliberate deviation from the repo-wide muted-clips rule: the format
 *   is a creator talking over a video. Set either to 0 to drop it.
 * - Reel length = the background video's length (or --secs). The reaction overlay
 *   plays for its own full length from --overlay-start, clamped to the reel.
 * - --render: render renders/<name>.mp4 after generating (--draft for fast preview quality).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { basename, extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const HF = "hyperframes@0.7.76";

const CANVAS_W = 1080;
const CANVAS_H = 1920;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);

const videoIn = arg("video");
const reactionIn = arg("reaction");
if (!videoIn || !reactionIn) {
  console.error("Required: --video <file|url> --reaction <file|url>");
  process.exit(1);
}

const size = parseFloat(arg("size", "15"));
if (!(size > 0 && size <= 100)) {
  console.error(`--size must be a percentage in 0..100 (got "${arg("size")}")`);
  process.exit(1);
}
const margin = parseFloat(arg("margin", "0"));

const POSITIONS = [
  "bottom-left", "bottom-center", "bottom-right",
  "center-left", "center", "center-right",
  "top-left", "top-center", "top-right",
];
const position = arg("position", "bottom-left");
if (!POSITIONS.includes(position)) {
  console.error(`--position must be one of: ${POSITIONS.join(", ")}`);
  process.exit(1);
}
function numArg(flagName) {
  const raw = arg(flagName);
  if (raw === undefined) return null;
  const n = parseFloat(raw);
  if (Number.isNaN(n)) {
    console.error(`--${flagName} needs a number (got "${raw}")`);
    process.exit(1);
  }
  return n;
}
const xOverride = numArg("x");
const yOverride = numArg("y");
if (Number.isNaN(margin)) {
  console.error(`--margin needs a number (got "${arg("margin")}")`);
  process.exit(1);
}

const hook = arg("hook");
const HOOK_POSITIONS = ["top", "center", "bottom"];
const hookPosition = arg("hook-position", "top");
if (!HOOK_POSITIONS.includes(hookPosition)) {
  console.error(`--hook-position must be one of: ${HOOK_POSITIONS.join(", ")}`);
  process.exit(1);
}
const hookSize = parseFloat(arg("hook-size", "58"));
if (!(hookSize >= 26)) {
  console.error(`--hook-size must be at least 26 (got "${arg("hook-size")}")`);
  process.exit(1);
}
const hookStart = numArg("hook-start") ?? 0;
const hookSecsArg = numArg("hook-secs");

// optional opening position: the cut-out sits here, then drags to --position
const startPosition = arg("start-position");
if (startPosition !== undefined && !POSITIONS.includes(startPosition)) {
  console.error(`--start-position must be one of: ${POSITIONS.join(", ")}`);
  process.exit(1);
}
const startXOverride = numArg("start-x");
const startYOverride = numArg("start-y");
const startSize = numArg("start-size");
if (startSize !== null && !(startSize > 0 && startSize <= 100)) {
  console.error(`--start-size must be a percentage in 0..100 (got "${arg("start-size")}")`);
  process.exit(1);
}
const moves =
  startPosition !== undefined ||
  startXOverride !== null ||
  startYOverride !== null ||
  startSize !== null;
const moveAt = numArg("move-at") ?? 2;
const moveSecs = numArg("move-secs") ?? 0.9;
const moveEase = arg("move-ease", "power2.inOut");
if (!moves && (arg("move-at") !== undefined || arg("move-secs") !== undefined)) {
  console.error("--move-at / --move-secs need an opening position too: pass --start-position (or --start-x/--start-y/--start-size)");
  process.exit(1);
}
if (moves && !(moveSecs > 0)) {
  console.error(`--move-secs must be greater than 0 (got "${arg("move-secs")}")`);
  process.exit(1);
}

const cropMode = arg("crop", "auto");
if (!["auto", "none"].includes(cropMode)) {
  console.error('--crop must be "auto" or "none"');
  process.exit(1);
}
const mirror = flag("flip");

const videoTrim = parseFloat(arg("video-trim", "0"));
const overlayStart = parseFloat(arg("overlay-start", "0"));
const reactionTrim = parseFloat(arg("reaction-trim", "0"));
const reactionSecsArg = arg("reaction-secs");
const secsArg = arg("secs");

const videoVolume = parseFloat(arg("video-volume", "1"));
const reactionVolume = parseFloat(arg("reaction-volume", "1"));

const rembgQuality = arg("cutout-quality", "balanced");
if (!["fast", "balanced", "best"].includes(rembgQuality)) {
  console.error("--cutout-quality must be one of: fast, balanced, best");
  process.exit(1);
}

// next free reel-N unless --name given
function nextName() {
  // compositions/ and renders/ are gitignored, so a fresh clone may not have them
  mkdirSync(join(ROOT, "compositions"), { recursive: true });
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

function resolveMedia(input, label) {
  if (!/^https?:\/\//.test(input)) {
    if (!existsSync(input)) {
      console.error(`${label}: file not found: ${input}`);
      process.exit(1);
    }
    return input;
  }
  mkdirSync(join(ROOT, "assets"), { recursive: true });
  const isDirectFile = /\.(mp4|mov|webm|m4v)(\?|$)/i.test(input);
  const out = join(
    "assets",
    `${name}-${label}${isDirectFile ? extname(new URL(input).pathname) : ".mp4"}`
  );
  const abs = join(ROOT, out);
  console.log(`Downloading ${label}: ${input}`);
  if (isDirectFile) {
    execFileSync("curl", ["-L", "--fail", "-o", abs, input], { stdio: "inherit" });
  } else {
    if (spawnSync("yt-dlp", ["--version"]).error) {
      console.error(`${label}: "${input}" is a page link — install yt-dlp (brew install yt-dlp) or pass a direct file URL / local path.`);
      process.exit(1);
    }
    execFileSync("yt-dlp", ["-f", "mp4", "-o", abs, input], { stdio: "inherit" });
  }
  return out;
}

// stage local files that live outside the project into assets/
function stage(path, label) {
  const resolved = resolveMedia(path, label);
  if (resolved.startsWith("assets/")) return resolved;
  let target = join("assets", basename(resolved));
  let abs = join(ROOT, target);
  if (existsSync(abs)) {
    if (spawnSync("cmp", ["-s", resolved, abs]).status === 0) return target;
    // same filename, different content — stage under a per-reel, per-role name
    // instead of silently reusing a stale copy of a different video
    console.warn(`⚠ ${label}: assets/${basename(resolved)} already exists with different content — staging as ${name}-${label}${extname(resolved)}`);
    target = join("assets", `${name}-${label}${extname(resolved)}`);
    abs = join(ROOT, target);
  }
  mkdirSync(join(ROOT, "assets"), { recursive: true });
  execFileSync("cp", ["-f", resolved, abs]);
  return target;
}

const video = stage(videoIn, "video");
const reaction = stage(reactionIn, "reaction");

function ffprobeCsv(rel, args) {
  return execFileSync("ffprobe", ["-v", "error", ...args, join(ROOT, rel)])
    .toString()
    .trim();
}
const probeDuration = (rel) =>
  parseFloat(ffprobeCsv(rel, ["-show_entries", "format=duration", "-of", "csv=p=0"]));
const hasAudioStream = (rel) =>
  ffprobeCsv(rel, ["-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0"]).length > 0;

function probeSize(rel) {
  const [w, h] = ffprobeCsv(rel, [
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height",
    "-of", "csv=p=0",
  ]).split(",").map(Number);
  return { w, h };
}

/* ---------- 1. background removal (the "greenscreen") ---------- */

// cached next to the source: <reaction>-cutout.webm, regenerated when the source
// is newer than the cutout (or on --force-cutout)
const cutout = join("assets", `${basename(reaction, extname(reaction))}-cutout.webm`);
const cutoutAbs = join(ROOT, cutout);
const fresh =
  existsSync(cutoutAbs) &&
  statSync(cutoutAbs).mtimeMs >= statSync(join(ROOT, reaction)).mtimeMs;
if (fresh && !flag("force-cutout")) {
  console.log(`• reusing cached cut-out ${cutout} (--force-cutout to redo)`);
} else {
  console.log(`Removing background from ${reaction} → ${cutout} (local AI model, ~6 fps)`);
  const r = spawnSync(
    "npx",
    ["--yes", HF, "remove-background", reaction, "-o", cutout, "--quality", rembgQuality],
    { cwd: ROOT, stdio: "inherit" }
  );
  if (r.status !== 0 || !existsSync(cutoutAbs)) {
    console.error("background removal failed");
    process.exit(1);
  }
}

/* ---------- 2. crop the cut-out to the subject ---------- */

const cut = probeSize(cutout);

// union alpha bounding box over every frame, so the subject never clips as they move
function alphaBBox(rel) {
  const r = spawnSync("ffmpeg", [
    "-v", "info",
    // ffmpeg's native vp9 decoder drops the alpha plane; libvpx-vp9 keeps it,
    // and without alpha `alphaextract` fails outright
    ...(extname(rel) === ".webm" ? ["-c:v", "libvpx-vp9"] : []),
    "-i", join(ROOT, rel),
    "-vf", "alphaextract,cropdetect=limit=0.02:round=2:reset=0",
    "-f", "null", "-",
  ], { encoding: "utf8" });
  const found = [...(r.stderr || "").matchAll(/crop=(\d+):(\d+):(-?\d+):(-?\d+)/g)].pop();
  if (!found) return null;
  const [w, h, x, y] = found.slice(1).map(Number);
  if (w <= 0 || h <= 0 || x < 0 || y < 0) return null;
  return { w, h, x, y };
}

let box = { w: cut.w, h: cut.h, x: 0, y: 0 };
if (cropMode === "auto") {
  const bb = alphaBBox(cutout);
  if (!bb) {
    console.warn("⚠ could not detect the subject's alpha box — using the full frame");
  } else if (bb.w >= cut.w && bb.h >= cut.h) {
    console.warn("⚠ subject fills the whole frame — nothing to crop");
  } else {
    box = bb;
    console.log(`• subject box ${bb.w}×${bb.h} at (${bb.x},${bb.y}) of ${cut.w}×${cut.h}`);
  }
}

/* ---------- 3. geometry ---------- */

const scale = (CANVAS_W * (size / 100)) / box.w;
const ovW = Math.round(box.w * scale);
const ovH = Math.round(box.h * scale);
if (ovH > CANVAS_H) {
  console.warn(`⚠ cut-out is ${ovH}px tall at --size ${size} — taller than the 1920px frame`);
}
// inner video is scaled whole, then shifted so the subject box lands in the wrapper.
// the wrapper's transform belongs to GSAP (the drag), so --flip has to live on the
// inner video — which means mirroring the offset too, or the crop window would
// show the wrong slice of the flipped frame
const innerW = Math.round(cut.w * scale);
const innerH = Math.round(cut.h * scale);
const innerX = mirror
  ? Math.round((box.x + box.w) * scale) - innerW
  : -Math.round(box.x * scale);
const innerY = -Math.round(box.y * scale);

// place a w×h box on the canvas per position preset
function placeBox(pos, w, h) {
  const [v, h_] = pos.split("-");
  // "center" alone splits to ["center"] — undefined h_ falls through to centered
  return {
    x: h_ === "left" ? margin : h_ === "right" ? CANVAS_W - w - margin : Math.round((CANVAS_W - w) / 2),
    y: v === "top" ? margin : v === "bottom" ? CANVAS_H - h - margin : Math.round((CANVAS_H - h) / 2),
  };
}

const rest = placeBox(position, ovW, ovH);
const ovX = xOverride !== null ? xOverride : rest.x;
const ovY = yOverride !== null ? yOverride : rest.y;

// the opening pose, expressed as a transform off the resting pose so the wrapper
// keeps one static layout position and GSAP only animates x/y/scale
let move = null;
if (moves) {
  const startScale = startSize !== null ? startSize / size : 1;
  const startW = Math.round(ovW * startScale);
  const startH = Math.round(ovH * startScale);
  const startRest = placeBox(startPosition ?? position, startW, startH);
  const startX = startXOverride !== null ? startXOverride : startRest.x;
  const startY = startYOverride !== null ? startYOverride : startRest.y;
  // scaling happens about the box's centre, so convert the top-left target into
  // the translate that lands it there
  move = {
    dx: Math.round(startX - ovX - (ovW - startW) / 2),
    dy: Math.round(startY - ovY - (ovH - startH) / 2),
    scale: startScale,
    startW,
    startH,
    startX,
    startY,
  };
}

/* ---------- 4. timing ---------- */

const videoDur = probeDuration(video);
if (videoTrim >= videoDur) {
  console.error(`--video-trim ${videoTrim} exceeds the video length (${videoDur.toFixed(1)}s)`);
  process.exit(1);
}
const availableVideo = Math.floor((videoDur - videoTrim - 0.05) * 10) / 10;
const total = secsArg ? Math.min(parseFloat(secsArg), availableVideo) : availableVideo;
if (!(total > 0)) {
  console.error("reel length resolved to 0s — check --video-trim / --secs");
  process.exit(1);
}

const reactionDur = probeDuration(reaction);
if (reactionTrim >= reactionDur) {
  console.error(`--reaction-trim ${reactionTrim} exceeds the reaction length (${reactionDur.toFixed(1)}s)`);
  process.exit(1);
}
if (overlayStart >= total) {
  console.error(`--overlay-start ${overlayStart} is past the end of the ${total}s reel`);
  process.exit(1);
}
const reactionAvailable = Math.floor((reactionDur - reactionTrim - 0.05) * 10) / 10;
const wanted = reactionSecsArg ? parseFloat(reactionSecsArg) : reactionAvailable;
const overlaySecs = Math.round(Math.min(wanted, reactionAvailable, total - overlayStart) * 10) / 10;
if (reactionSecsArg && overlaySecs < parseFloat(reactionSecsArg)) {
  console.warn(`⚠ overlay trimmed to ${overlaySecs}s (clip has ${reactionAvailable}s from --reaction-trim; reel has ${(total - overlayStart).toFixed(1)}s left)`);
} else if (!reactionSecsArg && overlaySecs < reactionAvailable) {
  console.warn(`⚠ reaction is longer than the reel — overlay cut to ${overlaySecs}s`);
}

const overlayEnd = Math.round((overlayStart + overlaySecs) * 10) / 10;
if (moves) {
  if (moveAt < overlayStart) {
    console.error(`--move-at ${moveAt} is before the cut-out appears (--overlay-start ${overlayStart})`);
    process.exit(1);
  }
  if (moveAt >= overlayEnd) {
    console.error(`--move-at ${moveAt} is at or past the end of the cut-out (${overlayEnd}s) — it would never move`);
    process.exit(1);
  }
  if (moveAt + moveSecs > overlayEnd) {
    console.warn(`⚠ the ${moveSecs}s drag from ${moveAt}s runs past the cut-out's end (${overlayEnd}s) — it will still be moving when the clip ends`);
  }
}

// hook caption spans the rest of the reel unless bounded
const hookSecs = hook
  ? Math.round(Math.min(hookSecsArg ?? total - hookStart, total - hookStart) * 10) / 10
  : 0;
if (hook) {
  if (hookStart >= total) {
    console.error(`--hook-start ${hookStart} is past the end of the ${total}s reel`);
    process.exit(1);
  }
  if (!(hookSecs > 0)) {
    console.error("--hook-secs resolved to 0s");
    process.exit(1);
  }
  if (hookSecsArg && hookSecs < hookSecsArg) {
    console.warn(`⚠ hook trimmed to ${hookSecs}s (the reel has that much left after --hook-start ${hookStart})`);
  }
  // coarse collision hint: roughly where 2-3 lines of caption land in its third of
  // the safe band, vs the cut-out's boxes. 40px of slop so a near-miss stays quiet
  const bandTop = 220 + { top: 0, center: 450, bottom: 900 }[hookPosition];
  const hookRect = { x: 180, y: bandTop, w: 720, h: 300 };
  const overlaps = (r) =>
    r.x + 40 < hookRect.x + hookRect.w && r.x + r.w - 40 > hookRect.x &&
    r.y + 40 < hookRect.y + hookRect.h && r.y + r.h - 40 > hookRect.y;
  const restRect = { x: ovX, y: ovY, w: ovW, h: ovH };
  if (overlaps(restRect)) {
    console.warn(`⚠ the cut-out's resting spot overlaps the --hook-position ${hookPosition} band — the caption may sit on the creator`);
  } else if (move && overlaps({ x: move.startX, y: move.startY, w: move.startW, h: move.startH })) {
    console.warn(`⚠ the cut-out's opening spot overlaps the --hook-position ${hookPosition} band — the caption may sit on the creator before the drag`);
  }
}

/* ---------- 5. audio ---------- */

// only emit <audio> for sources that actually carry an audio stream — the
// render's audio-prep stage fails outright otherwise
function audioVolumeFor(rel, requested, label) {
  if (requested <= 0) return 0;
  if (hasAudioStream(rel)) return requested;
  console.warn(`⚠ ${label} has no audio stream — ignoring its volume setting`);
  return 0;
}
const videoVol = audioVolumeFor(video, videoVolume, "background video");
// the cut-out WebM is video-only; reaction sound comes from the original file
const reactionVol = audioVolumeFor(reaction, reactionVolume, "reaction clip");
if (videoVol === 0 && reactionVol === 0) {
  console.warn("⚠ both volumes are 0 — output will be silent");
}

/* ---------- 6. emit ---------- */

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
          width: ${CANVAS_W}px;
          height: ${CANVAS_H}px;
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
        /* window onto the subject: the transparent cut-out is scaled whole and
           shifted so its alpha bounding box fills this box exactly */
        .cutout-box {
          position: absolute;
          left: ${ovX}px;
          top: ${ovY}px;
          width: ${ovW}px;
          height: ${ovH}px;
          overflow: hidden;
        }
        .cutout {
          position: absolute;
          left: ${innerX}px;
          top: ${innerY}px;
          width: ${innerW}px;
          height: ${innerH}px;${mirror ? "\n          transform: scaleX(-1);" : ""}
        }${
          hook
            ? `
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
          ${hookPosition === "top" ? "justify-content: flex-start;" : hookPosition === "bottom" ? "justify-content: flex-end;" : "justify-content: center;"}
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
        }`
            : ""
        }
      </style>

      <div
        id="root"
        data-composition-id="${name}"
        data-start="0"
        data-width="${CANVAS_W}"
        data-height="${CANVAS_H}"
        data-duration="${total}"
      >
        <video
          id="${name}-bg"
          class="fill"
          src="${video}"
          data-start="0"
          data-duration="${total}"
          data-media-start="${videoTrim}"
          data-track-index="0"
          muted
          playsinline
        ></video>
        <div id="${name}-cutout-box" class="cutout-box">
          <video
            id="${name}-cutout"
            class="clip cutout"
            src="${cutout}"
            data-start="${overlayStart}"
            data-duration="${overlaySecs}"
            data-media-start="${reactionTrim}"
            data-track-index="1"
            muted
            playsinline
          ></video>
        </div>${
          hook
            ? `
        <div id="${name}-hook" class="clip hook-clip" data-start="${hookStart}" data-duration="${hookSecs}" data-track-index="3">
          <div id="${name}-hook-wrap" class="hook-wrap">
            <span class="hook">${esc(hook)}</span>
          </div>
        </div>`
            : ""
        }${
          videoVol > 0
            ? `
        <audio
          id="${name}-bg-audio"
          src="${video}"
          data-start="0"
          data-duration="${total}"
          data-media-start="${videoTrim}"
          data-track-index="10"
          data-volume="${videoVol}"
        ></audio>`
            : ""
        }${
          reactionVol > 0
            ? `
        <audio
          id="${name}-reaction-audio"
          src="${reaction}"
          data-start="${overlayStart}"
          data-duration="${overlaySecs}"
          data-media-start="${reactionTrim}"
          data-track-index="11"
          data-volume="${reactionVol}"
        ></audio>`
            : ""
        }
      </div>

      <script>
        window.__timelines = window.__timelines || {};
        (function () {${
          hook
            ? `
          // auto text sizing: shrink from the base size until the caption fits
          // its max box (1150px tall, frame minus UI safe zones); floor 26px
          function fitHook() {
            const wrap = document.getElementById("${name}-hook-wrap");
            if (!wrap) return;
            const span = wrap.querySelector(".hook");
            let size = ${hookSize};
            span.style.fontSize = size + "px";
            while (size > 26 && wrap.getBoundingClientRect().height > 1150) {
              size -= 2;
              span.style.fontSize = size + "px";
            }
          }
          fitHook();
          if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitHook);
`
            : ""
        }
          const tl = gsap.timeline({ paused: true });${
            move
              ? `
          // the cut-out opens away from its resting spot and is dragged there:
          // set the opening offset up front (so seeking to any frame before the
          // drag shows it parked), then ease the transform back to zero
          const box = "#${name}-cutout-box";
          gsap.set(box, { x: ${move.dx}, y: ${move.dy}, scale: ${move.scale} });
          tl.to(box, { x: 0, y: 0, scale: 1, duration: ${moveSecs}, ease: "${moveEase}" }, ${moveAt});`
              : `
          // captions are static by design and the cut-out is pinned — no motion`
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
    <meta name="viewport" content="width=${CANVAS_W}, height=${CANVAS_H}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: ${CANVAS_W}px; height: ${CANVAS_H}px; overflow: hidden; background: #000; }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="host-${name}"
      data-start="0"
      data-duration="${total}"
      data-width="${CANVAS_W}"
      data-height="${CANVAS_H}"
    >
      <div
        id="${name}-host"
        data-composition-id="${name}"
        data-composition-src="compositions/${name}.html"
        data-start="0"
        data-duration="${total}"
        data-track-index="0"
        data-width="${CANVAS_W}"
        data-height="${CANVAS_H}"
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

mkdirSync(join(ROOT, "compositions"), { recursive: true });
mkdirSync(join(ROOT, "renders"), { recursive: true });
writeFileSync(join(ROOT, "compositions", `${name}.html`), composition);
writeFileSync(join(ROOT, `host-${name}.html`), host);
console.log(`✔ compositions/${name}.html  (${total}s reel, cut-out ${ovW}×${ovH} at ${ovX},${ovY} for ${overlaySecs}s)`);
if (move) {
  console.log(`  ↳ opens ${move.startW}×${move.startH} at ${move.startX},${move.startY}, drags to rest over ${moveSecs}s at ${moveAt}s`);
}
if (hook) {
  console.log(`  ↳ hook (${hookPosition}, ${hookSize}px base) for ${hookSecs}s from ${hookStart}s`);
}
console.log(`✔ host-${name}.html`);

if (flag("render")) {
  const args = ["--yes", HF, "render", "-c", `host-${name}.html`, "-o", `renders/${name}.mp4`];
  if (flag("draft")) args.push("--quality", "draft");
  console.log(`Rendering renders/${name}.mp4 …`);
  const r = spawnSync("npx", args, { cwd: ROOT, stdio: "inherit" });
  process.exit(r.status ?? 0);
} else {
  console.log(`Next: npx ${HF} render -c host-${name}.html -o renders/${name}.mp4`);
}
