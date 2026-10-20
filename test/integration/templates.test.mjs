// @ts-check
/**
 * Integration: every template's example.json goes through the real pipeline
 * (stage → prepare → build → compile → `hyperframes lint`), and the compiled
 * HTML must be deterministic — the same inputs give byte-identical output,
 * in the same project and in a different one.
 *
 *   npm run test:integration                     # make + lint + determinism
 *   REELCLAW_RENDER=1 npm run test:integration   # also draft-render and ffprobe-check
 *   REELCLAW_TEMPLATES=reaction-demo,no-yapping npm run test:integration
 *
 * Fixture media are generated on first run (scripts/make-fixtures.mjs).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { makeExample } from "../../packages/reelclaw/src/core/example.mjs";
import { checkRender, expectationsFor, probeRender } from "../../packages/reelclaw/src/core/inspect.mjs";
import { renderReel } from "../../packages/reelclaw/src/core/render.mjs";
import { listTemplates } from "../../scripts/changed-templates.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RENDER = Boolean(process.env.REELCLAW_RENDER);
const only = process.env.REELCLAW_TEMPLATES?.split(/[\s,]+/).filter(Boolean);
const ids = listTemplates(ROOT).filter((id) => existsSync(join(ROOT, "templates", id, "example.json")) && (!only || only.includes(id)));

before(() => {
  const r = spawnSync(process.execPath, [join(ROOT, "scripts", "make-fixtures.mjs")], { encoding: "utf8" });
  assert.equal(r.status, 0, `fixtures: ${r.stderr}`);
});

it("finds templates to test", () => assert.ok(ids.length > 0, "no templates with example.json"));

for (const id of ids) {
  describe(id, () => {
    /** @type {string[]} */
    const projects = [];
    /** @type {Awaited<ReturnType<typeof makeExample>> | undefined} */
    let first;
    const project = async () => {
      const dir = await mkdtemp(join(tmpdir(), `reelclaw-it-${id}-`));
      projects.push(dir);
      return dir;
    };
    after(() => Promise.all(projects.map((p) => rm(p, { recursive: true, force: true }))));

    it("makes example.json and passes hyperframes lint", async () => {
      // makeReel runs `hyperframes lint` and throws on any error-level finding
      first = await makeExample({ template: id, root: ROOT, base: ROOT, project: await project() });
      assert.ok(first.made.duration > 0, "reel has a duration");
      assert.doesNotMatch(first.html, /\bhttps?:\/\/(?!www\.w3\.org)/, "compositions must not load anything from the network at render time");
      assert.doesNotMatch(first.html, /Math\.random\(|Date\.now\(|new Date\(|performance\.now\(/, "compositions must be deterministic");
      assert.ok(!first.html.includes(first.project), "compositions must not embed absolute project paths");
    });

    it("compiles deterministically (same inputs → identical HTML)", async (t) => {
      if (!first) return t.skip("make failed");
      const again = await makeExample({ template: id, root: ROOT, base: ROOT, project: first.project });
      assertSameHtml(again.html, first.html, "re-make in the same project");

      // a different project root, seeded with the first one's staged media + derive caches (no re-matting)
      const other = await project();
      await cp(join(first.project, "assets"), join(other, "assets"), { recursive: true });
      await cp(join(first.project, ".reelclaw"), join(other, ".reelclaw"), { recursive: true });
      const elsewhere = await makeExample({ template: id, root: ROOT, base: ROOT, project: other });
      assertSameHtml(elsewhere.html, first.html, "make in another project");
      assert.deepEqual(JSON.parse(await readFile(elsewhere.made.props, "utf8")), JSON.parse(await readFile(first.made.props, "utf8")));
    });

    it("renders to a valid 1080x1920 MP4", { skip: RENDER ? false : "set REELCLAW_RENDER=1 to render" }, async (t) => {
      if (!first) return t.skip("make failed");
      const r = await renderReel({ root: first.project, name: first.made.name, quality: "draft", workers: 2, onLine: () => {} });
      const check = checkRender(await probeRender(r.output), expectationsFor(first.html));
      assert.deepEqual(check.problems, []);
    });
  });
}

/**
 * Equal HTML, or a failure that shows the first differing line.
 * @param {string} actual
 * @param {string} expected
 * @param {string} what
 */
function assertSameHtml(actual, expected, what) {
  if (actual === expected) return;
  const a = actual.split("\n");
  const e = expected.split("\n");
  const i = a.findIndex((line, n) => line !== e[n]);
  const at = i === -1 ? Math.min(a.length, e.length) : i;
  assert.fail(`${what}: compiled HTML differs at line ${at + 1}\n  first:  ${e[at]?.slice(0, 200)}\n  second: ${a[at]?.slice(0, 200)}`);
}
