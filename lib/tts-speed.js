export const DEFAULT_TTS_SPEED = 1.1;
const MIN_TTS_SPEED = 0.5;
const MAX_TTS_SPEED = 2;

export function normalizeTtsSpeed(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_TTS_SPEED;
  return Math.min(MAX_TTS_SPEED, Math.max(MIN_TTS_SPEED, parsed));
}

// Piper's length scale is inverted: smaller values speak faster.
export function speedToLengthScale(speed) {
  return 1 / normalizeTtsSpeed(speed);
}

export function ttsSpeedLabel(speed) {
  const value = normalizeTtsSpeed(speed);
  if (value < 1) return `${value.toFixed(1)}x (slower)`;
  if (value > 1) return `${value.toFixed(1)}x (faster)`;
  return "1.0x (normal)";
}
