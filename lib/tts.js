// Text-to-speech: LLM normalization, Piper synthesis, audio playback.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { findAudioPlayer } from "./audio-player.js";
import { getSessionTitle } from "./session.js";
import { fallbackSpeechText } from "./speech-text.js";
import {
  TTS_MODE_AUTO,
  TTS_MODE_MANUAL,
  TTS_MODE_OFF,
  nextTtsMode,
  normalizeTtsMode,
  ttsModeToast,
} from "./tts-mode.js";

const VOICES_DIR = path.join(os.homedir(), ".local", "share", "piper-voices");

const TTS_VOICES = {
  amy: { label: "Amy (US female, medium)", file: "en_US-amy-medium.onnx" },
  lessac: { label: "Lessac (US female, high)", file: "en_US-lessac-high.onnx" },
  hfc: { label: "HFC Female (US female, medium)", file: "en_US-hfc_female-medium.onnx" },
  ryan: { label: "Ryan (male, high)", file: "en_US-ryan-high.onnx" },
  bryce: { label: "Bryce (male, medium)", file: "en_US-bryce-medium.onnx" },
};
const DEFAULT_TTS_VOICE = "amy";

// ---- System prompts ----

const SYSTEM_AUTO = `You are a text-to-speech narrator for a coding assistant CLI. Your job is to convert the assistant's markdown output into natural spoken text that is useful and pleasant to listen to.

You have three modes depending on the content complexity:

1. NARRATE - For simple explanations, short answers, and conversational responses. Convert to natural spoken text, normalizing code references for speech.
   - camelCase/PascalCase identifiers: split into words (parseConfig -> "parse config")
   - File paths: use just the filename (src/utils/helpers.ts -> "helpers dot ts")
   - Short code snippets in backticks: read them naturally
   - Keep the narrative flow intact

2. SUMMARIZE - For responses with significant code blocks, multiple file changes, or complex technical details. Provide a brief spoken summary of what was done and tell the user to check the screen.
   - Mention what was changed and why
   - Do not try to describe code blocks verbatim
   - End with something like "check the details on your screen" or "take a look at the output for the specifics"

3. NOTIFY - For very short confirmations, status updates, or acknowledgments. Keep it to one brief sentence.

Choose the appropriate mode based on the content. Most responses with code blocks should use SUMMARIZE mode. Simple Q&A or short explanations use NARRATE. Build results, "done", confirmations use NOTIFY.

Output ONLY the spoken text. Nothing else. No mode labels. No commentary.`;

const SYSTEM_MANUAL = `You are a text-to-speech reader for a coding assistant. The user has explicitly requested this text be read aloud. Read the prose content faithfully and in detail.

Rules:
- Read all prose text naturally and completely
- Code identifiers: split camelCase/PascalCase/snake_case into words (parseConfig -> "parse config", my_variable -> "my variable")
- File paths: read just the filename with extension (src/utils/helpers.ts -> "helpers dot ts")
- Line references: keep as is ("line 42")
- URLs: say "a link" or just the domain name
- Code blocks: skip entirely, just say "code block" or "code snippet"
- Error codes: expand naturally (ECONNREFUSED -> "connection refused")
- Shell commands: read them naturally (npm test -> "npm test")
- List items: read each item
- Remove markdown formatting but preserve all the informational content
- Do NOT summarize. Do NOT say "check the screen". Read everything that is prose.
- Output ONLY the spoken text`;

// ---- Session helpers ----

async function getTurnAssistantText(api) {
  const route = api.route.current;
  if (route.name !== "session") return null;

  const sessionID = route.params.sessionID;
  const messages = api.state.session.messages(sessionID);
  if (!messages || messages.length === 0) return null;

  // Collect the assistant messages of the current turn (since the last user
  // message). V2 messages carry their full projected content.
  const assistant = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].type === "user") break;
    if (messages[i].type === "assistant") assistant.unshift(messages[i]);
  }
  if (assistant.length === 0) return null;

  const allText = [];
  for (const message of assistant) {
    const text = (message.content || [])
      .filter((part) => part.type === "text")
      .map((part) => part.text || "")
      .join("\n\n")
      .trim();
    if (text) allText.push(text);
  }

  if (allText.length === 0) return null;

  return {
    lastMessageID: assistant[assistant.length - 1].id,
    text: allText.join("\n\n"),
  };
}

