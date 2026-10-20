// @ts-check
/**
 * Compiler: Timeline IR → one standalone HyperFrames composition (HTML).
 *
 * Output contract (HyperFrames 0.8):
 * - standalone root `<div data-composition-id>` directly in <body> (no <template>
 *   wrapper, no host page) — rendered with `hyperframes render -c reels/<name>.html`
 * - one paused GSAP timeline registered on window.__timelines[<name>]
 * - deterministic: no clocks, Math.random or network (GSAP + font are local files)
 * - video sound stays on the <video> (data-has-audio + data-volume) when a clip
 *   is given a volume; otherwise the video is `muted` (RULES.md §6)
 * - media paths are relative to the reel file (`../assets/...`)
 *
 * The output is meant to be readable and hand-editable by an agent afterwards.
 */
import { CAPTION_CSS, CAPTION_RUNTIME } from "./captions.mjs";
import { NATIVE_TEXT_CSS, NATIVE_TEXT_THEMES, nativeTextMarkup } from "./components/native-text.mjs";
import { attr, text } from "./escape.mjs";
import { ReelclawError } from "./errors.mjs";
import { SAFE_BAND, isInside } from "./geometry.mjs";
import { ms } from "./timeline.mjs";

/** @typedef {import('./timeline.mjs').Timeline} Timeline */
/** @typedef {import('./timeline.mjs').Clip} Clip */
/** @typedef {import('./timeline.mjs').VideoClip} VideoClip */
/** @typedef {import('./timeline.mjs').ImageClip} ImageClip */
/** @typedef {import('./timeline.mjs').AudioClip} AudioClip */
/** @typedef {import('./timeline.mjs').CaptionClip} CaptionClip */
/** @typedef {import('./timeline.mjs').Motion} Motion */
/** @typedef {import('./geometry.mjs').Box} Box */

/** Relative path from a reel file (reels/<name>.html) to the project root. */
export const REEL_TO_ROOT = "../";
export const FONT_SRC = "assets/fonts/TikTokSans-Variable.ttf";
export const GSAP_SRC = "assets/vendor/gsap.min.js";

/**
 * @typedef {object} CompileOptions
 * @property {string} name        composition id + timeline key (kebab-case reel name)
 * @property {string} [banner]    one-line provenance comment at the top of the file
 * @property {string} [root]      prefix from the reel file to the project root (default "../")
 */

/**
 * @typedef {object} CompileResult
 * @property {string} html
 * @property {string[]} warnings  non-fatal problems the user should hear about
 * @property {Timeline} timeline  the timeline after clamping (what was emitted)
 */

/**
 * Compile a timeline. Throws ReelclawError for problems that would produce a
 * broken reel (bad timing, missing audio stream); warns and clamps for the rest.
 * @param {Timeline} tl
 * @param {CompileOptions} options
 * @returns {CompileResult}
 */
export function compile(tl, options) {
  const { name } = options;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new ReelclawError(`invalid reel name "${name}"`, { hint: "use kebab-case: lowercase letters, digits and dashes (e.g. reel-3)" });
  }
  const root = options.root ?? REEL_TO_ROOT;
  /** @type {string[]} */
  const warnings = [];
  const clips = validate(tl, warnings);

  const ids = assignIds(clips);
  /** @type {string[]} */ const body = [];
  /** @type {string[]} */ const css = [];
  /** @type {string[]} */ const script = [];

  clips.forEach((clip, i) => {
    const id = ids[i];
    const track = i;
    switch (clip.type) {
      case "video": body.push(emitVideo(clip, id, track, root, script)); break;
      case "image": body.push(emitImage(clip, id, track, root, script)); break;
      case "audio": body.push(emitAudio(clip, id, track, root)); break;
      case "caption":
        body.push(emitCaption(clip, id, track, script));
        if (BOX_THEMES[clip.style]) css.push(NATIVE_TEXT_CSS);
        break;
      case "solid":
        body.push(`<div id="${id}" class="clip rc-box" style="${boxStyle(clip.box)} background: ${attr(clip.color)};"${timing(clip, track)}></div>`);
        break;
      case "html":
        body.push(`<div id="${id}" class="clip rc-box rc-html" style="${boxStyle(clip.box)}"${timing(clip, track)}>${clip.html}</div>`);
        if (clip.css) css.push(clip.css);
        if (clip.script) {
          script.push(`(function (tl, el, start, duration) {\n${indent(clip.script, 2)}\n})(tl, document.getElementById(${js(id)}), ${clip.start}, ${clip.duration});`);
        }
        break;
    }
  });

  const audible = clips.some((c) => (c.type === "audio" && c.volume > 0) || (c.type === "video" && c.volume > 0));
  if (!audible) warnings.push("no music and every clip volume is 0 — the reel will be silent (fine if you'll add a trending sound in-app)");

  const html = `<!doctype html>
${options.banner ? `<!-- ${options.banner.replace(/--/g, "—")} -->\n` : ""}<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${tl.canvas.width}, height=${tl.canvas.height}" />
    <title>${text(name)}</title>
    <script src="${root}${GSAP_SRC}"></script>
    <style>
      @font-face {
        font-family: "TikTok Sans";
        src: url("${root}${FONT_SRC}") format("truetype");
        font-weight: 300 900;
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${tl.canvas.width}px; height: ${tl.canvas.height}px; overflow: hidden; background: ${tl.background}; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; background: ${tl.background}; }
      .rc-box, .rc-media { position: absolute; }
      .rc-box { overflow: hidden; }
      .rc-media { display: block; }
${CAPTION_CSS}${css.length ? `\n      /* components */\n${indent([...new Set(css)].join("\n"), 6)}\n` : ""}    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="${name}"
      data-start="0"
      data-width="${tl.canvas.width}"
      data-height="${tl.canvas.height}"
      data-duration="${tl.duration}"
    >
${body.map((b) => indent(b, 6)).join("\n")}
    </div>

    <script>
      // captions auto-fit inside their region (RULES.md §5)
${indent(CAPTION_RUNTIME, 6)}
    </script>
    <script>
      const tl = gsap.timeline({ paused: true });
${script.length ? indent(script.join("\n"), 6) + "\n" : "      // static reel: captions and clips have no transitions (RULES.md §3)\n"}      window.__timelines[${js(name)}] = tl;
    </script>
  </body>
</html>
`;
  return { html, warnings, timeline: { ...tl, clips } };
}

