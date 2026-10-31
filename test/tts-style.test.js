import assert from "node:assert/strict";
import test from "node:test";

import { normalizeTtsStyle, ttsStyleLabel } from "../lib/tts-style.js";

test("normalizes TTS styles", () => {
  assert.equal(normalizeTtsStyle(undefined), "auto");
  assert.equal(normalizeTtsStyle("auto"), "auto");
  assert.equal(normalizeTtsStyle("summary"), "summary");
  assert.equal(normalizeTtsStyle("full"), "full");
  assert.equal(normalizeTtsStyle("bogus"), "auto");
});

test("labels TTS styles", () => {
  assert.equal(ttsStyleLabel("auto"), "Auto (adaptive)");
  assert.equal(ttsStyleLabel("summary"), "Summary (brief)");
  assert.equal(ttsStyleLabel("full"), "Full (read prose)");
});
