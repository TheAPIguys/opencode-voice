import assert from "node:assert/strict";
import test from "node:test";

import { normalizeTtsSpeed, speedToLengthScale, ttsSpeedLabel } from "../lib/tts-speed.js";

test("normalizes speed values and clamps the range", () => {
  assert.equal(normalizeTtsSpeed(undefined), 1.1);
  assert.equal(normalizeTtsSpeed("1.1"), 1.1);
  assert.equal(normalizeTtsSpeed(0.1), 0.5);
  assert.equal(normalizeTtsSpeed(5), 2);
  assert.equal(normalizeTtsSpeed("nope"), 1.1);
});

test("converts speed to Piper length scale", () => {
  assert.equal(speedToLengthScale(1), 1);
  assert.equal(speedToLengthScale(1.1).toFixed(3), "0.909");
  assert.equal(speedToLengthScale(0.9).toFixed(3), "1.111");
});

test("labels speed choices", () => {
  assert.equal(ttsSpeedLabel(0.9), "0.9x (slower)");
  assert.equal(ttsSpeedLabel(1), "1.0x (normal)");
  assert.equal(ttsSpeedLabel(1.1), "1.1x (faster)");
});
