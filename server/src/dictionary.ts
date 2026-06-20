interface DictionaryEntry {
  meanings?: Array<{
    partOfSpeech?: string;
    definitions?: Array<{ definition?: string }>;
  }>;
}

export interface DictionaryResult {
  definition: string;
  partOfSpeech?: string;
}

export async function fetchDictionaryEntry(lemma: string): Promise<DictionaryResult | null> {
  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(lemma)}`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!response.ok) return null;

    const entries = (await response.json()) as DictionaryEntry[];
    for (const entry of entries) {
      for (const meaning of entry.meanings ?? []) {
        const definition = meaning.definitions?.[0]?.definition?.trim();
        if (definition) {
          return {
            definition,
            partOfSpeech: meaning.partOfSpeech,
          };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}
