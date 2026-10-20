// @ts-check
/**
 * Module resolve hooks (registered by loader.mjs): `import … from "reelclaw"`
 * inside a template resolves to the engine that is running, wherever the
 * template file lives — a reel project without node_modules, the repo, or an
 * npx cache. Guarantees templates and engine share one module instance.
 */

/** @type {Record<string, string>} */
let aliases = {};

/** @param {{ aliases: Record<string, string> }} data */
export async function initialize(data) {
  aliases = data.aliases;
}

/**
 * @param {string} specifier
 * @param {object} context
 * @param {(specifier: string, context: object) => Promise<{ url: string }>} next
 */
export async function resolve(specifier, context, next) {
  const url = aliases[specifier];
  return url ? { url, shortCircuit: true } : next(specifier, context);
}