/**
 * Check and clamp clips. Returns the clips to emit.
 * @param {Timeline} tl
 * @param {string[]} warnings
 * @returns {Clip[]}
 */
function validate(tl, warnings) {
  /** @type {Clip[]} */
  const out = [];
  const seen = new Set();
  tl.clips.forEach((input, i) => {
    let clip = input;
    const label = clip.id ? `${clip.type} "${clip.id}"` : `${clip.type} #${i + 1}`;
    if (clip.id) {
      if (!/^[A-Za-z][\w-]*$/.test(clip.id)) throw new ReelclawError(`${label}: id must start with a letter and contain only letters, digits, - and _`);
      if (seen.has(clip.id)) throw new ReelclawError(`${label}: duplicate id — every clip id must be unique`);
      seen.add(clip.id);
    }
    if (!(Number.isFinite(clip.start) && clip.start >= 0)) throw new ReelclawError(`${label}: start must be ≥ 0 (got ${clip.start})`);
    if (!(Number.isFinite(clip.duration) && clip.duration > 0)) {
      throw new ReelclawError(`${label}: duration must be > 0 (got ${clip.duration})`, {
        hint: clip.type === "video" || clip.type === "audio" ? "check trim: it may leave no footage" : undefined,
      });
    }
    if (clip.start >= tl.duration) {
      warnings.push(`${label} starts at ${clip.start}s, after the reel ends (${tl.duration}s) — dropped`);
      return;
    }
    if (clip.start + clip.duration > tl.duration + 0.001) {
      if (clip.type !== "audio") warnings.push(`${label} runs past the end of the reel — cut to ${ms(tl.duration - clip.start)}s`);
      clip = { ...clip, duration: ms(tl.duration - clip.start) };
    }

    if (clip.type === "video" || clip.type === "audio") {
      const src = clip.src;
      if (clip.trim < 0 || clip.trim >= src.duration) {
        throw new ReelclawError(`${label}: trim ${clip.trim}s is outside the source (${src.duration.toFixed(1)}s long, ${src.label})`);
      }
      const available = src.duration - clip.trim;
      const loops = clip.type === "video" && clip.loop;
      if (!loops && clip.duration > available + 0.05) {
        if (clip.type === "video") {
          throw new ReelclawError(
            `${label}: needs ${clip.duration}s from ${clip.trim}s but ${src.label} is only ${src.duration.toFixed(2)}s long`,
            { hint: "lower the trim/duration, use a longer clip, or set loop: true" },
          );
        }
        const fit = Math.floor((available - 0.05) * 10) / 10;
        warnings.push(`${label}: ${src.label} covers only ${fit}s of the ${clip.duration}s asked for (ends early)`);
        clip = { ...clip, duration: fit };
      }
      if (clip.type === "audio" && !src.hasAudio) {
        throw new ReelclawError(`${label}: ${src.label} has no audio stream`, { hint: "pass a file with sound (mp3/m4a/wav or a video with audio)" });
      }
      if (clip.type === "video" && clip.volume > 0 && !src.hasAudio) {
        warnings.push(`${label}: ${src.label} has no audio stream — ignoring its volume`);
        clip = { ...clip, volume: 0 };
      }
    }

    if (clip.type === "caption") {
      if (!clip.text.trim()) throw new ReelclawError(`${label}: empty caption text`);
      if (!clip.unsafe && !isInside(clip.region, SAFE_BAND, 1)) {
        warnings.push(`${label}: region ${JSON.stringify(clip.region)} leaves the safe band (x 180–900, y 220–1420) — platform UI may cover it (pass unsafe: true if deliberate)`);
      }
    }
    out.push(clip);
  });
  return out;
}

