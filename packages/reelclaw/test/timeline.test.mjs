// @ts-check
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { layout, place } from "../src/core/geometry.mjs";
import { input } from "../src/core/inputs.mjs";
import { summarizeTemplate } from "../src/core/manifest.mjs";
import { defineTemplate } from "../src/core/template.mjs";
import { caption, clipLength, end, music, timeline, video } from "../src/core/timeline.mjs";
import { standIn } from "../src/core/validate.mjs";

const clip = standIn("video", "clip"); // 8s
const track = standIn("audio", "music"); // 30s

describe("timeline()", () => {
  it("takes its duration from visual clips only and stretches music to it", () => {
    const tl = timeline([video(clip, { duration: 3 }), video(clip, { start: 3, duration: 2.5 }), music(track)]);
    assert.equal(tl.duration, 5.5);
    const m = tl.clips.find((c) => c.type === "audio");
    assert.equal(m?.duration, 5.5);
    assert.equal(m?.type === "audio" && m.fadeOut, 0.8);
  });

  it("drops falsy entries and flattens arrays", () => {
    const optional = /** @type {string | undefined} */ (undefined);
    const tl = timeline([video(clip), optional && caption(optional, { start: 0, duration: 1 }), [caption("a", { start: 0, duration: 1 })]]);
    assert.deepEqual(tl.clips.map((c) => c.type), ["video", "caption"]);
  });

  it("rejects a timeline with nothing visual", () => {
    assert.throws(() => timeline([music(track)]), /duration is 0/);
  });

  it("rejects non-media passed to media builders with a hint", () => {
    assert.throws(() => video(/** @type {any} */ ("clip.mp4")), /expects a media input/);
  });
});

describe("helpers", () => {
  it("clipLength rounds down to 0.1s with a safety margin", () => {
    assert.equal(clipLength({ ...clip, duration: 6 }), 5.9);
    assert.equal(clipLength({ ...clip, duration: 6.04 }, 1), 4.9);
    assert.equal(clipLength({ ...clip, duration: 1 }, 2), 0);
    assert.equal(end({ start: 1.2, duration: 2.35 }), 3.55);
  });

  it("layout boxes", () => {
    assert.deepEqual(layout.split(0.5), { top: { x: 0, y: 0, w: 1080, h: 960 }, bottom: { x: 0, y: 960, w: 1080, h: 960 } });
    assert.deepEqual(place(200, 400, "bottom-right", 20), { x: 860, y: 1500, w: 200, h: 400 });
    assert.deepEqual(place(200, 400, "center"), { x: 440, y: 760, w: 200, h: 400 });
    assert.deepEqual(layout.band(960, 240), { x: 180, y: 840, w: 720, h: 240 });
  });
});

describe("summarizeTemplate", () => {
  it("describes inputs, media needs and the install line", () => {
    const t = defineTemplate({
      id: "demo-x", name: "Demo", description: "A template used to test the machine-readable summary.", category: "other",
      inputs: {
        clip: input.video({ required: true, description: "Clip" }),
        steps: input.list(input.image({ description: "img" }), { description: "Images" }),
        pos: input.enum(["a", "b"], { default: "a", description: "Pos" }),
      },
      build: ({ inputs }) => timeline([video(inputs.clip)]),
    });
    const s = summarizeTemplate(t);
    assert.equal(s.install, "npx reelclaw@latest add demo-x");
    assert.deepEqual(s.media, ["clip", "steps"]);
    assert.deepEqual(s.inputs[2], { key: "pos", flag: "--pos", kind: "enum", required: false, default: "a", options: ["a", "b"], description: "Pos", hint: "a|b" });
    assert.equal(s.inputs[1].kind, "list<image>");
  });
});
