// @ts-check
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compile, loopSegments } from "../src/core/compile.mjs";
import { audio, caption, html, image, music, solid, timeline, video } from "../src/core/timeline.mjs";

/** @typedef {import('../src/core/types.mjs').MediaRef} MediaRef */

/**
 * @param {Partial<MediaRef>} o
 * @returns {MediaRef}
 */
const media = (o = {}) => ({
  kind: "video", label: "clip", src: "assets/clip-abc.mp4", path: "/x/assets/clip-abc.mp4",
  duration: 6, width: 720, height: 1280, fps: 30, hasVideo: true, hasAudio: true, hasAlpha: false, isImage: false,
  ...o,
});
const silent = media({ src: "assets/silent-def.mp4", hasAudio: false, label: "silent.mp4" });
const track = media({ kind: "audio", src: "assets/music-123.m4a", duration: 20, hasVideo: false, width: 0, height: 0, label: "music.m4a" });

describe("compile: document shape", () => {
  const tl = timeline([
    video(media(), { id: "reaction", duration: 3, trim: 1, volume: 0.8 }),
    video(silent, { id: "demo", start: 3 }),
    caption("i <3 this & that", { id: "hook", start: 0, duration: 3, position: "top" }),
    music(track, { trim: 2, volume: 0.6 }),
  ]);
  const { html: out, warnings, timeline: emitted } = compile(tl, { name: "reel-1" });

  it("is a standalone composition with one registered paused timeline", () => {
    assert.doesNotMatch(out, /<template/);
    assert.match(out, /<div\s+id="root"\s+data-composition-id="reel-1"[^>]*data-width="1080"[^>]*data-height="1920"[^>]*data-duration="8.9"/s);
    assert.match(out, /gsap\.timeline\(\{ paused: true \}\)/);
    assert.match(out, /window\.__timelines\["reel-1"\] = tl;/);
    assert.equal(emitted.duration, 8.9);
  });

  it("loads GSAP and the font from local project files", () => {
    assert.match(out, /<script src="\.\.\/assets\/vendor\/gsap\.min\.js"><\/script>/);
    assert.match(out, /url\("\.\.\/assets\/fonts\/TikTokSans-Variable\.ttf"\)/);
    assert.doesNotMatch(out, /https?:\/\//);
  });

  it("keeps sound on videos with a volume and mutes the rest", () => {
    assert.match(out, /<video id="reaction"[^>]*data-media-start="1"[^>]*data-has-audio="true" data-volume="0.8"/);
    assert.doesNotMatch(out, /<video id="reaction"[^>]* muted/);
    assert.match(out, /<video id="demo"[^>]*data-start="3" data-duration="5.9"[^>]* muted playsinline/);
  });

  it("stretches music to the reel and fades it out", () => {
    assert.match(out, /<audio id="music" src="\.\.\/assets\/music-123\.m4a" data-start="0" data-duration="8.9"[^>]*data-media-start="2" data-volume="0.6" data-fade-out="0.8">/);
  });

  it("escapes caption text and stamps fit parameters", () => {
    assert.match(out, /<span>i &lt;3 this &amp; that<\/span>/);
    assert.match(out, /id="hook" class="clip rc-cap rc-cap--tiktok-outline" data-pos="top"[^>]*data-size="58" data-min-size="26" data-max-h="1150"/);
  });

  it("is deterministic", () => {
    assert.equal(compile(tl, { name: "reel-1" }).html, out);
    assert.doesNotMatch(out, /Math\.random|Date\.now/);
    assert.deepEqual(warnings, []);
  });
});

describe("compile: validation", () => {
  it("errors when a video needs more footage than the source has", () => {
    const tl = timeline([video(media(), { duration: 3, trim: 4.5 })]);
    assert.throws(() => compile(tl, { name: "r" }), /needs 3s from 4\.5s but clip is only 6\.00s long/);
  });

  it("clamps short music and warns", () => {
    const short = { ...track, duration: 4 };
    const tl = timeline([video(media()), music(short)]);
    const { html: out, warnings } = compile(tl, { name: "r" });
    assert.match(out, /<audio id="music"[^>]*data-duration="3.9"/);
    assert.match(warnings.join("\n"), /covers only 3\.9s/);
  });

  it("ignores volume on a source without audio, with a warning", () => {
    const { html: out, warnings } = compile(timeline([video(silent, { volume: 1 })]), { name: "r" });
    assert.match(out, /<video id="video-1"[^>]* muted/);
    assert.match(warnings.join("\n"), /no audio stream/);
  });

  it("rejects an audio clip whose file has no sound", () => {
    assert.throws(() => compile(timeline([video(media()), audio(silent)]), { name: "r" }), /has no audio stream/);
  });

  it("warns about captions outside the safe band unless marked unsafe", () => {
    const off = { x: 0, y: 900, w: 1080, h: 120 };
    const w1 = compile(timeline([video(media()), caption("x", { start: 0, duration: 1, region: off })]), { name: "r" }).warnings;
    assert.match(w1.join("\n"), /leaves the safe band/);
    const w2 = compile(timeline([video(media()), caption("x", { start: 0, duration: 1, region: off, unsafe: true })]), { name: "r" }).warnings;
    assert.doesNotMatch(w2.join("\n"), /safe band/);
  });

  it("rejects duplicate ids and bad reel names", () => {
    assert.throws(() => compile(timeline([video(media(), { id: "a" }), solid("#fff", { id: "a", start: 0, duration: 1 })]), { name: "r" }), /duplicate id/);
    assert.throws(() => compile(timeline([video(media())]), { name: "Reel 1" }), /invalid reel name/);
  });

  it("cuts clips that run past an explicit duration", () => {
    const { html: out, warnings } = compile(timeline([video(media())], { duration: 2 }), { name: "r" });
    assert.match(out, /data-duration="2" data-track-index="0"/);
    assert.match(warnings.join("\n"), /runs past the end/);
  });
});

describe("compile: layout features", () => {
  it("splits a looping clip into back-to-back segments", () => {
    const clip = video(media({ duration: 2.55 }), { duration: 5, loop: true });
    assert.deepEqual(loopSegments(clip), [
      { start: 0, duration: 2.5, trim: 0 },
      { start: 2.5, duration: 2.5, trim: 0 },
    ]);
    const out = compile(timeline([clip]), { name: "r" }).html;
    assert.match(out, /id="video-1-1"[^>]*data-start="0" data-duration="2.5"/);
    assert.match(out, /id="video-1-2"[^>]*data-start="2.5" data-duration="2.5"/);
  });

  it("crops a source region into a box through an untimed wrapper", () => {
    const clip = video(media({ width: 1000, height: 1000 }), { box: { x: 0, y: 1420, w: 250, h: 500 }, crop: { x: 400, y: 0, w: 200, h: 400 } });
    const out = compile(timeline([clip]), { name: "r" }).html;
    // scale = max(250/200, 500/400) = 1.25 → source 1250x1250, crop x 400 → -500
    assert.match(out, /<div id="video-1" class="rc-box" style="left: 0px; top: 1420px; width: 250px; height: 500px;">/);
    assert.match(out, /<video id="video-1-video"[^>]*style="left: -500px; top: 0px; width: 1250px; height: 1250px; object-fit: fill;"/);
  });

  it("emits motion as fromTo tweens; later tweens do not render immediately", () => {
    const clip = image(media({ kind: "image", isImage: true, hasVideo: false, duration: 0 }), {
      id: "card", duration: 3,
      motion: [
        { at: 2, duration: 0.5, to: { scale: 1 }, from: { scale: 1.2 } },
        { at: 0.2, duration: 0.6, from: { y: 200, opacity: 0 }, to: { y: 0, opacity: 1 }, ease: "power3.out" },
      ],
    });
    const out = compile(timeline([clip]), { name: "r" }).html;
    const first = out.indexOf('tl.fromTo("#card", {"y":200,"opacity":0}, {"y":0,"opacity":1,"duration":0.6,"ease":"power3.out"}, 0.2);');
    const second = out.indexOf('tl.fromTo("#card", {"scale":1.2}, {"scale":1,"duration":0.5,"ease":"power2.inOut","immediateRender":false}, 2);');
    assert.ok(first > 0 && second > first);
  });

  it("draws box captions as TikTok's native merged text, with the shared CSS once", () => {
    const out = compile(timeline([
      video(media()),
      caption("line one\nline two", { id: "a", start: 0, duration: 2, style: "tiktok-box", align: "left" }),
      caption("dark", { id: "b", start: 2, duration: 2, style: "tiktok-box-dark" }),
    ]), { name: "r" }).html;
    assert.match(out, /<div id="a" class="clip rc-cap rc-cap--tiktok-box rc-nt"[^>]*text-align: left;/);
    assert.match(out, /<p id="a-text" class="rc-cap-text rc-nt-text"[^>]*>.*filter: url\(#a-goo\)/s);
    assert.match(out, /<p id="b-text"[^>]*>.*opacity: 0\.72/s);
    assert.equal(out.split("/* nativeText(): TikTok in-app text with background */").length, 2, "CSS emitted once");
  });

  it("passes html() clips through with their css and script", () => {
    const h = html({ id: "badge", start: 1, duration: 2, html: '<b class="pop">NEW</b>', css: ".pop { color: red; }", script: "tl.from(el, { scale: 0 }, start);" });
    const out = compile(timeline([video(media()), h]), { name: "r" }).html;
    assert.match(out, /<div id="badge" class="clip rc-box rc-html"[^>]*data-start="1" data-duration="2"[^>]*><b class="pop">NEW<\/b><\/div>/);
    assert.match(out, /\.pop \{ color: red; \}/);
    assert.match(out, /\}\)\(tl, document\.getElementById\("badge"\), 1, 2\);/);
  });
});
