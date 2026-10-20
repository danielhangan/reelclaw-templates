// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import {
  analyzeReference, aspectOf, bpmOf, blankFormat, grid, pacingOf, parseCutTimes, pickMeta, readAnalysis,
  resolveSource, shotsFromCuts, slugFor, stripStep,
} from "../src/analyze/index.mjs";
import { camel, planTemplate, renderExample, renderSkill, renderTemplate, scaffoldTemplate } from "../src/analyze/scaffold.mjs";
import { diffNotes } from "../src/analyze/index.mjs";
import { parseFrontmatter } from "../src/core/validate.mjs";

/** @typedef {import('../src/analyze/analysis.mjs').Analysis} Analysis */

describe("slugFor", () => {
  it("names references after the platform and post id", () => {
    assert.equal(slugFor("https://www.tiktok.com/@user/video/7301234567890?is_from_webapp=1"), "tiktok-7301234567890");
    assert.equal(slugFor("https://www.instagram.com/reel/C1a2B3c/"), "instagram-c1a2b3c");
    assert.equal(slugFor("https://youtube.com/shorts/dQw4w9WgXcQ"), "youtube-dqw4w9wgxcq");
    assert.equal(slugFor("https://www.youtube.com/watch?v=abc123"), "youtube-abc123");
    assert.equal(slugFor("https://x.com/u/status/1234"), "x-1234");
    assert.equal(slugFor("https://cdn.example.com/media/Viral Clip.mp4"), "cdn-viral-clip");
    assert.equal(slugFor("clips/My Reference (1).MOV"), "my-reference-1");
  });
});

describe("parseCutTimes / shotsFromCuts / pacingOf", () => {
  const stderr = [
    "[Parsed_showinfo_2 @ 0x1] n:   0 pts:  90000 pts_time:3       duration:...",
    "[Parsed_showinfo_2 @ 0x1] n:   1 pts: 180000 pts_time:6.033   duration:...",
    "[Parsed_showinfo_2 @ 0x1] n:   2 pts: 182000 pts_time:6.1     duration:...",
    "unrelated pts_time:99",
  ].join("\n");

  it("reads showinfo times only", () => assert.deepEqual(parseCutTimes(stderr), [3, 6.033, 6.1]));

  it("merges flash cuts and covers the whole video", () => {
    const shots = shotsFromCuts([3, 6.033, 6.1, 8.4], 8.5);
    assert.deepEqual(shots.map((s) => [s.start, s.end]), [[0, 3], [3, 6.033], [6.033, 8.5]]);
    assert.deepEqual(shots.map((s) => s.index), [1, 2, 3]);
  });

  it("one shot when there are no cuts", () => assert.deepEqual(shotsFromCuts([], 5), [{ index: 1, start: 0, end: 5, duration: 5 }]));

  it("summarizes pacing", () => {
    const p = pacingOf(shotsFromCuts([3, 6], 8.5), 8.5);
    assert.deepEqual(p, { shots: 3, avgShot: 2.83, shortestShot: 2.5, longestShot: 3, cutsPerMinute: 14.12, firstCut: 3 });
    assert.equal(pacingOf(shotsFromCuts([], 4), 4).firstCut, null);
  });

  it("bpm from beat times", () => {
    assert.equal(bpmOf([0.5, 1, 1.5, 2, 2.5]), 120);
    assert.equal(bpmOf([1, 2]), null);
  });
});

describe("frame layout helpers", () => {
  it("picks a nice sampling step under the frame budget", () => {
    assert.equal(stripStep(8.5, 40), 0.5);
    assert.equal(stripStep(30, 40), 1);
    assert.equal(stripStep(60, 40), 2);
  });
  it("grids", () => {
    assert.deepEqual(grid(3, 6), { cols: 3, rows: 1 });
    assert.deepEqual(grid(13, 6), { cols: 6, rows: 3 });
  });
  it("aspect labels", () => {
    assert.equal(aspectOf(1080, 1920), "9:16");
    assert.equal(aspectOf(1280, 720), "16:9");
    assert.equal(aspectOf(1000, 1100), "1000:1100");
  });
});

