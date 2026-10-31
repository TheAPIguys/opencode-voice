import assert from "node:assert/strict";
import test from "node:test";

import { nextTtsMode, normalizeTtsMode, ttsModeToast } from "../lib/tts-mode.js";

test("normalizes stored and legacy TTS modes to manual by default", () => {
  assert.equal(normalizeTtsMode(undefined), "manual");
  assert.equal(normalizeTtsMode("off"), "off");
  assert.equal(normalizeTtsMode("manual"), "manual");
  assert.equal(normalizeTtsMode("auto"), "auto");
  assert.equal(normalizeTtsMode("on"), "manual");
  assert.equal(normalizeTtsMode("bogus"), "manual");
});

test("cycles off -> manual -> auto -> off", () => {
  assert.equal(nextTtsMode("off"), "manual");
  assert.equal(nextTtsMode("manual"), "auto");
  assert.equal(nextTtsMode("auto"), "off");
  assert.equal(nextTtsMode("on"), "auto");
});

test("describes each mode", () => {
  assert.equal(ttsModeToast("off", "Ryan"), "TTS off");
  assert.match(ttsModeToast("manual", "Ryan"), /leader\+s/);
  assert.match(ttsModeToast("auto", "Ryan"), /Ryan/);
});
