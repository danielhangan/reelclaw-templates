// @ts-check
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseFlags } from "../src/cli/args.mjs";
import { replaceBlock, FLAGS_END, FLAGS_START } from "../src/cli/commands/docs.mjs";
import { input } from "../src/core/inputs.mjs";
import { loadTemplate, normalizeId } from "../src/core/loader.mjs";
import { REPO_ROOT } from "../src/core/project.mjs";
import { defineTemplate, isTemplate } from "../src/core/template.mjs";
import { timeline, video } from "../src/core/timeline.mjs";
import { parseFrontmatter } from "../src/core/validate.mjs";

const base = {
  id: "my-template",
  name: "Mine",
  description: "A template used by the unit tests to check manifest validation.",
  category: "other",
  inputs: { clip: input.video({ required: true, description: "Clip" }) },
  build: (/** @type {any} */ { inputs }) => timeline([video(inputs.clip)]),
};

describe("defineTemplate", () => {
  it("returns a branded, frozen template", () => {
    const t = defineTemplate(base);
    assert.ok(isTemplate(t));
    assert.ok(Object.isFrozen(t));
    assert.deepEqual(t.tags, []);
  });

  it("rejects bad manifests with every reason", () => {
    assert.throws(
      () => defineTemplate({ ...base, id: "My_Template", category: "nope" }),
      (/** @type {Error} */ e) => /id must be kebab-case/.test(e.message) && /category must be one of/.test(e.message),
    );
  });

  it("rejects input keys that clash with built-in flags, and invalid defaults", () => {
    assert.throws(() => defineTemplate({ ...base, inputs: { name: input.text({ description: "x" }) } }), /clashes with the built-in --name flag/);
    assert.throws(() => defineTemplate({ ...base, inputs: { hook_text: input.text({ description: "x" }) } }), /must be camelCase/);
    assert.throws(
      () => defineTemplate({ ...base, inputs: { size: input.number({ description: "x", min: 10, default: 5 }) } }),
      /default of "size" is invalid/,
    );
  });
});

describe("loader", () => {
  it("accepts v1 snake_case ids", () => {
    assert.equal(normalizeId("reaction_demo"), "reaction-demo");
  });

  it("loads the reference template from the repo", { skip: !REPO_ROOT && "not a git checkout" }, async () => {
    const { template, source } = await loadTemplate("reaction_demo", /** @type {string} */ (REPO_ROOT));
    assert.equal(template.id, "reaction-demo");
    assert.equal(source, "project");
  });
});

describe("cli args", () => {
  const opts = { x: { type: /** @type {const} */ ("string") }, flag: { type: /** @type {const} */ ("boolean") } };
  it("takes negative numbers as values and supports --no-flag", () => {
    assert.deepEqual(parseFlags(["--x", "-20", "--no-flag"], opts).values, { x: "-20", flag: false });
  });
  it("suggests the closest flag for typos", () => {
    assert.throws(() => parseFlags(["--flg"], opts), (/** @type {any} */ e) => /unknown flag --flg/.test(e.message) && /--flag/.test(e.hint));
  });
});

describe("docs + SKILL.md helpers", () => {
  it("replaces the generated flags block", () => {
    const readme = `# x\n${FLAGS_START}\nold\n${FLAGS_END}\nmore`;
    assert.equal(replaceBlock(readme, "NEW"), `# x\n${FLAGS_START}\nNEW\n${FLAGS_END}\nmore`);
    assert.equal(replaceBlock("# no markers", "NEW"), null);
  });
  it("reads SKILL.md frontmatter", () => {
    assert.deepEqual(parseFrontmatter('---\nname: reaction-demo\ndescription: "Make a reel"\n---\n# body'), { name: "reaction-demo", description: "Make a reel" });
    assert.equal(parseFrontmatter("# no frontmatter"), null);
  });
});
