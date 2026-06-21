import type { WordInfoResponse } from "../../../shared/types";

const infoCache = new Map<string, WordInfoResponse>();
const inflight = new Map<string, Promise<WordInfoResponse>>();

function cacheKey(word: string): string {
  return word.trim().toLowerCase();
}

export function getCachedWordInfo(word: string): WordInfoResponse | undefined {
  return infoCache.get(cacheKey(word));
}

async function fetchWordInfoOnce(word: string): Promise<WordInfoResponse> {
  const key = cacheKey(word);
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

export async function fetchWordInfo(word: string): Promise<WordInfoResponse> {
  const key = cacheKey(word);
  if (!key) {
    return { lemma: "", inGraph: false, error: "Missing word." };
  }

  const cached = infoCache.get(key);
  if (cached) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const task = fetchWordInfoOnce(key).finally(() => {
    if (inflight.get(key) === task) inflight.delete(key);
  });
  inflight.set(key, task);
  return task;
}

/** Warm definition cache for words the player may tap (path, goal, neighbors). */
export function prefetchWordInfo(words: string[]): void {
  const seen = new Set<string>();
  for (const word of words) {
    const key = cacheKey(word);
    if (!key || seen.has(key) || infoCache.has(key) || inflight.has(key)) continue;
    seen.add(key);
    void fetchWordInfo(key);
  }
}
