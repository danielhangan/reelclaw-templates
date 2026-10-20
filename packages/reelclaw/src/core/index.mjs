// @ts-check
/**
 * reelclaw/core — the engine API for CLI commands and tools (batch, registry,
 * add, analyze…). Template authors should import from "reelclaw" instead.
 */
export * from "../index.mjs";
export { inputsSchema, parseValues, normalizeValues, cliOptions, flagsTable, inputsJsonSchema, flagName, keyName, valueHint, isMediaKind, closest } from "./inputs.mjs";
export { isTemplate, RESERVED_FLAGS, TEMPLATE } from "./template.mjs";
export { compile, REEL_TO_ROOT } from "./compile.mjs";
export { fitFontSize, CAPTION_CSS, CAPTION_RUNTIME } from "./captions.mjs";
export { stageMedia, deriveMedia, assetName, checkKind } from "./media/stage.mjs";
export { ffprobe, parseProbe } from "./media/probe.mjs";
export { classifySource } from "./media/download.mjs";
export { ensureProject, projectPaths, nextReelName, kebab, ENGINE_ROOT, REPO_ROOT } from "./project.mjs";
export { findTemplates, locateTemplate, loadTemplate, templateRoots, normalizeId } from "./loader.mjs";
export { validateTemplate, parseFrontmatter, standIn } from "./validate.mjs";
export { makeReel, readProps } from "./make.mjs";
export { makeExample, missingMedia } from "./example.mjs";
export { probeRender, checkRender, expectationsFor, frameTimes, frameStrip, previewGif, previewMp4 } from "./inspect.mjs";
export { summarizeTemplate } from "./manifest.mjs";
export { renderReel, lintReel, runHyperframes, hyperframesCommand, isNoise, HYPERFRAMES_VERSION, QUALITIES } from "./render.mjs";
export { toolVersion, requireTool, run, TOOLS } from "./exec.mjs";
export { consoleLogger, silentLogger, color, displayPath } from "./log.mjs";

/** @typedef {import('./log.mjs').Logger} Logger */
/** @typedef {import('./make.mjs').MakeOptions} MakeOptions */
/** @typedef {import('./make.mjs').MakeResult} MakeResult */
/** @typedef {import('./loader.mjs').TemplateLocation} TemplateLocation */
/** @typedef {import('./template.mjs').Template<any, any>} AnyTemplate */
/** @typedef {import('./inputs.mjs').InputSpec<any>} AnyInputSpec */
/** @typedef {import('./manifest.mjs').TemplateSummary} TemplateSummary */
