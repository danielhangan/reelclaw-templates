// @ts-check
/**
 * focusCrop — the region of a source to show in a box: the box's aspect,
 * as large as the source allows (÷ `zoom`), centred on a focus point and kept
 * inside the frame. Pass it as `video(ref, { crop })`: it frames off-centre
 * subjects (a face at 35% height, a speaker on the left of a landscape shot)
 * and makes punch-in zooms pure geometry — no transforms, sharp at any zoom.
 *
 *   video(clip, { crop: focusCrop(clip, layout.full(), { x: 0.5, y: 0.38, zoom: 1.12 }) })
 *
 * A `crop` also gives the video a wrapper element with the clip's id, which is
 * what wipeReveal() and other DOM-level effects target.
 */

/** @typedef {import('../geometry.mjs').Box} Box */

/**
 * @param {{ width: number, height: number }} src  source size in px (a MediaRef)
 * @param {{ w: number, h: number }} box           where it will be shown
 * @param {{ x?: number, y?: number, zoom?: number }} [focus]  x/y 0..1 of the source (default centre), zoom ≥ 1
 * @returns {Box} in source px
 */
export function focusCrop(src, box, { x = 0.5, y = 0.5, zoom = 1 } = {}) {
  const aspect = box.w / box.h;
  let w = src.width;
  let h = w / aspect;
  if (h > src.height) {
    h = src.height;
    w = h * aspect;
  }
  w /= Math.max(1, zoom);
  h /= Math.max(1, zoom);
  const left = Math.min(Math.max(0, x * src.width - w / 2), src.width - w);
  const top = Math.min(Math.max(0, y * src.height - h / 2), src.height - h);
  return { x: Math.round(left), y: Math.round(top), w: Math.round(w), h: Math.round(h) };
}
