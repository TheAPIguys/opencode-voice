export const TTS_STYLE_AUTO = "auto";
export const TTS_STYLE_SUMMARY = "summary";
export const TTS_STYLE_FULL = "full";

export function normalizeTtsStyle(value) {
  if (value === TTS_STYLE_SUMMARY || value === TTS_STYLE_FULL || value === TTS_STYLE_AUTO) {
    return value;
  }
  return TTS_STYLE_AUTO;
}

export function ttsStyleLabel(value) {
  switch (normalizeTtsStyle(value)) {
    case TTS_STYLE_SUMMARY:
      return "Summary (brief)";
    case TTS_STYLE_FULL:
      return "Full (read prose)";
    default:
      return "Auto (adaptive)";
  }
}
