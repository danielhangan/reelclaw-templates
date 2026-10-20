// @ts-check
/**
 * A reel project is any directory you run reelclaw in:
 *
 *   templates/<id>/template.mjs   installed templates (from `reelclaw add`)
 *   assets/                       staged media (content-hashed) + fonts/ + vendor/gsap.min.js
 *   reels/<name>.html             generated compositions — hand-editable, re-renderable
 *   reels/<name>.json             the inputs that produced it (re-make / batch / audit)
 *   renders/<name>.mp4            outputs
 *   .reelclaw/                    caches (safe to delete)
 */
import { existsSync, readdirSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ReelclawError } from "./errors.mjs";

/** packages/reelclaw (or node_modules/reelclaw when installed). */
export const ENGINE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * The git checkout this engine lives in (repo root with templates/), or null
 * when running from an npm install. Lets `reelclaw make` in the repo find
 * templates/ without installing them.
 */
export const REPO_ROOT = (() => {
  const candidate = join(ENGINE_ROOT, "..", "..");
  return existsSync(join(candidate, "templates")) && existsSync(join(candidate, "packages", "reelclaw")) ? candidate : null;
})();

/** @param {string} root */
export function projectPaths(root) {
  return {
    root,
    templates: join(root, "templates"),
    assets: join(root, "assets"),
    fonts: join(root, "assets", "fonts"),
    vendor: join(root, "assets", "vendor"),
    reels: join(root, "reels"),
    renders: join(root, "renders"),
    cache: join(root, ".reelclaw", "cache"),
  };
}

const FONT_FILES = ["TikTokSans-Variable.ttf", "OFL.txt"];

/** Where the canonical TikTok Sans lives: shipped in the package, or shared/fonts in the repo. */
function fontSourceDir() {
  for (const dir of [join(ENGINE_ROOT, "fonts"), REPO_ROOT && join(REPO_ROOT, "shared", "fonts")]) {
    if (dir && existsSync(join(dir, FONT_FILES[0]))) return dir;
  }
  throw new ReelclawError("TikTok Sans font not found in the reelclaw package", {
    hint: "reinstall reelclaw (npm i reelclaw@latest) — the package ships fonts/TikTokSans-Variable.ttf",
  });
}

/**
 * Create the project folders and copy the runtime files every composition
 * references (font + GSAP) into assets/. Idempotent and cheap.
 * @param {string} root
 */
export async function ensureProject(root) {
  const p = projectPaths(root);
  await Promise.all([p.fonts, p.vendor, p.reels, p.renders, p.cache].map((d) => mkdir(d, { recursive: true })));
  const fonts = fontSourceDir();
  for (const f of FONT_FILES) {
    if (!existsSync(join(p.fonts, f))) await copyFile(join(fonts, f), join(p.fonts, f));
  }
  const gsap = join(p.vendor, "gsap.min.js");
  if (!existsSync(gsap)) {
    const require = createRequire(import.meta.url);
    await copyFile(join(dirname(require.resolve("gsap/package.json")), "dist", "gsap.min.js"), gsap);
  }
  return p;
}

/**
 * Next free `<prefix>-N` reel name in the project.
 * @param {string} root
 * @param {string} prefix kebab-case, usually the template id
 */
export function nextReelName(root, prefix) {
  const dir = projectPaths(root).reels;
  const re = new RegExp(`^${prefix}-(\\d+)\\.(html|json)$`);
  const used = existsSync(dir)
    ? readdirSync(dir).map((f) => re.exec(f)).filter((m) => m !== null).map((m) => Number(m[1]))
    : [];
  return `${prefix}-${used.length ? Math.max(...used) + 1 : 1}`;
}

/** kebab-case a template id for reel names (reaction_demo → reaction-demo). */
export const kebab = (/** @type {string} */ s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
