// @ts-check
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { translateArgs } from "../../../cli/bin/forward.mjs";
import { nameRows } from "../src/cli/commands/batch.mjs";
import { parseSelection } from "../src/cli/lib/picker.mjs";
import {
  engineDependency, installTemplate, packageName, updateGitignore, updatePackageJson, upsertBlock, writeAgentDocs, syncSkills,
} from "../src/cli/lib/project.mjs";
import { buildRegistry, marketplaceManifest, templateFiles, withGallery } from "../src/cli/lib/registry.mjs";
import { checkEntry, githubSource, localSource } from "../src/cli/lib/sources.mjs";
import { REPO_ROOT } from "../src/core/project.mjs";

/** @typedef {import('../src/cli/lib/registry.mjs').RegistryEntry} RegistryEntry */
/** @typedef {import('../src/cli/lib/sources.mjs').TemplateSource} TemplateSource */

const tmp = () => mkdtempSync(join(tmpdir(), "reelclaw-dist-"));

describe("picker selection", () => {
  const ids = ["a", "b-c", "d", "e"];
  it("accepts numbers, ranges, ids (snake_case too) and all", () => {
    assert.deepEqual(parseSelection("1, 3", ids), { ids: ["a", "d"], invalid: [] });
    assert.deepEqual(parseSelection("2-4", ids).ids, ["b-c", "d", "e"]);
    assert.deepEqual(parseSelection("b_c 1", ids).ids, ["b-c", "a"]);
    assert.deepEqual(parseSelection("ALL", ids).ids, ids);
  });
  it("reports what it cannot match", () => {
    assert.deepEqual(parseSelection("0 9 zz 3-9", ids).invalid, ["0", "9", "zz", "3-9"]);
  });
});

describe("engine dependency", () => {
  it("installs the running engine and upgrades older ranges", () => {
    assert.equal(engineDependency(undefined, "^0.2.0"), "^0.2.0");
    assert.equal(engineDependency("^0.1.0", "^0.2.0"), "^0.2.0");
    assert.equal(engineDependency("github:danielhangan/reelclaw-templates", "^0.2.0"), "^0.2.0");
  });
  it("never downgrades and keeps local links", () => {
    assert.equal(engineDependency("^0.3.1", "^0.2.0"), "^0.3.1");
    assert.equal(engineDependency("file:/src/packages/reelclaw", "^0.2.0"), "file:/src/packages/reelclaw");
  });
});

describe("markdown block", () => {
  it("creates, replaces in place and keeps user text", () => {
    const first = upsertBlock("", "v1");
    assert.match(first, /^<!-- reelclaw:start[^>]*-->\nv1\n<!-- reelclaw:end -->\n$/);
    const withUser = `# Mine\n\n${first}\nmy notes\n`;
    const second = upsertBlock(withUser, "v2 $& $1");
    assert.ok(second.startsWith("# Mine\n\n<!-- reelclaw:start"));
    assert.ok(second.includes("v2 $& $1") && !second.includes("v1") && second.endsWith("my notes\n"));
    assert.equal(upsertBlock("# Existing", "x").split("reelclaw:start").length, 2);
  });
});

describe("legacy reelclaw-templates args", () => {
  it("maps v1 usage onto `reelclaw add`", () => {
    assert.deepEqual(translateArgs([]), ["add"]);
    assert.deepEqual(translateArgs(["reaction_demo"]), ["add", "reaction_demo", "--dir", "reaction_demo"]);
    assert.deepEqual(translateArgs(["reaction_demo", "my-dir", "--ref", "dev"]), ["add", "reaction_demo", "--ref", "dev", "--dir", "my-dir"]);
    assert.deepEqual(translateArgs(["-l"]), ["add", "--list"]);
    assert.deepEqual(translateArgs(["--src", "../repo"]), ["add", "--src", "../repo"]);
  });
});

describe("batch rows", () => {
  const firstFree = () => "reaction-demo-4";
  it("names unnamed rows from the first free number and accepts both row shapes", () => {
    const rows = nameRows([{ hook: "a" }, { name: "b", hook: "b" }, { inputs: { hook: "c" } }], { prefix: "reaction-demo", firstFree });
    assert.deepEqual(rows.map((r) => r.name), ["reaction-demo-4", "b", "reaction-demo-5"]);
    assert.deepEqual(rows[2].inputs, { hook: "c" });
    assert.deepEqual(rows[1].inputs, { hook: "b" });
  });
  it("rejects duplicates, bad names and non-objects", () => {
    assert.throws(() => nameRows([{ name: "x" }, { name: "x" }], { prefix: "p", firstFree }), /duplicate name "x"/);
    assert.throws(() => nameRows([{ name: "Bad Name" }], { prefix: "p", firstFree }), /invalid name/);
    assert.throws(() => nameRows(["hook"], { prefix: "p", firstFree }), /row 1 must be a JSON object/);
    assert.throws(() => nameRows([], { prefix: "p", firstFree }), /no rows/);
  });
});

