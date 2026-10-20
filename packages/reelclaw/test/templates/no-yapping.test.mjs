// @ts-check
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseStep, scheduleSteps } from "../../../../templates/no-yapping/steps.mjs";
import template from "../../../../templates/no-yapping/template.mjs";
import { CANVAS, SAFE_BAND } from "../../src/core/geometry.mjs";
import { parseValues } from "../../src/core/inputs.mjs";
import { standIn } from "../../src/core/validate.mjs";

describe("no-yapping parseStep", () => {
  it("reads plain, sequential and windowed steps", () => {
    assert.deepEqual(parseStep("go to claude", 1), { text: "go to claude" });
    assert.deepEqual(parseStep("paste ur script :: 4", 2), { text: "paste ur script", secs: 4 });
    assert.deepEqual(parseStep("buy now :: 10-15.5", 3), { text: "buy now", at: 10, until: 15.5 });
    assert.deepEqual(parseStep("ratio 2::1 :: 2", 4), { text: "ratio 2::1", secs: 2 }, "timing comes after the last ::");
    assert.deepEqual(parseStep("trailing ::", 5), { text: "trailing" });
  });

  it("explains bad timings with the fix", () => {
    assert.throws(() => parseStep("go :: soon", 2), (/** @type {any} */ e) => /--step 2/.test(e.message) && /:: 4/.test(e.hint));
    assert.throws(() => parseStep("go :: 9-3", 1), /ends before it starts/);
    assert.throws(() => parseStep("go :: 0", 1), /must be > 0/);
    assert.throws(() => parseStep("  :: 3", 1), /no caption text/);
  });
});

describe("no-yapping scheduleSteps", () => {
  const steps = (/** @type {string[]} */ ...raw) => raw.map((s, i) => parseStep(s, i + 1));
  const when = (/** @type {{ start: number, duration: number }[]} */ p) => p.map((s) => [s.start, s.start + s.duration]);

  it("runs sequential steps from the split and holds the last one to the end", () => {
    const placed = scheduleSteps(steps("a", "b :: 4", "c"), { from: 6, end: 30, secs: 3 });
    assert.deepEqual(when(placed), [[6, 9], [9, 13], [13, 30]]);
  });

  it("shares the split evenly when no default length is given", () => {
    const placed = scheduleSteps(steps("a", "b :: 2", "c", "d"), { from: 4, end: 15 });
    // (11s split − 2s fixed) / 3 open steps = 3s
    assert.deepEqual(when(placed), [[4, 7], [7, 9], [9, 12], [12, 15]]);
    const tight = scheduleSteps(steps("a", "b", "c"), { from: 0, end: 3, minSecs: 1.5 });
    assert.deepEqual(when(tight), [[0, 1.5], [1.5, 3]], "never shorter than minSecs; overflow is dropped");
  });

  it("places windows absolutely and continues after them", () => {
    const placed = scheduleSteps(steps("a", "promo :: 10-12", "b"), { from: 6, end: 20, secs: 3 });
    assert.deepEqual(when(placed), [[6, 9], [10, 12], [12, 20]]);
  });

  it("cuts overlaps so captions never stack, and drops what doesn't fit", () => {
    /** @type {string[]} */ const warnings = [];
    const placed = scheduleSteps(steps("a :: 5", "b :: 8-9", "late :: 40-45", "c"), {
      from: 6, end: 20, warn: (m) => warnings.push(m),
    });
    assert.deepEqual(when(placed), [[6, 8], [8, 9], [9, 20]]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /step 3 \("late"\).*dropped/);
  });
});

describe("no-yapping build", () => {
  /** @param {Record<string, unknown>} raw @param {Record<string, any>} [media] */
  const build = (raw, media = {}) => {
    const values = parseValues(template.inputs, { intro: "i.mp4", typing: "t.mp4", demo: "d.mp4", hook: "x but no yapping", ...raw });
    const inputs = {
      ...values,
      intro: standIn("video", "intro"),
      typing: { ...standIn("video", "typing"), duration: 3 },
      demo: { ...standIn("video", "demo"), duration: 12, width: 1920, height: 1080 },
      ...media,
    };
    /** @type {string[]} */ const warnings = [];
    const tl = template.build({ inputs: /** @type {any} */ (inputs), prepared: {}, canvas: CANVAS, safe: SAFE_BAND, warn: (m) => warnings.push(m) });
    return { tl, warnings, clip: (/** @type {string} */ id) => /** @type {any} */ (tl.clips.find((c) => c.id === id)) };
  };

  it("derives the length from the media: intro (clamped 3–6s) + the demo", () => {
    const { tl, clip } = build({ step: ["go", "done"] });
    assert.equal(clip("intro").duration, 6, "8s intro clip is capped at 6s");
    assert.equal(tl.duration, 6 + 11.9);
    assert.equal(clip("typing").loop, true, "3s typing clip loops over the split");
    assert.deepEqual(clip("typing").box, { x: 0, y: 0, w: 1080, h: 960 });
    assert.deepEqual(clip("demo").box, { x: 0, y: 960, w: 1080, h: 960 });
    assert.ok(Math.abs(clip("step-2").start + clip("step-2").duration - tl.duration) < 0.002, "payoff step holds to the end");
  });

  it("keeps seam captions centred on the cut and inside the safe band", () => {
    const { clip } = build({ step: ["go"] });
    const r = clip("step-1").region;
    assert.equal(r.y + r.h / 2, 960);
    assert.ok(r.x >= SAFE_BAND.x && r.x + r.w <= SAFE_BAND.x + SAFE_BAND.w);
  });

  it("auto-fits the demo: cover for landscape, blur backdrop for a phone recording", () => {
    assert.equal(build({}).clip("demo").fit, "cover");
    assert.equal(build({}).clip("demo-bg"), undefined);
    const phone = build({}, { demo: { ...standIn("video", "demo"), duration: 10, width: 886, height: 1920 } });
    assert.equal(phone.clip("demo").fit, "contain");
    assert.ok(phone.clip("demo-bg"));
    const white = build({ demoFit: "contain" });
    assert.ok(white.clip("demo-panel"));
  });

  it("honours --demo-secs and warns when it asks for more than the demo has", () => {
    assert.equal(build({ demoSecs: 5, introSecs: 3 }).tl.duration, 8);
    const { tl, warnings } = build({ demoSecs: 50, introSecs: 3 });
    assert.equal(tl.duration, 3 + 11.9);
    assert.match(warnings.join("\n"), /--demo-secs 50/);
  });

  it("rejects a trim that leaves no footage, naming the flag", () => {
    assert.throws(() => build({ demoTrim: 11.9 }), /--demo-trim/);
  });
});
