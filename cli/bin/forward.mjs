// @ts-check
/**
 * Translate the v1 `reelclaw-templates` command line into `reelclaw add`.
 *
 *   reelclaw-templates                    → reelclaw add                 (picker, current folder)
 *   reelclaw-templates <t>                → reelclaw add <t> --dir <t>   (v1 installed into ./<t>)
 *   reelclaw-templates <t> <dir>          → reelclaw add <t> --dir <dir>
 *   reelclaw-templates --list | -l        → reelclaw add --list
 *   --ref / --src / --help                → passed through
 *
 * @param {string[]} argv  process.argv.slice(2)
 * @returns {string[]}     argv for `reelclaw`
 */
export function translateArgs(argv) {
  /** @type {string[]} */
  const positionals = [];
  /** @type {string[]} */
  const flags = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list" || a === "-l") flags.push("--list");
    else if (a === "--help" || a === "-h") flags.push("--help");
    else if ((a === "--ref" || a === "--src" || a === "--dir") && argv[i + 1] !== undefined) flags.push(a, argv[++i]);
    else if (a.startsWith("-")) flags.push(a);
    else positionals.push(a);
  }
  const [template, dir] = positionals;
  if (template && !flags.includes("--dir")) flags.push("--dir", dir ?? template);
  return ["add", ...(template ? [template] : []), ...flags];
}
