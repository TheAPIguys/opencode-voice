// Last-resort speech text when the normalization LLM is unavailable.
// Keep it simple: drop fenced code, unwrap inline code and links, and strip
// the most common markdown punctuation so the raw response is still listenable.
export function fallbackSpeechText(text) {
  return String(text ?? "")
    .replace(/```[\s\S]*?```/g, " Code block. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Heuristic summary used when the LLM is unavailable: keep the first three
// sentences of the cleaned response.
export function fallbackSummaryText(text) {
  const clean = fallbackSpeechText(text);
  if (!clean) return "";
  const sentences = clean.match(/[^.!?]+[.!?]+/g);
  if (!sentences) return clean;
  return sentences.slice(0, 3).join(" ").replace(/\s+/g, " ").trim();
}
