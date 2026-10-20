// @ts-check
// Components used by the text-driven formats (wall-of-text, listicle):
// native text box, footage framing/sequencing, beat snapping, pacing, badge,
// and the "visual" (video or image) media kind.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { numberBadge } from "../src/core/components/badge.mjs";
import { parseBeats, snapToBeats, toReelTime } from "../src/core/components/beats.mjs";
import { evenCuts, framing, sequence, slotBounds, visual } from "../src/core/components/footage.mjs";
import { nativeText } from "../src/core/components/native-text.mjs";
import { readingSeconds, splitTimed } from "../src/core/components/pacing.mjs";
import { compile } from "../src/core/compile.mjs";
import { input, inputsJsonSchema, isMediaKind, valueHint } from "../src/core/inputs.mjs";
import { checkKind } from "../src/core/media/stage.mjs";
import { timeline } from "../src/core/timeline.mjs";
import { standIn } from "../src/core/validate.mjs";

const portrait = standIn("video", "portrait"); // 8s 1080x1920
const landscape = { ...standIn("video", "landscape"), width: 1920, height: 1080, duration: 3 };
const photo = standIn("image", "photo"); // 1080x1350

describe("nativeText()", () => {
  it("emits a fit-able caption with a goo-filtered background and escaped text", () => {
    const clip = nativeText("pov: <you> & me\n\nline two", { id: "card", start: 1, duration: 4 });
    assert.equal(clip.type, "html");
    assert.match(clip.html, /class="rc-cap rc-nt"/);
    assert.match(clip.html, /data-size="50" data-min-size="26" data-max-h="1150"/);
    assert.match(clip.html, /filter: url\(#card-goo\)/);
    assert.match(clip.html, /&lt;you&gt; &amp; me/);
    // one box run per paragraph (blank lines stay empty), drawn twice (background + text)
    assert.equal(clip.html.match(/<span style="background: #ffffff;">/g)?.length, 2);
  });

  it("rejects regions outside the safe band unless unsafe", () => {
    const region = { x: 0, y: 0, w: 1080, h: 200 };
    assert.throws(() => nativeText("hi", { start: 0, duration: 1, region }), /safe band/);
    assert.doesNotThrow(() => nativeText("hi", { start: 0, duration: 1, region, unsafe: true }));
  });

  it("compiles to a lint-shaped composition", () => {
    const { html } = compile(timeline([nativeText("hello", { id: "t", start: 0, duration: 2, theme: "dark" })]), { name: "nt" });
    assert.match(html, /\.rc-nt \.rc-nt-fg \{ position: relative; \}/);
    assert.match(html, /opacity: 0\.72/);
  });
});

describe("footage", () => {
  it("frames portrait sources with cover and landscape ones with a blur fill", () => {
    assert.equal(framing(portrait), "cover");
    assert.equal(framing(landscape), "blur");
    assert.equal(framing(landscape, "cover"), "cover");
    const [bg, fg] = visual(landscape, { id: "x", start: 0, duration: 2 });
    assert.equal(bg.id, "x-bg");
    assert.equal(fg.type === "video" && fg.fit, "contain");
    // the backdrop is the same file under an equivalent path (avoids a HyperFrames lint warning)
    assert.equal(bg.type === "video" && bg.src.src, "assets/../assets/landscape.stand-in");
  });

  it("loops a short video and pushes in on stills", () => {
    const [v] = visual(landscape, { start: 0, duration: 7, fill: "cover" });
    assert.equal(v.type === "video" && v.loop, true);
    const [img] = visual(photo, { start: 2, duration: 3, fill: "cover" });
    assert.deepEqual(img.type === "image" && img.motion[0].to, { scale: 1.08 });
  });

  it("evenCuts splits a window into equal slots without slivers", () => {
    assert.deepEqual(evenCuts(0, 9, 3), [3, 6]);
    assert.deepEqual(evenCuts(0, 10, 3), [3.333, 6.667]);
    assert.deepEqual(evenCuts(2, 2, 3), []);
  });

  it("slotBounds covers the window exactly and ignores bad cuts", () => {
    assert.deepEqual(slotBounds(0, 6, [4, 2, 5.9, 9]), [[0, 2], [2, 4], [4, 6]]);
  });

  it("sequence cycles sources and continues reused footage", () => {
    const clips = sequence([portrait, photo], { start: 0, duration: 8, slot: 2, fill: "cover" });
    const visible = clips.map((c) => c.id);
    assert.deepEqual(visible, ["broll-1", "broll-2", "broll-3", "broll-4"]);
    const third = clips[2];
    assert.equal(third.type === "video" && third.trim, 2); // portrait resumes where it left off
    assert.equal(third.start, 4);
  });
});

describe("beats", () => {
  it("parses hyperframes beats output and shifts it to reel time", () => {
    const beats = parseBeats({ beats: [{ time: 1.5 }, { time: 0.5, strength: 1 }, { time: "x" }] });
    assert.deepEqual(beats, [0.5, 1.5]);
    assert.deepEqual(toReelTime(beats, 1), [0.5]);
    assert.throws(() => parseBeats({}), /no beats/);
  });

  it("snaps cuts to the nearest beat within tolerance, keeping order and gaps", () => {
    const beats = [0.6, 1.2, 1.8, 2.4, 3.0, 3.6];
    assert.deepEqual(snapToBeats([1.1, 2.5, 5], beats), [1.2, 2.4, 5]);
    // two cuts near the same beat: the second has no free beat in tolerance, so it is pushed to keep minGap
    assert.deepEqual(snapToBeats([1.7, 1.9], beats, { minGap: 0.5 }), [1.8, 2.3]);
  });
});

describe("pacing + badge", () => {
  it("readingSeconds scales with words and clamps", () => {
    assert.equal(readingSeconds("one two three four"), 1.6);
    assert.equal(readingSeconds("hi"), 1.5);
    assert.equal(readingSeconds("w ".repeat(200)), 12);
  });

  it("splitTimed reads an optional ' :: secs' suffix", () => {
    assert.deepEqual(splitTimed("perplexity :: 4"), { text: "perplexity", secs: 4 });
    assert.deepEqual(splitTimed("remove.bg::2.5s"), { text: "remove.bg", secs: 2.5 });
    assert.deepEqual(splitTimed("  a :: b "), { text: "a :: b" });
  });

  it("numberBadge centres a circle on the given point", () => {
    const b = numberBadge(10, { start: 0, duration: 1, center: { x: 540, y: 300 }, size: 100 });
    assert.deepEqual(b.box, { x: 490, y: 250, w: 100, h: 100 });
    assert.match(b.html, />10</);
  });
});

describe("input.visual()", () => {
  it("is a media kind that accepts videos and images but not audio-only files", () => {
    const spec = input.visual({ description: "b-roll" });
    assert.equal(isMediaKind(spec.kind), true);
    assert.equal(valueHint(spec), "<file|url>");
    assert.equal(/** @type {any} */ (inputsJsonSchema({ b: spec }).properties).b["x-media"], "visual");
    assert.doesNotThrow(() => checkKind(portrait, "visual", "b"));
    assert.doesNotThrow(() => checkKind(photo, "visual", "b"));
    assert.throws(() => checkKind(standIn("audio", "a"), "visual", "b"), /video or an image/);
  });
});
