// @ts-check
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { compile } from "../src/core/compile.mjs";
import { focusCrop } from "../src/core/components/crop.mjs";
import { chunkWindows, chunkWords, inkOn, karaokeCaptions, karaokeRegion } from "../src/core/components/karaoke.mjs";
import { layoutSegments, mapWords, parseTimeRange, segmentsLength, sentenceBreaks, speechRanges, splitRanges, toReel } from "../src/core/components/speech.mjs";
import { cleanWord, loadTranscript, normalizeWords, parseCues, parseTimecode, parseTranscript } from "../src/core/components/transcript.mjs";
import { wipeReveal } from "../src/core/components/wipe.mjs";
import { solid, timeline } from "../src/core/timeline.mjs";

/** @typedef {import('../src/core/timeline.mjs').Word} Word */

/** @param {Array<[string, number, number]>} list @returns {Word[]} */
const words = (list) => list.map(([text, start, end]) => ({ text, start, end }));

describe("transcript parsing", () => {
  it("reads word lists in the common JSON shapes", () => {
    const flat = '[{"text":"hi","start":0.1,"end":0.3},{"word":" there","start":0.3,"end":0.6}]';
    assert.deepEqual(parseTranscript(flat, "json"), words([["hi", 0.1, 0.3], ["there", 0.3, 0.6]]));
    assert.deepEqual(parseTranscript('{"words":[{"text":"a","startMs":100,"endMs":250}]}', "json"), words([["a", 0.1, 0.25]]));
    const segs = '{"segments":[{"text":"no words here","start":1,"end":2.3},{"words":[{"word":"x","start":3,"end":3.2}]}]}';
    const out = parseTranscript(segs, "json");
    assert.deepEqual(out.map((w) => w.text), ["no", "words", "here", "x"]);
    assert.equal(out[0].start, 1);
    assert.equal(out[2].end, 2.3);
  });

  it("explains bad JSON with the accepted shapes", () => {
    assert.throws(() => parseTranscript("{nope", "json"), /not valid JSON/);
    assert.throws(() => parseTranscript('{"text":"x"}', "json"), (/** @type {any} */ e) => /no words/.test(e.message) && /segments/.test(e.hint));
    assert.throws(() => parseTranscript('[{"text":"x","start":"soon"}]', "json"), /numeric start and end/);
  });

  it("spreads SRT and VTT cues over their words by length", () => {
    const srt = "1\n00:00:01,000 --> 00:00:02,000\nhi there\n\n2\n00:00:02,500 --> 00:00:03,000\n<i>ok</i>\n";
    const w = parseTranscript(srt, "srt");
    assert.deepEqual(w.map((x) => x.text), ["hi", "there", "ok"]);
    assert.equal(w[0].start, 1);
    assert.equal(w[1].end, 2);
    assert.ok(w[1].end - w[1].start > w[0].end - w[0].start, "longer word gets more time");
    const vtt = "WEBVTT\n\n00:01.500 --> 00:02.000 align:start\nyo\n";
    assert.deepEqual(parseTranscript(vtt, "vtt"), words([["yo", 1.5, 2]]));
    assert.equal(parseCues("garbage").length, 0);
  });

  it("parses timecodes", () => {
    assert.equal(parseTimecode("01:02:03,450"), 3723.45);
    assert.equal(parseTimecode("02:03.5"), 123.5);
    assert.equal(parseTimecode("3.25"), 3.25);
    assert.ok(Number.isNaN(parseTimecode("soon")));
  });

  it("normalises: sorted, no empties, no overlaps, minimum length", () => {
    const n = normalizeWords(words([["b", 1, 1.5], ["", 0.5, 0.6], ["a", 0.2, 1.2], ["c", 2, 2]]));
    assert.deepEqual(n.map((w) => w.text), ["a", "b", "c"]);
    assert.equal(n[0].end, 1, "overlap trimmed to the next start");
    assert.ok(n[2].end > n[2].start, "zero-length word stretched");
  });

  it("cleans words for display", () => {
    assert.equal(cleanWord("TikTok.", "upper"), "TIKTOK");
    assert.equal(cleanWord("one,"), "one");
    assert.equal(cleanWord("really?!", "lower"), "really?!");
    assert.equal(cleanWord('"quote"'), "quote");
    assert.equal(cleanWord("."), ".", "a lone mark is kept (not emptied)");
  });

  it("loads files relative to the given bases and rejects unknown formats", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rc-transcript-"));
    try {
      await writeFile(join(dir, "t.json"), '[{"text":"hey","start":0,"end":0.4}]');
      await writeFile(join(dir, "t.txt"), "hey");
      assert.equal((await loadTranscript("t.json", { bases: ["/nonexistent", dir] }))[0].text, "hey");
      await assert.rejects(loadTranscript("t.txt", { bases: [dir] }), /unsupported format/);
      await assert.rejects(loadTranscript("missing.json", { bases: [dir] }), /not found/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("karaoke chunks", () => {
  const talk = words([
    ["Stop", 0, 0.3], ["scrolling.", 0.3, 0.9], ["Here", 1.0, 1.1], ["are", 1.1, 1.2], ["three", 1.2, 1.4],
    ["things", 1.4, 1.6], ["nobody", 1.6, 1.9], ["knows", 3.0, 3.4],
  ]);

  it("breaks on punctuation, word count, characters and pauses", () => {
    const chunks = chunkWords(talk, { maxWords: 3, maxChars: 16, maxGap: 0.5 }).map((c) => c.map((w) => w.text).join(" "));
    assert.deepEqual(chunks, ["Stop scrolling.", "Here are three", "things nobody", "knows"]);
    assert.deepEqual(chunkWords(talk, { maxWords: 1 }).length, talk.length);
    assert.deepEqual(chunkWords(words([["supercalifragilistic", 0, 1], ["yes", 1, 1.2]]), { maxChars: 8 }).length, 2, "long word stands alone");
  });

  it("windows bridge short gaps and end shortly after a pause starts", () => {
    const chunks = chunkWords(talk);
    const win = chunkWindows(chunks, { hold: 0.35, bridge: 0.5, end: 3.2 });
    assert.deepEqual(win[0], { start: 0, end: 1 }, "0.1s gap bridged to the next chunk");
    assert.deepEqual(win[2], { start: 1.4, end: 2.25 }, "1.1s pause: hold 0.35s after the last word");
    assert.deepEqual(win[3], { start: 3, end: 3.2 }, "clipped to the reel end");
  });

  it("emits one timed html clip per chunk with per-word timing attributes", () => {
    const clips = karaokeCaptions(talk, { end: 4, style: "box", highlight: "#7c3aed" });
    assert.deepEqual(clips.map((c) => c.id), ["cap-1", "cap-2", "cap-3", "cap-4"]);
    assert.match(clips[0].html, /class="rc-cap rk rk--box"/);
    assert.match(clips[0].html, /<span class="rk-w" data-on="0" data-t0="0" data-t1="0.3">STOP<\/span> <span class="rk-w" data-on="0" data-t0="0.3" data-t1="1">SCROLLING<\/span>/);
    assert.match(clips[0].html, /--rk-hl: #7c3aed; --rk-ink: #fff;/);
    assert.ok(clips[0].css.includes(".rk--box") && clips.slice(1).every((c) => c.css === ""), "CSS emitted once");
    const { html, warnings } = compile(timeline([solid("#000", { start: 0, duration: 4 }), ...clips]), { name: "k" });
    assert.match(html, /tl\.set\(w, \{ attr: \{ "data-on": "1" \} \}, Number\(w\.dataset\.t0\)\)/);
    assert.ok(!warnings.some((w) => /safe band/.test(w)));
  });

  it("refuses regions outside the safe band unless asked", () => {
    assert.throws(() => karaokeCaptions(talk, { region: { x: 0, y: 1500, w: 1080, h: 300 } }), /safe band/);
    assert.equal(karaokeCaptions(talk, { region: { x: 0, y: 1500, w: 1080, h: 300 }, unsafe: true }).length, 4);
    assert.throws(() => karaokeCaptions(talk, { style: /** @type {any} */ ("neon") }), /unknown style/);
    assert.deepEqual(karaokeRegion("lower"), { x: 180, y: 1010, w: 720, h: 360 });
  });

  it("picks readable ink for the highlight", () => {
    assert.equal(inkOn("#ffe500"), "#000");
    assert.equal(inkOn("#7c3aed"), "#fff");
    assert.equal(inkOn("#fff"), "#000");
    assert.equal(inkOn("rebeccapurple"), "#000");
  });
});

describe("speech pacing", () => {
  const talk = words([["a", 0.5, 1.0], ["b.", 1.1, 1.6], ["c", 3.0, 3.5], ["d", 3.6, 4.0]]);

  it("tightens long pauses to 2×pad and keeps short ones", () => {
    assert.deepEqual(speechRanges(talk, { from: 0.35, to: 4.5, maxPause: 0.6, pad: 0.15 }), [
      { start: 0.35, end: 1.75 }, { start: 2.85, end: 4.5 },
    ]);
    assert.deepEqual(speechRanges(talk, { from: 0, to: 5, maxPause: 0 }), [{ start: 0, end: 5 }], "0 keeps every pause");
    assert.deepEqual(speechRanges(talk, { from: 2, to: 5, maxPause: 0.6 }), [{ start: 2.85, end: 5 }], "silence before the window is dropped");
  });

  it("splits at sentence starts and alternates zoom, flagging jump cuts", () => {
    assert.deepEqual(sentenceBreaks(talk), [2.3]);
    const ranges = splitRanges([{ start: 0, end: 6 }], [2.3, 2.6, 5.5]);
    assert.deepEqual(ranges, [{ start: 0, end: 2.3 }, { start: 2.3, end: 6 }], "pieces under 1s are not split off");
    const segs = layoutSegments([{ start: 0.35, end: 1.75 }, { start: 2.85, end: 4.5 }, { start: 4.5, end: 6 }], { zoom: 1.2 });
    assert.deepEqual(segs.map((s) => [s.at, s.zoom, s.cut]), [[0, 1, false], [1.4, 1.2, true], [3.05, 1, false]]);
    assert.equal(segmentsLength(segs), 4.55);
  });

  it("maps source times onto the edited reel", () => {
    const segs = layoutSegments([{ start: 0.35, end: 1.75 }, { start: 2.85, end: 4.5 }]);
    assert.equal(toReel(segs, 0), 0, "before the start clamps");
    assert.equal(toReel(segs, 1.1), 0.75);
    assert.equal(toReel(segs, 2.0), 1.4, "inside a removed pause snaps to the next kept moment");
    assert.equal(toReel(segs, 3.0), 1.55);
    assert.equal(toReel(segs, 9), 3.05, "past the end clamps");
    assert.deepEqual(mapWords(talk, segs).map((w) => [w.text, w.start, w.end]), [
      ["a", 0.15, 0.65], ["b.", 0.75, 1.25], ["c", 1.55, 2.05], ["d", 2.15, 2.55],
    ]);
  });

  it("parses time windows", () => {
    assert.deepEqual(parseTimeRange("4.2-6"), { start: 4.2, end: 6 });
    assert.deepEqual(parseTimeRange("0:04 - 0:06.5"), { start: 4, end: 6.5 });
    assert.deepEqual(parseTimeRange("4.2+3"), { start: 4.2, end: 7.2 });
    assert.deepEqual(parseTimeRange("4s"), { start: 4, end: 6 });
    assert.equal(parseTimeRange("6-4"), null);
    assert.equal(parseTimeRange("soon"), null);
  });
});

describe("focusCrop", () => {
  it("crops a landscape source to 9:16 around the focus point, clamped to the frame", () => {
    const src = { width: 1920, height: 1080 };
    const box = { w: 1080, h: 1920 };
    assert.deepEqual(focusCrop(src, box), { x: 656, y: 0, w: 608, h: 1080 });
    assert.deepEqual(focusCrop(src, box, { x: 0 }), { x: 0, y: 0, w: 608, h: 1080 });
  });

  it("zooms towards the focus", () => {
    const crop = focusCrop({ width: 720, height: 1280 }, { w: 1080, h: 1920 }, { y: 0.45, zoom: 1.25 });
    assert.deepEqual(crop, { x: 72, y: 64, w: 576, h: 1024 });
    assert.equal(focusCrop({ width: 720, height: 1280 }, { w: 1080, h: 1920 }, { y: 0.1, zoom: 1.25 }).y, 0, "clamped to the top");
  });
});

describe("wipeReveal", () => {
  it("masks the target with a seek-safe clip-path tween and moves the bar by transform", () => {
    const clip = wipeReveal({ target: "after", box: { x: 0, y: 960, w: 1080, h: 960 }, at: 2, duration: 0.7 });
    assert.equal(clip.id, "after-wipe");
    assert.match(clip.script, /tl\.fromTo\("#after", \{"clipPath":"inset\(0% 100% 0% 0%\)"\}, \{"clipPath":"inset\(0% 0% 0% 0%\)","duration":0\.7,"ease":"power2\.inOut"\}, 2\);/);
    assert.match(clip.script, /\{"x":0\}, \{"x":1080,/);
    assert.doesNotMatch(clip.script, /left|top/);
    const up = wipeReveal({ target: "t", box: { x: 0, y: 0, w: 1080, h: 1920 }, at: 0, duration: 1, direction: "up", divider: false });
    assert.match(up.script, /inset\(100% 0% 0% 0%\)/);
    assert.equal(up.html, "");
    assert.throws(() => wipeReveal({ target: "t", box: { x: 0, y: 0, w: 1, h: 1 }, at: 0, duration: 0 }), /duration/);
  });
});
