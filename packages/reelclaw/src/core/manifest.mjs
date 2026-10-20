// @ts-check
/**
 * Machine-readable description of a template — the single source for
 * registry.json entries, `list --json`, website cards and generated docs.
 */
import { flagName, inputsJsonSchema, valueHint } from "./inputs.mjs";

/** @typedef {import('./template.mjs').Template<any, any>} AnyTemplate */

/**
 * @typedef {object} InputSummary
 * @property {string} key
 * @property {string} flag      e.g. "--hook-position"
 * @property {string} kind
 * @property {boolean} required
 * @property {unknown} [default]
 * @property {readonly string[]} [options]
 * @property {string} description
 * @property {string} hint      value placeholder for docs ("<file|url>", "top|center|bottom")
 */

/**
 * @typedef {object} TemplateSummary
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} category
 * @property {string[]} tags
 * @property {{ url?: string, notes?: string }} [source]
 * @property {InputSummary[]} inputs
 * @property {string[]} media   keys of media inputs (what footage the user needs)
 * @property {string} install   one-line install command
 * @property {Record<string, unknown>} schema  JSON schema of the --props file
 */

/**
 * @param {AnyTemplate} template
 * @returns {TemplateSummary}
 */
export function summarizeTemplate(template) {
  const inputs = Object.entries(template.inputs).map(([key, spec]) => ({
    key,
    flag: `--${flagName(key)}`,
    kind: spec.kind === "list" && spec.item ? `list<${spec.item.kind}>` : spec.kind,
    required: spec.required,
    ...(spec.default !== undefined ? { default: spec.default } : {}),
    ...(spec.options ? { options: spec.options } : {}),
    description: spec.description,
    hint: valueHint(spec),
  }));
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    tags: [...template.tags],
    ...(template.source ? { source: template.source } : {}),
    inputs,
    media: inputs.filter((i) => /video|image|audio|visual/.test(i.kind)).map((i) => i.key),
    install: `npx reelclaw@latest add ${template.id}`,
    schema: inputsJsonSchema(template.inputs),
  };
}
