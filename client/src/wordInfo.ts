import type { WordInfoResponse } from "../../../shared/types";

const infoCache = new Map<string, WordInfoResponse>();

export async function fetchWordInfo(word: string): Promise<WordInfoResponse> {
  const key = word.trim().toLowerCase();
  const cached = infoCache.get(key);
  if (cached) return cached;

  try {
    const response = await fetch(`/api/word-info?word=${encodeURIComponent(key)}`);
    if (!response.ok) {
      return {
        lemma: key,
        inGraph: false,
        error: "Could not load word info.",
      };
    }
    const info = (await response.json()) as WordInfoResponse;
    infoCache.set(key, info);
    return info;
  } catch {
    return {
      lemma: key,
      inGraph: false,
      error: "Could not load word info.",
    };
  }
}
