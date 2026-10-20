// @ts-check
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cliOptions, flagName, flagsTable, input, inputsJsonSchema, keyName, parseValues } from "../src/core/inputs.mjs";
import { ReelclawError } from "../src/core/errors.mjs";

const inputs = {
  reaction: input.video({ required: true, description: "Reaction clip" }),
  hook: input.text({ required: true, description: "Hook" }),
  hookPosition: input.enum(["top", "center", "bottom"], { default: "center", description: "Where" }),
  hookSize: input.number({ default: 58, min: 26, max: 120, description: "Size" }),
  trim: input.number({ description: "Trim" }),
  loud: input.boolean({ description: "Loud" }),
  steps: input.list(input.text({ description: "step" }), { description: "Steps" }),
};

describe("flag names", () => {
  it("maps camelCase keys to kebab-case flags and back", () => {
    assert.equal(flagName("hookPosition"), "hook-position");
    assert.equal(flagName("hook2Position"), "hook2-position");
    assert.equal(keyName("hook-position"), "hookPosition");
    assert.equal(keyName(flagName("musicStart")), "musicStart");
  });
});

describe("parseValues", () => {
  it("applies defaults and coerces CLI strings", () => {
    const v = parseValues(inputs, { reaction: "a.mp4", hook: "hi", "hook-size": "40", loud: "yes", trim: "1.5" });
    assert.deepEqual(v, { reaction: "a.mp4", hook: "hi", hookPosition: "center", hookSize: 40, trim: 1.5, loud: true, steps: [] });
  });

  it("leaves optional inputs without defaults undefined", () => {
    const v = parseValues(inputs, { reaction: "a.mp4", hook: "hi" });
    assert.equal(v.trim, undefined);
    assert.equal(v.loud, false);
  });

  it("wraps a single list value into an array", () => {
    assert.deepEqual(parseValues(inputs, { reaction: "a", hook: "b", steps: "one" }).steps, ["one"]);
    assert.deepEqual(parseValues(inputs, { reaction: "a", hook: "b", steps: ["one", "two"] }).steps, ["one", "two"]);
  });

  it("reports every problem at once, by flag name", () => {
    assert.throws(
      () => parseValues(inputs, { "hook-position": "middle", hookSize: "200" }, { templateId: "demo" }),
      (/** @type {ReelclawError} */ err) => {
        assert.ok(err instanceof ReelclawError);
        assert.match(err.message, /--reaction is required/);
        assert.match(err.message, /--hook is required/);
        assert.match(err.message, /--hook-position: expected one of top \| center \| bottom \(got "middle"\)/);
        assert.match(err.message, /--hook-size: must be ≤ 120/);
        assert.match(err.hint ?? "", /reelclaw make demo --help/);
        return true;
      },
    );
  });

  it("rejects non-numbers and suggests the closest unknown key", () => {
    assert.throws(() => parseValues(inputs, { reaction: "a", hook: "b", trim: "abc" }), /--trim: expected a number/);
    assert.throws(
      () => parseValues(inputs, { reaction: "a", hook: "b", hok: "x" }),
      (/** @type {ReelclawError} */ err) => /did you mean --hook\?/.test(err.hint ?? ""),
    );
  });
});

describe("derived artefacts", () => {
  it("builds parseArgs options", () => {
    const o = cliOptions(inputs);
    assert.deepEqual(o["hook-position"], { type: "string" });
    assert.deepEqual(o.loud, { type: "boolean" });
    assert.deepEqual(o.steps, { type: "string", multiple: true });
  });

  it("renders a markdown flags table", () => {
    const t = flagsTable(inputs);
    assert.match(t, /\| `--reaction <file\\\|url>` \| \*\*required\*\* \| Reaction clip \|/);
    assert.match(t, /\| `--hook-position top\\\|center\\\|bottom` \| `center` \|/);
    assert.match(t, /Steps \(repeatable\)/);
    assert.doesNotMatch(t, /\((s|px)\) \|/, "units ride in the flag hint, not the description");
  });

  it("emits a JSON schema with required keys and enums", () => {
    const s = /** @type {any} */ (inputsJsonSchema(inputs));
    assert.deepEqual(s.required, ["reaction", "hook"]);
    assert.deepEqual(s.properties.hookPosition.enum, ["top", "center", "bottom"]);
    assert.equal(s.properties.hookSize.maximum, 120);
    assert.equal(s.properties.reaction["x-media"], "video");
  });

  it("requires a description on every input", () => {
    assert.throws(() => input.text({ description: " " }), /needs a description/);
  });
});
