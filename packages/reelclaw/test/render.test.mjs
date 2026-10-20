// @ts-check
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { declaredDuration, isNoise } from "../src/core/render.mjs";

describe("render output filtering", () => {
  it("drops HyperFrames bookkeeping and the project-root pre-check", () => {
    for (const line of [
      "[INFO] [Render] Pipeline started {\"renderJobId\":\"x\"}",
      "✗  No composition found in /tmp/p1",
      "   No index.html file found.",
      "   Run npx hyperframes init to create a new composition.",
      "\u001b[?25l│",
      "◒  Checking browser\u001b[1G\u001b[J◇  Browser: cache",
      "  Lint: 0 error(s), 2 warning(s) — run with --lint-verbose for full output.",
      "",
    ]) assert.ok(isNoise(line), line);
  });

  it("keeps progress, results and errors", () => {
    for (const line of [
      "  █████░░░░░░░░░░░░░░░░░░░░  20%  Processing audio tracks",
      "✗  Render failed",
      "[Browser:ERROR] The AudioContext encountered an error",
      "   1.9 MB · 8.9s video · rendered in 20.7s",
    ]) assert.ok(!isNoise(line), line);
  });

  it("reads the declared duration of a composition", () => {
    assert.equal(declaredDuration('<div id="root" data-composition-id="r" data-start="0" data-duration="8.9">'), 8.9);
    assert.equal(declaredDuration("<div>"), null);
  });
});