/** @param {Clip[]} clips */
function assignIds(clips) {
  const counts = /** @type {Record<string, number>} */ ({});
  const taken = new Set(clips.map((c) => c.id).filter(Boolean));
  return clips.map((c) => {
    if (c.id) return c.id;
    let id;
    do {
      counts[c.type] = (counts[c.type] ?? 0) + 1;
      id = `${c.type}-${counts[c.type]}`;
    } while (taken.has(id));
    taken.add(id);
    return id;
  });
}

/**
 * @param {VideoClip} clip
 * @param {string} id
 * @param {number} track
 * @param {string} root
 * @param {string[]} script
 */
function emitVideo(clip, id, track, root, script) {
  const wrapped = Boolean(clip.crop) || clip.motion.length > 0;
  const inner = wrapped ? innerGeometry(clip) : null;
  const segments = clip.loop ? loopSegments(clip) : [{ start: clip.start, duration: clip.duration, trim: clip.trim }];
  const els = segments.map((seg, n) => {
    const segId = segments.length > 1 ? `${id}-${n + 1}` : wrapped ? `${id}-video` : id;
    const style = inner
      ? `left: ${inner.x}px; top: ${inner.y}px; width: ${inner.w}px; height: ${inner.h}px; object-fit: fill;${clip.mirror ? " transform: scaleX(-1);" : ""}`
      : `${boxStyle(clip.box)} object-fit: ${clip.fit};${clip.objectPosition ? ` object-position: ${attr(clip.objectPosition)};` : ""}${clip.mirror ? " transform: scaleX(-1);" : ""}`;
    const sound = clip.volume > 0
      ? ` data-has-audio="true" data-volume="${clip.volume}"${fades(clip)}`
      : " muted";
    return `<video id="${segId}" class="rc-media" src="${attr(root + clip.src.src)}" style="${style}${clip.style ? ` ${attr(clip.style)}` : ""}"${timing(seg, track)}${seg.trim ? ` data-media-start="${ms(seg.trim)}"` : ""}${sound} playsinline></video>`;
  });
  if (!wrapped) return els.join("\n");
  addMotion(script, `#${id}`, clip.motion);
  return `<div id="${id}" class="rc-box" style="${boxStyle(clip.box)}">\n${indent(els.join("\n"), 2)}\n</div>`;
}

/**
 * Where the scaled source sits inside the clip box so that `crop` (source px)
 * covers the box — or the whole source covers it when there is no crop.
 * @param {VideoClip} clip
 * @returns {Box}
 */
