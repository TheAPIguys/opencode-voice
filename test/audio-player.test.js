import assert from "node:assert/strict";
import test from "node:test";

import { pickAudioPlayer } from "../lib/audio-player.js";

function playerFor(...commands) {
  const available = new Set(commands);
  return pickAudioPlayer((name) => available.has(name));
}

test("prefers sox play when available", () => {
  const player = playerFor("play", "paplay", "aplay", "ffplay");
  assert.equal(player.command, "play");
  assert.deepEqual(player.args.slice(0, 2), ["-t", "raw"]);
});

test("falls back to paplay, then aplay, then ffplay", () => {
  assert.equal(playerFor("paplay", "aplay", "ffplay").command, "paplay");
  assert.equal(playerFor("aplay", "ffplay").command, "aplay");
  assert.equal(playerFor("ffplay").command, "ffplay");
});

test("returns null when no player is available", () => {
  assert.equal(playerFor(), null);
});
