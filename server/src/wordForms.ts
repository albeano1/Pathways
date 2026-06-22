import {
  areDistinctMorphPair,
  generatePlurals,
  inputSurfaceForms,
  singularizeCandidates,
  IRREGULAR_PLURALS,
  IRREGULAR_SINGULARS,
} from "../../shared/wordForms.js";

export {
  areDistinctMorphPair,
  generatePlurals,
  inputSurfaceForms,
  singularizeCandidates,
  IRREGULAR_PLURALS,
  IRREGULAR_SINGULARS,
};

/** Build plural alias map for all lemmas in the graph. */
export function buildPluralAliasMap(lemmas: string[]): Map<string, string> {
  const aliasMap = new Map<string, string>();

  for (const lemma of lemmas) {
    aliasMap.set(lemma, lemma);

    for (const plural of generatePlurals(lemma)) {
      if (!aliasMap.has(plural)) {
        aliasMap.set(plural, lemma);
      }
    }
  }

  return aliasMap;
}

/** Lemmas that differ only by number (singular/plural) for an in-graph word. */
export function morphologicalVariants(
  lemma: string,
  exists: (lemma: string) => boolean
): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const add = (candidate: string) => {
    if (!exists(candidate) || seen.has(candidate)) return;
    seen.add(candidate);
    ordered.push(candidate);
  };

  add(lemma);
  for (const singular of singularizeCandidates(lemma)) {
    add(singular);
  }
  for (const plural of generatePlurals(lemma)) {
    add(plural);
  }
  for (const singular of singularizeCandidates(lemma)) {
    for (const plural of generatePlurals(singular)) {
      add(plural);
    }
  }

  return ordered;
}

export function resolveLemmaWithAliases(
  word: string,
  lemmas: Set<string>,
  aliasMap: Map<string, string>,
  lookup: (lemma: string) => boolean
): string | null {
  const normalized = word.trim().toLowerCase();
  if (!normalized) return null;

  if (lookup(normalized)) return normalized;

  const alias = aliasMap.get(normalized);
  if (alias && lookup(alias)) return alias;

  for (const candidate of singularizeCandidates(normalized)) {
    if (lookup(candidate)) return candidate;
  }

  return null;
}
