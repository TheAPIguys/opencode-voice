import assert from "node:assert/strict";
import test from "node:test";

import { fallbackSpeechText } from "../lib/speech-text.js";

test("removes fenced code and markdown punctuation", () => {
  const text = fallbackSpeechText(
    "# Result\n\nUse `parseConfig` in **src/utils/helpers.ts**.\n\n```js\nconst x = 1;\n```",
  );

  assert.equal(text, "Result Use parseConfig in src/utils/helpers.ts. Code block.");
});

test("unwraps links and removes images", () => {
  const text = fallbackSpeechText("See [the docs](https://example.test) ![shot](image.png) now.");
  assert.equal(text, "See the docs now.");
});
