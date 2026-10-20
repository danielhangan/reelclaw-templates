// @ts-check

/**
 * An expected, user-facing failure: bad input, missing tool, unknown template.
 * The CLI prints `message` plus `hint` (the exact fix) without a stack trace.
 * Anything that is not a ReelclawError is treated as a bug and printed with its stack.
 */
export class ReelclawError extends Error {
  /**
   * @param {string} message what went wrong, one line
   * @param {{ hint?: string, cause?: unknown }} [options] `hint` = the exact fix (a command, a flag, a path)
   */
  constructor(message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "ReelclawError";
    /** @type {string | undefined} */
    this.hint = options.hint;
  }
}

/**
 * Throw a ReelclawError. Typed `never` so it works in expressions: `x ?? fail("...")`.
 * @param {string} message
 * @param {string} [hint]
 * @returns {never}
 */
export function fail(message, hint) {
  throw new ReelclawError(message, { hint });
}