describe("source", () => {
  it("keeps only public, useful metadata from yt-dlp", () => {
    const meta = pickMeta({ extractor_key: "TikTok", title: " pov ", view_count: 10, url: "https://signed", http_headers: { Cookie: "x" }, track: "song", artist: "dj" });
    assert.deepEqual(meta, { platform: "TikTok", title: "pov", views: 10, sound: "song — dj" });
  });

  it("downloads page links with yt-dlp into source.mp4 and reuses it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "reelclaw-src-"));
    /** @type {string[][]} */
    const calls = [];
    /** @type {import('../src/analyze/source.mjs').Exec} */
    const exec = async (cmd, args) => {
      calls.push([cmd, ...args]);
      const out = args[args.indexOf("-o") + 1].replace("%(ext)s", "");
      writeFileSync(`${out}mp4`, "fake");
      writeFileSync(`${out}info.json`, JSON.stringify({ extractor_key: "TikTok", like_count: 5 }));
      return { code: 0, stdout: "", stderr: "" };
    };
    try {
      const url = "https://www.tiktok.com/@u/video/1";
      const a = await resolveSource(url, { dir, cwd: dir, exec });
      assert.equal(a.file, join(dir, "source.mp4"));
      assert.deepEqual(a.meta, { platform: "TikTok", likes: 5 });
      assert.equal(a.downloaded, true);
      assert.ok(calls[0].includes("--write-info-json") && calls[0].at(-1) === url);
      const b = await resolveSource(url, { dir, cwd: dir, exec });
      assert.equal(b.downloaded, false);
      assert.equal(calls.length, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("explains yt-dlp failures with a fallback", async () => {
    const dir = mkdtempSync(join(tmpdir(), "reelclaw-src-"));
    try {
      const exec = async () => ({ code: 1, stdout: "", stderr: "ERROR: Video unavailable" });
      await assert.rejects(resolveSource("https://www.tiktok.com/@u/video/2", { dir, cwd: dir, exec }), (e) => {
        const err = /** @type {import('../src/core/errors.mjs').ReelclawError} */ (e);
        return /yt-dlp could not download/.test(err.message) && /Video unavailable/.test(err.hint ?? "") && /--source-url/.test(err.hint ?? "");
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects missing local files", async () => {
    await assert.rejects(resolveSource("nope.mp4", { dir: tmpdir(), cwd: tmpdir() }), /reference video not found/);
  });
});

/** @param {Partial<Analysis['format']>} [format] @param {number[]} [cuts] */
function fakeAnalysis(format = {}, cuts = [3, 6]) {
  const duration = 8.5;
  const shots = shotsFromCuts(cuts, duration);
  return /** @type {Analysis} */ ({
    version: 1,
    slug: "tiktok-1",
    createdWith: "reelclaw@test",
    source: { input: "https://www.tiktok.com/@u/video/1", url: "https://www.tiktok.com/@u/video/1", file: "/x/source.mp4" },
    media: { duration, width: 1080, height: 1920, fps: 30, hasAudio: true, aspect: "9:16" },
    detection: { threshold: 0.3 },
    shots,
    pacing: pacingOf(shots, duration),
    images: { contactSheet: "contact-sheet.png", filmstrip: "filmstrip.png", filmstripStep: 0.5, keyframes: [] },
    transcript: null,
    beats: { bpm: 120, times: [] },
    format: { ...blankFormat(shots.length), ...format },
  });
}

describe("planTemplate", () => {
  it("one input per role, jump cuts continue through the footage", () => {
    const plan = planTemplate("pov-app", fakeAnalysis({ roles: ["selfie", "screen recording", "screen recording"], category: "product-demo" }));
    assert.deepEqual(plan.footage.map((f) => [f.key, f.fixture]), [["selfie", "fixtures/portrait-talking.mp4"], ["screenRecording", "fixtures/landscape-screen.mp4"]]);
    assert.deepEqual(plan.shots.map((s) => [s.input, s.start, s.duration, s.trim]), [["selfie", 0, 3, 0], ["screenRecording", 3, 3, 0], ["screenRecording", 6, 2.5, 3]]);
    assert.equal(plan.category, "product-demo");
    assert.equal(plan.source.url, "https://www.tiktok.com/@u/video/1");
  });

  it("texts become caption inputs: hook first (required), then caption2…, custom keys kept", () => {
    const plan = planTemplate("x-y", fakeAnalysis({ texts: [
      { text: "payoff line", start: 6, end: 99, key: "payoff" },
      { text: "pov: hook", start: 0, end: 3, position: "top" },
      { text: "mid", start: 3, end: 6 },
    ] }));
    assert.deepEqual(plan.texts.map((t) => [t.key, t.required, t.start, t.duration, t.position]), [
      ["hook", true, 0, 3, "top"], ["caption2", false, 3, 3, "center"], ["payoff", false, 6, 2.5, "center"],
    ]);
  });

  it("adds a placeholder hook when no text was noted, and a montage list for many unlabelled shots", () => {
    const plan = planTemplate("fast-cuts", fakeAnalysis({}, [1, 2, 3, 4, 5, 6, 7]));
    assert.equal(plan.montage, true);
    assert.deepEqual(plan.footage.map((f) => f.key), ["clips"]);
    assert.deepEqual(plan.texts.map((t) => [t.key, t.text, t.duration]), [["hook", "", 1]]);
  });

  it("avoids reserved and duplicate input names", () => {
    const plan = planTemplate("a-b", fakeAnalysis({ roles: ["music", "name", "name"], texts: [{ text: "x", start: 0, end: 1, key: "music" }] }));
    assert.deepEqual(plan.footage.map((f) => f.key), ["musicClip", "nameClip"]);
    assert.equal(plan.texts[0].key, "musicText");
  });

  it("rejects non-kebab ids with the fix", () => {
    assert.throws(() => planTemplate("My_Template", null), /not a valid template id/);
  });

  it("camel-cases role names", () => {
    assert.equal(camel("screen recording"), "screenRecording");
    assert.equal(camel("B-Roll"), "bRoll");
    assert.equal(camel("2nd angle"), "clip2ndAngle");
  });
});

describe("rendered files", () => {
  it("SKILL.md frontmatter is valid Agent Skills metadata", () => {
    const plan = planTemplate("pov-app", fakeAnalysis({ name: 'POV: "app" reveal', description: "A POV hook: then a reveal of the app that solves it." }));
    const fm = parseFrontmatter(renderSkill(plan));
    assert.equal(fm?.name, "pov-app");
    assert.ok(fm?.description && fm.description.length >= 40 && fm.description.length <= 1024);
    assert.match(renderSkill(plan), /npx reelclaw@latest add pov-app/);
  });

  it("example.json covers every required input with fixtures", () => {
    const plan = planTemplate("fast-cuts", fakeAnalysis({}, [1, 2, 3, 4, 5, 6, 7]));
    const ex = JSON.parse(renderExample(plan));
    assert.equal(ex.template, "fast-cuts");
    assert.equal(ex.inputs.clips.length, 3);
    assert.ok(ex.inputs.hook);
  });

  it("template.mjs is plain, readable code", () => {
    const src = renderTemplate(planTemplate("pov-app", fakeAnalysis({ roles: ["a", "b", "b"] })));
    assert.match(src, /^\/\/ @ts-check/);
    assert.match(src, /video\(inputs\.b, \{ id: "shot-3", start: 6, duration: 2\.5, trim: pickUp\(inputs\.b, 3\), loop: true \}\)/);
    assert.doesNotMatch(src, /undefined/);
  });
});

describe("scaffoldTemplate (writes + loads the generated template)", () => {
  /** @type {string} */
  let root;
  before(() => (root = mkdtempSync(join(tmpdir(), "reelclaw-scaffold-"))));
  after(() => rmSync(root, { recursive: true, force: true }));

  for (const [id, analysis] of /** @type {[string, Analysis | null][]} */ ([
    ["blank-one", null],
    ["roles-two", fakeAnalysis({ roles: ["selfie", "demo", "demo"], texts: [{ text: "pov", start: 0, end: 3 }] })],
    ["montage-three", fakeAnalysis({}, [1, 2, 3, 4, 5, 6, 7])],
  ])) {
    it(`${id}: loads and fills the README flags table`, async () => {
      const { dir } = await scaffoldTemplate({ id, root, analysis });
      const readme = readFileSync(join(dir, "README.md"), "utf8");
      assert.match(readme, /\| `--caption-style /);
      for (const f of ["template.mjs", "SKILL.md", "README.md", "example.json"]) assert.ok(existsSync(join(dir, f)), f);
    });
  }

  it("refuses to overwrite without --force", async () => {
    await assert.rejects(scaffoldTemplate({ id: "blank-one", root, analysis: null }), /already exists/);
    await scaffoldTemplate({ id: "blank-one", root, analysis: null, force: true });
  });
});

describe("readAnalysis", () => {
  it("reports every problem in the agent-filled format block", async () => {
    const dir = mkdtempSync(join(tmpdir(), "reelclaw-an-"));
    try {
      const file = join(dir, "analysis.json");
      writeFileSync(file, JSON.stringify(fakeAnalysis({ category: "nope", texts: [{ text: "x", start: 3, end: 1 }] })));
      await assert.rejects(readAnalysis(file), (e) => /format\.category must be one of/.test(String(e)) && /end must be after start/.test(String(e)));
      writeFileSync(file, JSON.stringify(fakeAnalysis({ roles: ["a"] })));
      await assert.rejects(readAnalysis(file), /format\.roles has 1 entries but there are 3 shots/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("diffNotes", () => {
  it("names missing cuts and length differences", () => {
    const ref = fakeAnalysis();
    const yours = fakeAnalysis({}, [3.1]);
    assert.deepEqual(diffNotes(ref, yours), ["2 shot(s) vs reference 3", "reference cuts at 6s; your nearest cut is 3.1s"]);
    assert.deepEqual(diffNotes(ref, ref), []);
  });
});

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

describe("analyzeReference (real ffmpeg)", { skip: !hasFfmpeg && "ffmpeg not installed" }, () => {
  /** @type {string} */
  let root;
  before(() => {
    root = mkdtempSync(join(tmpdir(), "reelclaw-analyze-"));
    // 2 shots: red 1.5s → blue 1.5s, with a tone
    const r = spawnSync("ffmpeg", ["-v", "error", "-y",
      "-f", "lavfi", "-i", "color=red:s=180x320:r=30:d=1.5", "-f", "lavfi", "-i", "color=blue:s=180x320:r=30:d=1.5",
      "-f", "lavfi", "-i", "sine=f=440:d=3", "-filter_complex", "[0:v][1:v]concat=n=2:v=1[v]", "-map", "[v]", "-map", "2:a",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", join(root, "ref.mp4")]);
    assert.equal(r.status, 0, String(r.stderr));
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  it("writes analysis.json, keyframes, contact sheet, filmstrip; keeps format notes on re-run", async () => {
    const { dir, analysis } = await analyzeReference({ input: "ref.mp4", root, sourceUrl: "https://www.tiktok.com/@u/video/42" });
    assert.equal(dir, join(root, "analysis", "tiktok-42"));
    assert.deepEqual(analysis.shots.map((s) => s.start), [0, 1.5]);
    assert.equal(analysis.source.url, "https://www.tiktok.com/@u/video/42");
    for (const f of ["contact-sheet.png", "filmstrip.png", "shots/001.png", "shots/002.png"]) assert.ok(existsSync(join(dir, f)), f);
    assert.equal(readFileSync(join(root, "analysis", ".gitignore"), "utf8").trim().split("\n").pop(), "*");

    const file = join(dir, "analysis.json");
    const json = JSON.parse(readFileSync(file, "utf8"));
    json.format.name = "Red to blue";
    json.format.roles = ["a", "b"];
    writeFileSync(file, JSON.stringify(json));
    const again = await analyzeReference({ input: "ref.mp4", root, sourceUrl: "https://www.tiktok.com/@u/video/42" });
    assert.equal(again.analysis.format.name, "Red to blue");
    assert.deepEqual(again.analysis.format.roles, ["a", "b"]);
  });
});
