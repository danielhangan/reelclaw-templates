#!/usr/bin/env node
// @ts-check
/**
 * Generate small synthetic fixture media into fixtures/ (gitignored) with ffmpeg.
 *
 *   node scripts/make-fixtures.mjs           # create missing fixtures
 *   node scripts/make-fixtures.mjs --force   # regenerate everything
 *   node scripts/make-fixtures.mjs --out <dir>  # write somewhere else (tests)
 *
 * Every file is synthetic (testsrc2 / color / drawtext / sine) — never commit or
 * download real footage for tests. Template example.json files reference these
 * paths relative to the repo root, e.g. "fixtures/portrait-talking.mp4".
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const outFlag = process.argv.indexOf("--out");
const OUT = outFlag > 0 && process.argv[outFlag + 1] ? resolve(process.argv[outFlag + 1]) : join(ROOT, "fixtures");
const force = process.argv.includes("--force");

/** Text label burned into a fixture so frames are identifiable in renders. */
const label = (/** @type {string} */ text, size = 64) =>
  `drawtext=text='${text}':fontcolor=white:fontsize=${size}:borderw=4:bordercolor=black:x=(w-tw)/2:y=h*0.12`;
/** Running clock so trims/offsets are visible in rendered frames. */
const clock = (size = 56) =>
  `drawtext=text='t=%{pts\\:hms}':fontcolor=yellow:fontsize=${size}:borderw=3:bordercolor=black:x=(w-tw)/2:y=h*0.8`;

// a keyframe every second: HyperFrames seeks per frame and warns (and can freeze frames) on sparse keyframes
const x264 = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", "-g", "30", "-keyint_min", "30"];
const aac = ["-c:a", "aac", "-b:a", "96k"];

/**
 * @typedef {{ file: string, what: string, args: string[] }} Fixture
 * @type {Fixture[]}
 */
const FIXTURES = [
  {
    file: "portrait-talking.mp4",
    what: "720x1280 portrait, 6s, with audio (stand-in for a creator reaction clip)",
    args: [
      "-f", "lavfi", "-i", "testsrc2=size=720x1280:rate=30:duration=6",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=6",
      "-vf", `${label("REACTION")},${clock()}`,
      ...x264, ...aac, "-shortest",
    ],
  },
  {
    file: "portrait-silent.mp4",
    what: "720x1280 portrait, 5s, no audio stream",
    args: [
      "-f", "lavfi", "-i", "color=c=0x3b5bdb:size=720x1280:rate=30:duration=5",
      "-vf", `${label("SILENT")},${clock()}`,
      ...x264, "-an",
    ],
  },
  {
    file: "landscape-screen.mp4",
    what: "1280x720 landscape screen-recording look, 6s, no audio",
    args: [
      "-f", "lavfi", "-i", "color=c=0xf8f9fa:size=1280x720:rate=30:duration=6",
      "-vf", [
        "drawbox=x=0:y=0:w=1280:h=64:color=0x212529:t=fill",
        "drawbox=x=40:y=110:w=380:h=560:color=0xdee2e6:t=fill",
        "drawbox=x='460+mod(t*120,600)':y=140:w=180:h=90:color=0x7048e8:t=fill",
        "drawbox=x=460:y=300:w=760:h=40:color=0xced4da:t=fill",
        "drawbox=x=460:y=370:w='min(760,t*140)':h=40:color=0x37b24d:t=fill",
        "drawtext=text='APP DEMO':fontcolor=white:fontsize=36:x=40:y=14",
        "drawtext=text='t=%{pts\\:hms}':fontcolor=0x212529:fontsize=48:x=460:y=560",
      ].join(","),
      ...x264, "-an",
    ],
  },
  {
    file: "person-on-green.mp4",
    what: "720x1280 person-like silhouette on a solid green background, 5s, with audio (cutout tests)",
    args: [
      "-f", "lavfi", "-i", "color=c=0x00b140:size=720x1280:rate=30:duration=5",
      "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=48000:duration=5",
      "-vf", [
        // head: a circle drawn with geq would be slow; a stack of boxes reads as a person
        "drawbox=x=280:y=330:w=160:h=190:color=0xe0ac69:t=fill",
        "drawbox=x=300:y=520:w=120:h=50:color=0xc68642:t=fill",
        "drawbox=x='190+10*sin(t*3)':y=570:w=340:h=710:color=0x1c1c1c:t=fill",
        "drawbox=x=270:y=300:w=180:h=60:color=0x3d2b1f:t=fill",
      ].join(","),
      ...x264, ...aac, "-shortest",
    ],
  },
  {
    file: "music.m4a",
    what: "20s 100bpm beat (a kick every 0.6s, off-beat hat) over a two-tone bed; beat sync finds its beats",
    args: [
      "-f", "lavfi", "-i",
      "aevalsrc=0.7*sin(2*PI*60*t)*exp(-14*mod(t\\,0.6))+0.15*sin(2*PI*3000*t)*exp(-40*mod(t+0.3\\,0.6))+0.12*sin(2*PI*220*t)+0.08*sin(2*PI*330*t):s=48000:d=20",
      ...aac,
    ],
  },
  {
    file: "photo.jpg",
    what: "1080x1350 still image",
    args: [
      "-f", "lavfi", "-i", "testsrc2=size=1080x1350:rate=1:duration=1",
      "-vf", label("PHOTO", 96), "-frames:v", "1", "-q:v", "4",
    ],
  },
  {
    file: "logo.png",
    what: "512x512 PNG with transparency",
    args: [
      "-f", "lavfi", "-i", "color=c=0xff3366@0.0:size=512x512,format=rgba",
      "-vf", "drawbox=x=96:y=96:w=320:h=320:color=0xff3366@1.0:t=fill,drawtext=text='LOGO':fontcolor=white:fontsize=96:x=(w-tw)/2:y=(h-th)/2",
      "-frames:v", "1",
    ],
  },
];

function ffmpegAvailable() {
  return !spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).error;
}

if (!ffmpegAvailable()) {
  console.error("✖ ffmpeg not found on PATH — install it (brew install ffmpeg | sudo apt install ffmpeg | winget install ffmpeg)");
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
let made = 0;
for (const fx of FIXTURES) {
  const out = join(OUT, fx.file);
  if (existsSync(out) && !force) continue;
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...fx.args, out], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(`✖ ${fx.file}: ${r.stderr.trim()}`);
    process.exit(1);
  }
  made++;
  const kb = Math.round(statSync(out).size / 1024);
  console.log(`✓ ${relative(ROOT, out)}  ${kb}KB  — ${fx.what}`);
}
console.log(made ? `\n${made} fixture(s) written to ${relative(ROOT, OUT) || OUT}/` : "fixtures are up to date (--force to regenerate)");
