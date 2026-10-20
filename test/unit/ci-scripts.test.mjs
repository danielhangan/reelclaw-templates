// @ts-check
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sample, selectTemplates, shard } from "../../scripts/changed-templates.mjs";
import { summaryMarkdown } from "../../scripts/smoke-render.mjs";

const IDS = ["greenscreen-reaction", "no-yapping", "reaction-demo", "wall-of-text"];

describe("selectTemplates", () => {
  it("picks templates whose folders changed", () => {
    const r = selectTemplates(["templates/reaction-demo/template.mjs", "templates/no-yapping/example.json", "templates/reaction-demo/example.json"], IDS);
    assert.deepEqual(r, { ids: ["no-yapping", "reaction-demo"], all: false, reason: "templates changed" });
  });

  it("ignores docs and previews inside a template", () => {
    const r = selectTemplates(["templates/reaction-demo/README.md", "templates/reaction-demo/SKILL.md", "templates/reaction-demo/preview.gif", "templates/reaction-demo/preview-safe-zones.png"], IDS);
    assert.deepEqual(r.ids, []);
  });

  it("ignores deleted or unknown template folders and unrelated files", () => {
    assert.deepEqual(selectTemplates(["templates/reaction_demo/new-reel.mjs", "README.md", "docs/TEMPLATE_API.md", "packages/reelclaw/test/x.test.mjs"], IDS).ids, []);
  });

  it("renders everything when shared render inputs change", () => {
    for (const f of ["packages/reelclaw/src/core/compile.mjs", "shared/fonts/TikTokSans-Variable.ttf", "package-lock.json", "scripts/make-fixtures.mjs", ".github/workflows/ci.yml"]) {
      const r = selectTemplates([f, "templates/no-yapping/template.mjs"], IDS);
      assert.equal(r.all, true, f);
      assert.deepEqual(r.ids, IDS);
      assert.match(r.reason, new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });
});

describe("sample", () => {
  it("returns everything under the cap, sorted", () => assert.deepEqual(sample(["b", "a"], 5), ["a", "b"]));
  it("spreads picks evenly and deterministically", () => {
    const ids = Array.from({ length: 10 }, (_, i) => `t${i}`);
    assert.deepEqual(sample(ids, 3), ["t0", "t3", "t6"]);
    assert.deepEqual(sample(ids, 3), sample([...ids].reverse(), 3));
  });
});

describe("shard", () => {
  it("names single-template shards after the template", () => {
    assert.deepEqual(shard(["a"], 8), [{ name: "a", templates: "a" }]);
  });
  it("chunks by size", () => {
    assert.deepEqual(shard(["a", "b", "c"], 2), [{ name: "shard-1", templates: "a b" }, { name: "c", templates: "c" }]);
    assert.deepEqual(shard([], 8), []);
  });
});

describe("summaryMarkdown", () => {
  it("renders one row per template and escapes pipes", () => {
    const md = summaryMarkdown([
      { id: "ok-one", ok: true, seconds: 12.3, problems: [], warnings: [], render: { width: 1080, height: 1920, fps: 30, duration: 8.9, videoCodec: "h264", pixFmt: "yuv420p", hasAudio: true, meanVolume: -20, maxVolume: -9, blackSeconds: 0 } },
      { id: "bad-one", ok: false, seconds: 0.4, problems: ["a | b"], warnings: [] },
    ]);
    assert.match(md, /\| ✅ \| `ok-one` \| 1080x1920 · 30fps · 8\.9s · -20 dB \| 12\.3s \|/);
    assert.match(md, /\| ❌ \| `bad-one` \| — \| 0\.4s \| ❌ a \\\| b \|/);
  });
});
