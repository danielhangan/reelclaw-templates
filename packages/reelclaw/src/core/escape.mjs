// @ts-check
/** HTML escaping shared by the compiler and the components that emit markup. */

/** Escape text content. @param {string} s */
export const text = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Escape an attribute value (double-quoted). @param {string} s */
export const attr = (s) => text(s).replace(/"/g, "&quot;");
