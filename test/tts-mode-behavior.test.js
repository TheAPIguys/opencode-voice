import assert from "node:assert/strict";
import test from "node:test";

import { registerTTS } from "../lib/tts.js";

const originalPath = process.env.PATH;

function createHarness(mode) {
  const toasts = [];
  const handlers = new Map();

  const api = {
    client: { session: { list: async () => [] } },
    ui: {
      toast: (toast) => toasts.push(toast),
    },
    event: {
      on: (type, handler) => {
        handlers.set(type, handler);
        return () => {};
      },
    },
    route: {
      current: { name: "session", params: { sessionID: "session-1" } },
    },
    state: {
      session: {
        messages: () => [
          { type: "user", content: [] },
          {
            type: "assistant",
            id: "message-1",
            content: [{ type: "text", text: "Hello from the assistant." }],
          },
        ],
        root: (id) => id,
      },
    },
  };

  const kv = {
    get: (key, fallback) => (key === "tts.mode" ? mode : fallback),
    set: () => {},
  };

  registerTTS(api, kv, async () => ({ text: "Normalized." }), {}, null);
  return { handlers, toasts };
}

async function emitTurn(handlers) {
  handlers.get("session.execution.started")({ properties: { sessionID: "session-1" } });
  handlers.get("session.execution.succeeded")({ properties: { sessionID: "session-1" } });
  await new Promise((resolve) => setTimeout(resolve, 30));
}

test("manual mode stays silent on turn completion", async () => {
  const { handlers, toasts } = createHarness("manual");
  await emitTurn(handlers);

  assert.equal(
    toasts.some((toast) => toast.message.includes("Normalizing response")),
    false,
  );
});

test("auto mode attempts to speak on turn completion", async () => {
  process.env.PATH = "";
  try {
    const { handlers, toasts } = createHarness("auto");
    await emitTurn(handlers);

    assert.equal(
      toasts.some((toast) => toast.message.includes("Normalizing response")),
      true,
    );
  } finally {
    process.env.PATH = originalPath;
  }
});