// ---- Public API for TUI plugin ----

export function registerTTS(api, kv, complete, prompts, logger) {
  const client = api.client;
  const systemAuto = prompts?.ttsAuto || SYSTEM_AUTO;
  const systemManual = prompts?.ttsManual || SYSTEM_MANUAL;

  function toast(message, variant = "info") {
    api.ui.toast({ message, variant, duration: 3000 });
  }

  function getMode() {
    return normalizeTtsMode(kv.get("tts.mode", TTS_MODE_MANUAL));
  }

  function getVoiceModel() {
    const voice = kv.get("tts.voice", DEFAULT_TTS_VOICE);
    const entry = TTS_VOICES[voice] || TTS_VOICES[DEFAULT_TTS_VOICE];
    return path.join(VOICES_DIR, entry.file);
  }

  function piperOnPath() {
    const pathDirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
    return pathDirs.some((dir) => fs.existsSync(path.join(dir, "piper")));
  }

  async function normalizeForSpeech(text, systemPrompt) {
    logger?.log?.("TTS", `Normalizing speech chars=${text.length}`, "debug");
    const result = await complete({
      system: systemPrompt,
      prompt: `Convert for text-to-speech:\n\n${text}`,
      config: { maxTokens: 4096 },
    });
    if (result.text) return result;

    const fallback = fallbackSpeechText(text);
    if (!fallback) return result;

    logger?.log?.("TTS", `Normalization failed (${result.error}); speaking raw text`, "warn");
    return { text: fallback };
  }

  // ---- Audio pipeline ----

  let piperProc = null;
  let playProc = null;

  function killProcs() {
    if (piperProc) {
      try {
        piperProc.kill("SIGKILL");
      } catch {}
      piperProc = null;
    }
    if (playProc) {
      try {
        playProc.kill("SIGKILL");
      } catch {}
      playProc = null;
    }
  }

  function speak(text) {
    if (!text) return Promise.resolve();
    const line = text.replace(/\n/g, " ").trim();
    if (!line) return Promise.resolve();

    killProcs();

    const voiceModel = getVoiceModel();
    logger?.log?.("TTS", `Speak requested chars=${line.length} voice=${voiceModel}`, "debug");
    if (!piperOnPath()) {
      logger?.log?.("TTS", `Piper binary not found on PATH`, "warn");
      toast(`Piper binary not found on PATH`, "warning");
      return Promise.resolve();
    }
    if (!fs.existsSync(voiceModel)) {
      logger?.log?.("TTS", `Voice model not found: ${voiceModel}`, "warn");
      toast(`Voice model not found: ${voiceModel}`, "warning");
      return Promise.resolve();
    }

    const player = findAudioPlayer();
    if (!player) {
      logger?.log?.("TTS", `No audio player found`, "warn");
      toast(`No audio player found (install sox, pulseaudio-utils, or ffmpeg)`, "warning");
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let piperStderr = "";
      let playStderr = "";
      playProc = spawn(player.command, player.args, { stdio: ["pipe", "ignore", "pipe"] });

      piperProc = spawn("piper", ["-m", voiceModel, "--output_raw"], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      piperProc.stderr.on("data", (chunk) => {
        piperStderr += chunk.toString();
      });
      playProc.stderr.on("data", (chunk) => {
        playStderr += chunk.toString();
      });

      piperProc.stdout.on("data", (chunk) => {
        if (playProc?.stdin && !playProc.stdin.destroyed) {
          playProc.stdin.write(chunk);
        }
      });

      piperProc.on("close", (code) => {
        if (code !== 0 && code !== null) {
          logger?.log?.("TTS", `piper exited code=${code} stderr=${piperStderr.trim()}`, "error");
        }
        if (playProc?.stdin && !playProc.stdin.destroyed) {
          playProc.stdin.end();
        }
      });

      playProc.on("close", (code) => {
        if (code !== 0 && code !== null) {
          logger?.log?.(
            "TTS",
            `${player.command} exited code=${code} stderr=${playStderr.trim()}`,
            "error",
          );
        } else {
          logger?.log?.("TTS", "playback finished", "debug");
        }
        piperProc = null;
        playProc = null;
        resolve();
      });

      piperProc.on("error", (err) => {
        logger?.log?.("TTS", `piper error: ${err.message}`, "error");
        killProcs();
        resolve();
      });
      playProc.on("error", (err) => {
        logger?.log?.("TTS", `${player.command} error: ${err.message}`, "error");
        killProcs();
        resolve();
      });

      if (piperProc?.stdin && !piperProc.stdin.destroyed) {
        piperProc.stdin.write(line + "\n");
        piperProc.stdin.end();
      }
    });
  }

  // ---- Session-prefixed announcements ----

  async function speakWithSessionPrefix(sessionID, message, suffix) {
    const sessionTitle = await getSessionTitle(client, sessionID);
    const parts = [];
    if (sessionTitle) parts.push(`Session: ${sessionTitle}.`);
    parts.push(message);
    if (suffix) parts.push(suffix);
    await speak(parts.join(" "));
  }

  function stopSpeech() {
    const wasPlaying = piperProc !== null || playProc !== null;
    killProcs();
    return wasPlaying;
  }

  // ---- Auto mode ----

  // Only `auto` announces automatically. `manual` keeps TTS enabled but waits
  // for /tts-speak (leader+s); `off` disables playback entirely.

  // V2 never emits the V1 `session.status`/`session.idle` pair; the live
  // signals are `session.execution.started` and
  // `session.execution.succeeded`/`interrupted`/`failed`. Busy state is
  // tracked per session, and only the session this TUI is currently showing
  // is ever spoken: on the shared server every instance receives every
  // event, and without the gate each TUI would speak every completion,
  // permission, and question.
  let lastSpokenMessageID = null;
  const busySessions = new Set();

  function showingSession(sessionID) {
    const route = api.route.current;
    // Not looking at a session: keep V1's fall-through so single-window
    // setups still hear attention events from anywhere.
    if (route.name !== "session") return true;
    return route.params.sessionID === sessionID;
  }

  // Permission prompts and forms from subagent sessions are displayed under
  // their parent in the session view, so they must announce while the parent
  // (or any ancestor) is shown, not only when the subagent itself is open.
  function showingSessionFamily(sessionID) {
    const route = api.route.current;
    if (route.name !== "session") return true;
    if (!sessionID) return false;
    if (route.params.sessionID === sessionID) return true;
    const root = api.state.session.root;
    if (!root) return false;
    return root(sessionID) === root(route.params.sessionID);
  }

  async function speakTurnCompletion(sessionID) {
    if (getMode() !== TTS_MODE_AUTO) return;
    if (!busySessions.delete(sessionID)) return;
    if (!showingSession(sessionID)) return;

    const result = await getTurnAssistantText(api);
    if (!result || !result.text) return;

    if (result.lastMessageID === lastSpokenMessageID) return;
    lastSpokenMessageID = result.lastMessageID;

    toast("Normalizing response...");
    const llmResult = await normalizeForSpeech(result.text, systemAuto);
    if (!llmResult.text) {
      logger?.log?.("TTS", `Auto normalization failed: ${llmResult.error}`, "warn");
      toast(`TTS normalization failed: ${llmResult.error}`, "warning");
      return;
    }

    logger?.log?.("TTS", `Auto normalization succeeded chars=${llmResult.text.length}`, "debug");
    await speakWithSessionPrefix(sessionID, llmResult.text, "Ready for your input.");
  }

  api.event.on("session.execution.started", (event) => {
    const sessionID = event.properties?.sessionID;
    if (sessionID) busySessions.add(sessionID);
  });

  api.event.on("session.execution.succeeded", (event) => {
    void speakTurnCompletion(event.properties?.sessionID);
  });

  api.event.on("session.execution.interrupted", (event) => {
    void speakTurnCompletion(event.properties?.sessionID);
  });

  api.event.on("session.execution.failed", (event) => {
    // A failed execution ends the busy cycle without an announcement.
    busySessions.delete(event.properties?.sessionID);
  });

  api.event.on("permission.asked", async (event) => {
    if (getMode() !== TTS_MODE_AUTO) return;
    if (!showingSessionFamily(event.properties?.sessionID)) return;
    await speakWithSessionPrefix(
      event.properties?.sessionID,
      "Permission requested. Please check your screen.",
    );
  });

  api.event.on("question.asked", async (event) => {
    if (getMode() !== TTS_MODE_AUTO) return;
    if (!showingSessionFamily(event.properties?.sessionID)) return;
    await speakWithSessionPrefix(
      event.properties?.sessionID,
      "A question needs your answer. Please check your screen.",
    );
  });

  // ---- Manual mode ----

  async function speakLastResponse() {
    if (getMode() === TTS_MODE_OFF) {
      toast("TTS off - press leader+v to enable", "warning");
      return;
    }

    const result = await getTurnAssistantText(api);
    if (!result || !result.text) {
      toast("No assistant response to speak", "warning");
      return;
    }

    toast("Normalizing response...");
    const llmResult = await normalizeForSpeech(result.text, systemManual);
    if (!llmResult.text) {
      logger?.log?.("TTS", `Manual normalization failed: ${llmResult.error}`, "warn");
      toast(`TTS normalization failed: ${llmResult.error}`, "warning");
      return;
    }

    logger?.log?.("TTS", `Manual normalization succeeded chars=${llmResult.text.length}`, "debug");
    toast("Speaking last response");
    await speak(llmResult.text);
  }

  // ---- Commands ----

  return [
    {
      title: "TTS: speak last response",
      value: "tts.speak-last",
      description: "Read the last assistant response aloud (detailed)",
      keybind: "<leader>s",
      slash: { name: "tts-speak" },
      onSelect() {
        return speakLastResponse();
      },
    },
    {
      title: "TTS: cycle mode",
      value: "tts.mode",
      description: "Cycle TTS mode: manual -> auto -> off",
      keybind: "<leader>v",
      slash: { name: "tts-mode" },
      onSelect() {
        const next = nextTtsMode(getMode());
        kv.set("tts.mode", next);
        if (next !== TTS_MODE_AUTO) stopSpeech();
        const voice =
          TTS_VOICES[kv.get("tts.voice", DEFAULT_TTS_VOICE)] || TTS_VOICES[DEFAULT_TTS_VOICE];
        toast(ttsModeToast(next, voice.label));
      },
    },
    {
      title: "TTS: stop playback",
      value: "tts.stop",
      description: "Stop current TTS playback",
      keybind: "escape",
      slash: { name: "tts-stop" },
      onSelect() {
        // Returning false when nothing is playing lets Escape fall through to
        // the next handler (session interrupt) instead of being swallowed by
        // a global layer that owns the key at all times.
        if (!stopSpeech()) return false;
        toast("TTS stopped");
      },
    },
    {
      title: "TTS: select voice",
      value: "tts.voice",
      description: "Choose TTS voice",
      slash: { name: "tts-voice" },
      onSelect() {
        const current = kv.get("tts.voice", DEFAULT_TTS_VOICE);
        api.ui.dialog.replace(() =>
          api.ui.DialogSelect({
            title: "Select voice",
            current,
            options: Object.entries(TTS_VOICES).map(([key, v]) => ({
              title: v.label,
              value: key,
              onSelect() {
                kv.set("tts.voice", key);
                toast(`Voice: ${v.label}`);
                api.ui.dialog.clear();
              },
            })),
          }),
        );
      },
    },
  ];
}
