// @ts-check
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import beforeAfter from "../../../../templates/before-after/template.mjs";
import talkingHead from "../../../../templates/talking-head-captions/template.mjs";
import { compile } from "../../src/core/compile.mjs";
import { CANVAS, SAFE_BAND } from "../../src/core/geometry.mjs";
import { parseValues } from "../../src/core/inputs.mjs";
import { standIn } from "../../src/core/validate.mjs";

/** @typedef {import('../../src/core/types.mjs').MediaRef} MediaRef */

/** @param {Partial<MediaRef>} o @returns {MediaRef} */
const clipRef = (o = {}) => ({ ...standIn("video", "clip"), ...o });
const photo = standIn("image", "photo");
const ctx = { canvas: CANVAS, safe: SAFE_BAND };

describe("talking-head-captions build", () => {
  const words = [
    { text: "Stop", start: 0.3, end: 0.52 }, { text: "scrolling.", start: 0.52, end: 1.0 },
    { text: "Here", start: 1.9, end: 2.05 }, { text: "are", start: 2.05, end: 2.2 }, { text: "three", start: 2.2, end: 2.4 },
    { text: "things.", start: 2.4, end: 3.7 }, { text: "Number", start: 4.5, end: 4.7 }, { text: "one.", start: 4.7, end: 5.6 },
  ];
  /** @param {Record<string, unknown>} raw @param {Partial<MediaRef>} [clip] */
  const build = (raw, clip) => {
    /** @type {string[]} */
    const warnings = [];
    const values = parseValues(talkingHead.inputs, { clip: "x.mp4", ...raw });
    const inputs = { ...values, clip: clipRef({ duration: 6, ...clip }), broll: (/** @type {string[]} */ (values.broll)).map((b) => (b.endsWith(".jpg") ? photo : clipRef({ label: b }))) };
    const tl = talkingHead.build({ ...ctx, inputs: /** @type {any} */ (inputs), prepared: { words, voice: standIn("audio", "voice") }, warn: (m) => warnings.push(m) });
    return { tl, warnings, ids: tl.clips.map((c) => c.id) };
  };

  it("trims dead air, tightens pauses and keeps the voice on separate levelled audio", () => {
    const { tl, ids } = build({});
    // 0.15 → 6.1 (capped 5.95); pauses 1.0→1.9 and 3.7→4.5 each cut to 0.3s
    assert.equal(tl.duration, ms(5.95 - 0.15 - 0.6 - 0.5));
    assert.ok(ids.includes("speaker-1") && ids.includes("voice-1"));
    const speakers = tl.clips.filter((c) => c.type === "video" && c.id?.startsWith("speaker"));
    assert.ok(speakers.every((c) => c.type === "video" && c.volume === 0), "video muted, voice on <audio>");
    const zooms = speakers.map((c) => (c.type === "video" ? c.crop?.w : 0));
    assert.notEqual(zooms[0], zooms[1], "punch-in alternates the crop");
    // segments tile the reel with no gaps
    let t = 0;
    for (const s of speakers) {
      assert.equal(s.start, t);
      t = ms(s.start + s.duration);
    }
    assert.equal(t, tl.duration);
  });

  it("places karaoke chunks, the hook and b-roll in reel time and compiles", () => {
    const { tl, ids, warnings } = build({ hook: "watch this", broll: ["b.mp4", "p.jpg"], brollAt: ["2.0-2.4", "4.6+0.8"], music: undefined });
    assert.ok(ids.includes("hook") && ids.includes("cap-1") && ids.includes("broll-1"));
    const broll = tl.clips.find((c) => c.id === "broll-1");
    assert.equal(broll?.start, 1.25, "source 2.0s → reel 1.25s: kept speech resumes at 1.75s (= reel 1.0s)");
    assert.deepEqual(warnings, []);
    const { html } = compile(tl, { name: "th" });
    assert.match(html, /class="rc-cap rk rk--pop"/);
    assert.match(html, />SCROLLING</);
  });

  it("keeps the full clip with --max-pause 0 and --punch-in 1, and explains bad b-roll pairing", () => {
    const { tl } = build({ maxPause: 0, punchIn: 1, trim: 0 });
    assert.equal(tl.clips.filter((c) => c.id?.startsWith("speaker")).length, 1);
    assert.equal(tl.duration, 5.95);
    assert.throws(() => build({ broll: ["b.mp4"], brollAt: ["later"] }), (/** @type {any} */ e) => /not a time window/.test(e.message) && /4\.2-6/.test(e.hint));
    assert.throws(() => build({ trim: 5.8 }), /under 0.5s/);
  });
});

describe("before-after build", () => {
  /** @param {Record<string, unknown>} raw @param {{ before?: MediaRef, after?: MediaRef }} [media] */
  const build = (raw, media = {}) => {
    const values = parseValues(beforeAfter.inputs, { before: "a", after: "b", ...raw });
    const inputs = { ...values, before: media.before ?? photo, after: media.after ?? clipRef({ duration: 5 }) };
    const tl = beforeAfter.build({ ...ctx, inputs: /** @type {any} */ (inputs), prepared: {}, warn: () => {} });
    return { tl, byId: Object.fromEntries(tl.clips.map((c) => [c.id, c])) };
  };

  it("wipe: before alone, swipe, after holds — labels switch mid-swipe", () => {
    const { tl, byId } = build({ hook: "6 months", payoff: "worth it", beforeSecs: 1.5, afterSecs: 2.5 });
    assert.equal(tl.duration, 4.7);
    assert.deepEqual([byId.before.start, byId.before.duration], [0, 2.2]);
    assert.deepEqual([byId.after.start, byId.after.duration], [1.5, 3.2]);
    assert.equal(byId["after-wipe"].start, 1.5);
    assert.equal(byId["after-label"].start, 1.85);
    assert.equal(byId.hook.duration, 1.85, "payoff replaces the hook mid-swipe");
    const { html, warnings } = compile(tl, { name: "ba" });
    assert.match(html, /<div id="after" class="rc-box"/, "the clip carries a wrapper the swipe can mask");
    assert.ok(!warnings.some((w) => /safe band/.test(w)));
  });

  it("split: halves for the whole reel, hook on the seam, optional reveal", () => {
    const plain = build({ layout: "split", hook: "glow up" }, { before: clipRef({ duration: 6.2 }), after: photo });
    assert.equal(plain.tl.duration, 6.1, "length from the clip side");
    assert.equal(plain.byId.after.start, 0);
    assert.equal(plain.byId["after-wipe"], undefined);
    const revealed = build({ layout: "split", reveal: true, beforeSecs: 1.2, afterSecs: 3 });
    assert.equal(revealed.tl.duration, 4.9);
    assert.equal(revealed.byId["after-cover"].duration, 1.9);
    assert.equal(revealed.byId["after-wipe"].start, 1.2);
  });

  it("hides labels given as empty strings", () => {
    const { byId } = build({ beforeLabel: "", afterLabel: "" });
    assert.equal(byId["before-label"], undefined);
    assert.equal(byId["after-label"], undefined);
  });
});

/** @param {number} n */
function ms(n) {
  return Math.round(n * 1000) / 1000;
}
