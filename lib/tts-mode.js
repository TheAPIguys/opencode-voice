// Three-state TTS mode shared by the command layer and the event handlers.
//
// - off:    TTS disabled, including manual /tts-speak
// - manual: TTS enabled, but only /tts-speak (leader+s) plays audio
// - auto:   TTS enabled, automatic announcements play, /tts-speak still works

export const TTS_MODE_OFF = "off";
export const TTS_MODE_MANUAL = "manual";
export const TTS_MODE_AUTO = "auto";

export function normalizeTtsMode(value) {
  if (value === TTS_MODE_OFF || value === TTS_MODE_MANUAL || value === TTS_MODE_AUTO) {
    return value;
  }
  // Anything else - including the pre-1.1 "on" value and undefined - is manual,
  // so upgrading stops automatic playback until the user opts into auto.
  return TTS_MODE_MANUAL;
}

export function nextTtsMode(value) {
  switch (normalizeTtsMode(value)) {
    case TTS_MODE_MANUAL:
      return TTS_MODE_AUTO;
    case TTS_MODE_AUTO:
      return TTS_MODE_OFF;
    default:
      return TTS_MODE_MANUAL;
  }
}

export function ttsModeToast(value, voiceLabel) {
  switch (normalizeTtsMode(value)) {
    case TTS_MODE_MANUAL:
      return "TTS on (manual) - press leader+s to speak";
    case TTS_MODE_AUTO:
      return `TTS auto (${voiceLabel})`;
    default:
      return "TTS off";
  }
}
