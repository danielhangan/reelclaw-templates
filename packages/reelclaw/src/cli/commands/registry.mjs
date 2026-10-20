// @ts-check
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ReelclawError } from "../../core/errors.mjs";
import { color } from "../../core/log.mjs";
import { REPO_ROOT } from "../../core/project.mjs";
import { DEFAULT_REF, MARKETPLACE_FILE, REGISTRY_FILE, REPO, buildRegistry, marketplaceManifest, toJson, withGallery } from "../lib/registry.mjs";

/** @type {import('../main.mjs').Command} */
export default {
  summary: "regenerate registry.json, .claude-plugin/marketplace.json and the README gallery (repo maintainers)",
  usage: `
Usage
  reelclaw registry            write registry.json, .claude-plugin/marketplace.json and the README gallery
  reelclaw registry --check    exit 1 if any of them is stale (CI)
  reelclaw registry --stdout   print registry.json instead of writing it

Run in a reelclaw-templates checkout (or pass --project <checkout>). Loads every
templates/<id>/template.mjs; any template that fails to load fails the command.

registry.json is what \`npx reelclaw@latest add\` reads from GitHub, so a merged
template is installable right away. marketplace.json makes the repo a Claude
Code plugin marketplace and lets \`npx skills add ${REPO}\` find the
template skills.

Flags
  --check            compare instead of writing
  --stdout           print the registry
  --skip-invalid     leave out templates that fail to load (work in progress) instead of failing
  --repo <owner/n>   repo used in install commands and preview URLs (default ${REPO})
  --ref <ref>        branch used in preview URLs (default ${DEFAULT_REF})`,
  options: {
    check: { type: "boolean" },
    stdout: { type: "boolean" },
    "skip-invalid": { type: "boolean" },
    repo: { type: "string" },
    ref: { type: "string" },
  },
  async run(ctx) {
    const v = /** @type {{ check?: boolean, stdout?: boolean, "skip-invalid"?: boolean, repo?: string, ref?: string }} */ (ctx.args.values);
    const root = existsSync(join(ctx.root, "templates")) ? ctx.root : REPO_ROOT;
    if (!root) throw new ReelclawError("no templates/ folder here", { hint: "run this in a reelclaw-templates checkout, or pass --project <checkout>" });

    const { registry, errors } = await buildRegistry(root, { repo: v.repo, ref: v.ref });
    if (errors.length && v["skip-invalid"] && !v.check) {
      for (const e of errors) ctx.log.warn(`left out ${e}`);
    } else if (errors.length) {
      throw new ReelclawError(`${errors.length} template(s) failed to load:\n  - ${errors.join("\n  - ")}`, { hint: "fix them (reelclaw validate <id> shows details), then run registry again" });
    }
    /** @type {Record<string, string>} */
    const files = { [REGISTRY_FILE]: toJson(registry), [MARKETPLACE_FILE]: toJson(marketplaceManifest(registry)) };
    const readme = join(root, "README.md");
    if (existsSync(readme)) files["README.md"] = withGallery(readFileSync(readme, "utf8"), registry);
    if (v.stdout) {
      process.stdout.write(files[REGISTRY_FILE]);
      return 0;
    }
    if (v.check) {
      const stale = Object.keys(files).filter((f) => !existsSync(join(root, f)) || readFileSync(join(root, f), "utf8") !== files[f]);
      if (!stale.length) {
        ctx.log.success(`registry up to date (${registry.templates.length} templates)`);
        return 0;
      }
      ctx.log.error(`stale: ${stale.join(", ")}`);
      console.error(`  ${color.cyan("→")} run \`npm run registry\` and commit the result`);
      return 1;
    }
    for (const [file, text] of Object.entries(files)) {
      await mkdir(dirname(join(root, file)), { recursive: true });
      await writeFile(join(root, file), text);
    }
    ctx.log.success(`${Object.keys(files).join(" + ")}: ${registry.templates.length} template(s) — ${registry.templates.map((t) => t.id).join(", ")}`);
    return 0;
  },
};