function innerGeometry(clip) {
  const { width: sw, height: sh } = clip.src;
  const crop = clip.crop ?? { x: 0, y: 0, w: sw, h: sh };
  const box = clip.box;
  const scale = clip.fit === "contain" ? Math.min(box.w / crop.w, box.h / crop.h) : Math.max(box.w / crop.w, box.h / crop.h);
  const w = sw * scale;
  const h = sh * scale;
  // a mirrored element flips around its own centre, so the crop window flips too
  const cropX = clip.mirror ? sw - crop.x - crop.w : crop.x;
  const x = -cropX * scale + (box.w - crop.w * scale) / 2;
  const y = -crop.y * scale + (box.h - crop.h * scale) / 2;
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/**
 * Split a looping clip into back-to-back segments of the source.
 * @param {VideoClip} clip
 * @returns {{ start: number, duration: number, trim: number }[]}
 */
export function loopSegments(clip) {
  const loopLen = Math.floor((clip.src.duration - clip.trim - 0.05) * 10) / 10;
  if (loopLen < 0.2) throw new ReelclawError(`video "${clip.id ?? clip.src.label}": trim leaves under 0.2s to loop`);
  const out = [];
  const endT = clip.start + clip.duration;
  let t = clip.start;
  while (t < endT - 0.001) {
    const d = ms(Math.min(loopLen, endT - t));
    out.push({ start: ms(t), duration: d, trim: clip.trim });
    t = ms(t + d);
  }
  return out;
}

/**
 * @param {ImageClip} clip
 * @param {string} id
 * @param {number} track
 * @param {string} root
 * @param {string[]} script
 */
function emitImage(clip, id, track, root, script) {
  const fit = `object-fit: ${clip.fit};${clip.objectPosition ? ` object-position: ${attr(clip.objectPosition)};` : ""}${clip.style ? ` ${attr(clip.style)}` : ""}`;
  const src = attr(root + clip.src.src);
  if (!clip.motion.length) {
    return `<img id="${id}" class="rc-media" src="${src}" alt="" style="${boxStyle(clip.box)} ${fit}"${timing(clip, track)} />`;
  }
  addMotion(script, `#${id}`, clip.motion);
  return `<div id="${id}" class="rc-box" style="${boxStyle(clip.box)}">\n  <img id="${id}-img" class="rc-media" src="${src}" alt="" style="left: 0; top: 0; width: 100%; height: 100%; ${fit}"${timing(clip, track)} />\n</div>`;
}

/**
 * @param {AudioClip} clip
 * @param {string} id
 * @param {number} track
 * @param {string} root
 */
function emitAudio(clip, id, track, root) {
  return `<audio id="${id}" src="${attr(root + clip.src.src)}"${timing(clip, track)}${clip.trim ? ` data-media-start="${ms(clip.trim)}"` : ""} data-volume="${clip.volume}"${fades(clip)}></audio>`;
}

/**
 * @param {CaptionClip} clip
 * @param {string} id
 * @param {number} track
 * @param {string[]} script
 */
function emitCaption(clip, id, track, script) {
  addMotion(script, `#${id}-text`, clip.motion);
  const open = (/** @type {string} */ cls) =>
    `<div id="${id}" class="clip rc-cap ${cls}" data-pos="${clip.position}" style="${boxStyle(clip.region)}${clip.align === "left" ? " text-align: left;" : ""}"${timing(clip, track)} data-size="${clip.size}" data-min-size="${clip.minSize}" data-max-h="${clip.maxHeight}">`;
  const theme = BOX_THEMES[clip.style];
  if (theme) {
    // TikTok's native text-with-background: one merged rounded shape (same look as nativeText())
    return `${open(`rc-cap--${clip.style} rc-nt`)}\n  ${nativeTextMarkup(clip.text, { id, size: clip.size, theme })}\n</div>`;
  }
  return `${open(`rc-cap--${clip.style}`)}\n  <p id="${id}-text" class="rc-cap-text" style="font-size: ${clip.size}px"><span>${text(clip.text)}</span></p>\n</div>`;
}

/** Caption styles drawn as native text boxes. */
const BOX_THEMES = /** @type {Partial<Record<string, typeof NATIVE_TEXT_THEMES[string]>>} */ ({
  "tiktok-box": NATIVE_TEXT_THEMES.white,
  "tiktok-box-dark": NATIVE_TEXT_THEMES.dark,
});

/**
 * Append GSAP tweens for a clip's motion. The first tween renders immediately
 * so the clip sits in its `from` state until the tween starts.
 * @param {string[]} script
 * @param {string} selector
 * @param {Motion[]} motion
 */
function addMotion(script, selector, motion) {
  const rest = /** @type {Record<string, number>} */ ({ x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, xPercent: 0, yPercent: 0 });
  [...motion].sort((a, b) => a.at - b.at).forEach((m, n) => {
    const from = m.from ?? Object.fromEntries(Object.keys(m.to).map((k) => [k, rest[k]]));
    const to = { ...m.to, duration: m.duration, ease: m.ease ?? "power2.inOut", ...(n > 0 ? { immediateRender: false } : {}) };
    script.push(`tl.fromTo(${js(selector)}, ${JSON.stringify(from)}, ${JSON.stringify(to)}, ${ms(m.at)});`);
  });
}

/** @param {{ start: number, duration: number }} c @param {number} track */
function timing(c, track) {
  return ` data-start="${ms(c.start)}" data-duration="${ms(c.duration)}" data-track-index="${track}"`;
}

/** @param {{ fadeIn: number, fadeOut: number }} c */
function fades(c) {
  return `${c.fadeIn > 0 ? ` data-fade-in="${c.fadeIn}"` : ""}${c.fadeOut > 0 ? ` data-fade-out="${c.fadeOut}"` : ""}`;
}

/** @param {Box} b */
function boxStyle(b) {
  return `left: ${Math.round(b.x)}px; top: ${Math.round(b.y)}px; width: ${Math.round(b.w)}px; height: ${Math.round(b.h)}px;`;
}

/** A JS string literal that is safe inside a <script> block. @param {string} s */
const js = (s) => JSON.stringify(s).replace(/</g, "\\u003c");

/** @param {string} s @param {number} n */
function indent(s, n) {
  const pad = " ".repeat(n);
  return s.split("\n").map((l) => (l ? pad + l : l)).join("\n");
}
