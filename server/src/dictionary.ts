interface DictionaryEntry {
  meanings?: Array<{
    partOfSpeech?: string;
    definitions?: Array<{ definition?: string }>;
  }>;
}

export interface DictionarySense {
  partOfSpeech?: string;
  definition: string;
}

export interface DictionaryResult {
  senses: DictionarySense[];
}

const MAX_SENSES = 6;
const dictionaryCache = new Map<string, DictionaryResult | null>();

function parseDictionaryEntries(entries: DictionaryEntry[]): DictionaryResult | null {
  const senses: DictionarySense[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    for (const meaning of entry.meanings ?? []) {
      for (const item of meaning.definitions ?? []) {
        const definition = item.definition?.trim();
        if (!definition || seen.has(definition)) continue;
        seen.add(definition);
        senses.push({
          partOfSpeech: meaning.partOfSpeech,
          definition,
        });
        if (senses.length >= MAX_SENSES) {
          return { senses };
        }
      }
    }
  }

  return senses.length > 0 ? { senses } : null;
}

async function fetchDictionaryFromApi(lemma: string): Promise<DictionaryResult | null> {
  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(lemma)}`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!response.ok) return null;
    const entries = (await response.json()) as DictionaryEntry[];
    return parseDictionaryEntries(entries);
  } catch {
    return null;
  }
}

export async function fetchDictionaryEntry(lemma: string): Promise<DictionaryResult | null> {
  const key = lemma.trim().toLowerCase();
  if (!key) return null;
  if (dictionaryCache.has(key)) return dictionaryCache.get(key)!;

  const result = await fetchDictionaryFromApi(key);
  // Only cache successful lookups — transient API failures should be retried.
  if (result) {
    dictionaryCache.set(key, result);
  }
  return result;
}