describe("registry", () => {
  it("lists the repo's templates with files, inputs and the three install one-liners", async (t) => {
    if (!REPO_ROOT) return t.skip("not running from the repo");
    const { registry } = await buildRegistry(REPO_ROOT);
    const rd = registry.templates.find((x) => x.id === "reaction-demo");
    assert.ok(rd, "reaction-demo is in the registry");
    assert.ok(rd.files.includes("template.mjs") && rd.files.includes("SKILL.md"));
    assert.ok(rd.media.includes("reaction"));
    assert.equal(rd.install.skills, "npx skills add danielhangan/reelclaw-templates --skill reaction-demo");
    const plugin = marketplaceManifest(registry).plugins[0];
    assert.ok(plugin.skills.includes("./templates/reaction-demo"));
  });

  it("rewrites only the README gallery block", async (t) => {
    if (!REPO_ROOT) return t.skip("not running from the repo");
    const { registry } = await buildRegistry(REPO_ROOT);
    const readme = "# x\n\n<!-- gallery:start (generated) -->\nold\n<!-- gallery:end -->\n\nkeep me\n";
    const out = withGallery(readme, registry);
    assert.match(out, /^# x\n\n<!-- gallery:start \(generated\) -->\n\| Preview \| Template/);
    assert.match(out, /`npx reelclaw@latest add reaction-demo`/);
    assert.match(out, /<!-- gallery:end -->\n\nkeep me\n$/);
    assert.equal(withGallery("no markers", registry), "no markers");
  });

  it("copies every file but previews and dotfiles", async () => {
    const dir = tmp();
    for (const f of ["template.mjs", "SKILL.md", "preview.gif", ".DS_Store", "lib/x.mjs"]) {
      await mkdir(join(dir, f, ".."), { recursive: true });
      writeFileSync(join(dir, f), "x");
    }
    assert.deepEqual(templateFiles(dir), ["SKILL.md", "lib/x.mjs", "template.mjs"]);
    rmSync(dir, { recursive: true });
  });

  it("refuses registry entries that would write outside the template folder", () => {
    const ok = /** @type {RegistryEntry} */ (/** @type {unknown} */ ({ id: "a-b", path: "templates/a-b", files: ["template.mjs", "lib/x.mjs"] }));
    checkEntry(ok);
    for (const bad of [{ files: ["../x"] }, { files: ["/etc/passwd"] }, { files: [".env"] }, { id: "../x", path: "templates/../x" }, { path: "elsewhere" }]) {
      assert.throws(() => checkEntry({ ...ok, ...bad }), /unsafe paths/);
    }
  });
});

describe("installTemplate", () => {
  /** @type {Record<string, string>} */
  let upstream = { "template.mjs": "v1", "SKILL.md": "---\nname: t\ndescription: Test skill\n---\n" };
  /** @type {TemplateSource} */
  const source = {
    label: "fake",
    from: "fake",
    catalog: async () => ({ entries: [], warnings: [] }),
    fetch: async (_e, dest) => {
      await mkdir(dest, { recursive: true });
      for (const [f, text] of Object.entries(upstream)) await writeFile(join(dest, f), text);
    },
  };
  const entry = /** @type {RegistryEntry} */ (/** @type {unknown} */ ({ id: "t", path: "templates/t", files: [] }));

  it("adds, updates untouched copies, keeps local edits, and --force replaces them", async () => {
    const root = tmp();
    const a = await installTemplate({ root, source, entry });
    assert.equal(a.status, "added");
    assert.equal((await installTemplate({ root, source, entry, record: a.record })).status, "unchanged");

    upstream = { ...upstream, "template.mjs": "v2", "extra.mjs": "new" };
    const u = await installTemplate({ root, source, entry, record: a.record });
    assert.equal(u.status, "updated");
    assert.equal(readFileSync(join(root, "templates/t/template.mjs"), "utf8"), "v2");

    writeFileSync(join(root, "templates/t/template.mjs"), "my edit");
    upstream = { "template.mjs": "v3", "SKILL.md": upstream["SKILL.md"] };
    const k = await installTemplate({ root, source, entry, record: u.record });
    assert.equal(k.status, "kept");
    assert.equal(k.record, u.record);
    assert.equal(readFileSync(join(root, "templates/t/template.mjs"), "utf8"), "my edit");

    const f = await installTemplate({ root, source, entry, record: u.record, force: true });
    assert.equal(f.status, "updated");
    assert.equal(readFileSync(join(root, "templates/t/template.mjs"), "utf8"), "v3");
    assert.ok(!existsSync(join(root, "templates/t/extra.mjs")), "files removed upstream are removed");
    assert.deepEqual(readdirSync(join(root, ".reelclaw/tmp")), [], "staging folders are cleaned up");

    // project files are idempotent and keep user content
    writeFileSync(join(root, ".gitignore"), "secrets.txt");
    writeFileSync(join(root, "AGENTS.md"), "# My notes\n");
    for (let i = 0; i < 2; i++) {
      await updatePackageJson(root, { engine: "^0.1.0", records: { t: /** @type {any} */ (f.record) } });
      await updateGitignore(root);
      await writeAgentDocs(root);
      await syncSkills(root, ["t"], { overwrite: false });
    }
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    assert.equal(pkg.dependencies.reelclaw, "^0.1.0");
    assert.deepEqual(Object.keys(pkg.reelclaw.templates), ["t"]);
    const gi = readFileSync(join(root, ".gitignore"), "utf8");
    assert.ok(gi.startsWith("secrets.txt\n") && gi.split("renders/").length === 2);
    const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
    assert.ok(agents.startsWith("# My notes") && agents.includes("**t**: Test skill") && agents.split("reelclaw:start").length === 2);
    assert.match(readFileSync(join(root, "CLAUDE.md"), "utf8"), /^@AGENTS\.md$/m);
    assert.ok(existsSync(join(root, ".claude/skills/t/SKILL.md")) && existsSync(join(root, ".agents/skills/t/SKILL.md")));
    rmSync(root, { recursive: true });
  });

  it("derives package names from folder names", () => {
    assert.equal(packageName("My Reels!"), "my-reels");
    assert.equal(packageName("..."), "reels");
  });
});

describe("sources", () => {
  /** @type {import('node:http').Server} */
  let server;
  let base = "";
  const prev = process.env.REELCLAW_RAW_BASE;
  before(async () => {
    // serves /<owner>/<repo>/<ref>/<path> from the checkout, like raw.githubusercontent.com
    server = createServer((req, res) => {
      const m = /^\/[^/]+\/[^/]+\/main\/(.+)$/.exec(req.url ?? "");
      const file = m && REPO_ROOT ? join(REPO_ROOT, decodeURIComponent(m[1])) : "";
      if (!file || !existsSync(file)) return void res.writeHead(404).end();
      res.end(readFileSync(file));
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", () => r(undefined)));
    const addr = /** @type {import('node:net').AddressInfo} */ (server.address());
    base = `http://127.0.0.1:${addr.port}`;
    process.env.REELCLAW_RAW_BASE = base;
  });
  after(() => {
    server.close();
    if (prev === undefined) delete process.env.REELCLAW_RAW_BASE;
    else process.env.REELCLAW_RAW_BASE = prev;
  });

  it("github source reads registry.json and fetches a template's files", async (t) => {
    if (!REPO_ROOT || !existsSync(join(REPO_ROOT, "registry.json"))) return t.skip("no registry.json in the checkout");
    const src = githubSource({ ref: "main" });
    const { entries } = await src.catalog();
    const entry = entries.find((e) => e.id === "reaction-demo");
    assert.ok(entry);
    const dest = tmp();
    await src.fetch(entry, join(dest, "t"));
    assert.deepEqual(templateFiles(join(dest, "t")), entry.files);
    rmSync(dest, { recursive: true });
  });

  it("explains a missing registry and a bad repo", async () => {
    await assert.rejects(githubSource({ ref: "nope" }).catalog(), (/** @type {any} */ e) => /not found/.test(e.message) && /check --ref/.test(e.hint));
    assert.throws(() => githubSource({ repo: "not a repo" }), /owner\/name/);
    assert.throws(() => localSource(tmpdir()), /not a reelclaw-templates checkout/);
  });
});
