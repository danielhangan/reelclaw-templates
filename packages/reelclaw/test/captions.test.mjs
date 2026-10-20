// @ts-check
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CAPTION_RUNTIME, fitFontSize } from "../src/core/captions.mjs";
import { SAFE_BAND } from "../src/core/geometry.mjs";
import { caption } from "../src/core/timeline.mjs";

/**
 * Crude text-layout model: glyphs are 0.55em wide, lines are 1.4em tall,
 * words wrap at the box width. Good enough to exercise the fit loop.
 * @param {string} text
 * @param {number} width
 */
function heightAt(text, width) {
  return (/** @type {number} */ size) => {
    const glyph = size * 0.55;
    let lines = 1;
    let x = 0;
    for (const word of text.split(" ")) {
      const w = (word.length + 1) * glyph;
      if (x + w > width && x > 0) { lines++; x = 0; }
      x += w;
    }
    return lines * size * 1.4;
  };
}

describe("fitFontSize", () => {
  it("keeps the base size when the text fits", () => {
    assert.equal(fitFontSize(58, 26, 2, () => true), 58);
  });

  it("shrinks in steps to the largest size that fits", () => {
    /** @type {number[]} */
    const calls = [];
    const size = fitFontSize(58, 26, 2, (s) => { calls.push(s); return s <= 47; });
    assert.equal(size, 46);
    assert.deepEqual(calls.slice(0, 3), [58, 56, 54]);
  });

  it("never goes below the floor, even if nothing fits", () => {
    assert.equal(fitFontSize(58, 26, 2, () => false), 26);
    assert.equal(fitFontSize(20, 26, 2, () => false), 26);
  });

  it("fits a wall-of-text hook inside the safe band's default max height", () => {
    const hook = caption("wall ".repeat(160).trim(), { start: 0, duration: 3 });
    const measure = heightAt(hook.text, SAFE_BAND.w);
    const size = fitFontSize(hook.size, hook.minSize, 2, (s) => measure(s) <= hook.maxHeight);
    assert.ok(size < 58 && size >= 26, `shrunk to ${size}`);
    assert.ok(measure(size) <= hook.maxHeight, "fits");
    assert.ok(measure(size + 2) > hook.maxHeight, "and is the largest size that fits");
  });
});

describe("caption defaults", () => {
  it("default region is the safe band with 50px of slack", () => {
    const c = caption("hi", { start: 0, duration: 1 });
    assert.deepEqual(c.region, { x: 180, y: 220, w: 720, h: 1200 });
    assert.equal(c.maxHeight, 1150);
    assert.equal(c.size, 58);
    assert.equal(c.minSize, 26);
    assert.equal(c.style, "tiktok-outline");
  });
});

describe("CAPTION_RUNTIME", () => {
  it("is valid, self-contained JavaScript with no clocks or randomness", () => {
    assert.doesNotThrow(() => new Function(CAPTION_RUNTIME));
    assert.doesNotMatch(CAPTION_RUNTIME, /Math\.random|Date\.now|performance\.now|fetch\(/);
    assert.match(CAPTION_RUNTIME, /function fitFontSize/);
  });
});
