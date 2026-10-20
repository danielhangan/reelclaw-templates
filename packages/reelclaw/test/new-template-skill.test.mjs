// @ts-check
/**
 * The contributor skill ships twice: .claude/skills/new-template (Claude Code)
 * and .agents/skills/new-template (Codex). Keep them identical and valid.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { REPO_ROOT } from "../src/core/project.mjs";
import { parseFrontmatter } from "../src/core/validate.mjs";

const claude = REPO_ROOT && join(REPO_ROOT, ".claude", "skills", "new-template");
const codex = REPO_ROOT && join(REPO_ROOT, ".agents", "skills", "new-template");

/** @param {string} dir @returns {string[]} */
const files = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));

describe("new-template skill", { skip: !(claude && existsSync(claude)) && "not in a reelclaw-templates checkout" }, () => {
  it("has Agent Skills frontmatter matching its folder", () => {
    const fm = parseFrontmatter(readFileSync(join(/** @type {string} */ (claude), "SKILL.md"), "utf8"));
    assert.equal(fm?.name, "new-template");
    assert.ok(fm?.description && fm.description.length >= 40 && fm.description.length <= 1024);
  });

  it(".agents copy (Codex) matches .claude (Claude Code)", () => {
    const a = /** @type {string} */ (claude);
    const b = /** @type {string} */ (codex);
    const fix = "fix: rm -rf .agents/skills/new-template && cp -R .claude/skills/new-template .agents/skills/";
    assert.ok(existsSync(b), fix);
    const list = (/** @type {string} */ d) => files(d).map((f) => relative(d, f)).sort();
    assert.deepEqual(list(b), list(a), fix);
    for (const f of list(a)) assert.equal(readFileSync(join(b, f), "utf8"), readFileSync(join(a, f), "utf8"), `${f} differs — ${fix}`);
  });
});
