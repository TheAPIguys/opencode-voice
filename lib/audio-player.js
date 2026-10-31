import fs from "node:fs";
import path from "node:path";

const PIPER_RATE = 22050;
const PIPER_BITS = 16;
const PIPER_CHANNELS = 1;

// Raw PCM players in preference order. `play` (sox) matches upstream; the
// others keep TTS working on Linux systems that only ship PulseAudio/ALSA or
// ffmpeg.
export function pickAudioPlayer(hasCommand) {
  if (hasCommand("play")) {
    return {
      command: "play",
      args: [
        "-t",
        "raw",
        "-r",
        String(PIPER_RATE),
        "-e",
        "signed",
        "-b",
        String(PIPER_BITS),
        "-c",
        String(PIPER_CHANNELS),
        "-q",
        "-",
      ],
    };
  }
  if (hasCommand("paplay")) {
    return {
      command: "paplay",
      args: ["--raw", `--format=s16le`, `--rate=${PIPER_RATE}`, `--channels=${PIPER_CHANNELS}`],
    };
  }
  if (hasCommand("aplay")) {
    return {
      command: "aplay",
      args: [
        "-q",
        "-t",
        "raw",
        "-f",
        "S16_LE",
        "-r",
        String(PIPER_RATE),
        "-c",
        String(PIPER_CHANNELS),
        "-",
      ],
    };
  }
  if (hasCommand("ffplay")) {
    return {
      command: "ffplay",
      args: [
        "-f",
        "s16le",
        "-ar",
        String(PIPER_RATE),
        "-ac",
        String(PIPER_CHANNELS),
        "-nodisp",
        "-autoexit",
        "-loglevel",
        "quiet",
        "-",
      ],
    };
  }
  return null;
}

export function findAudioPlayer() {
  const pathDirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const hasCommand = (name) => pathDirs.some((dir) => fs.existsSync(path.join(dir, name)));
  return pickAudioPlayer(hasCommand);
}
