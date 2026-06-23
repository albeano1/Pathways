import {
  GENERAL_VOCABULARY_ALLOWLIST,
  isScientificPuzzleLemma,
} from "../../shared/puzzleRules.js";

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
const generalAudienceCache = new Map<string, boolean>();

const SCIENTIFIC_DEFINITION_MARKERS: RegExp[] = [
  /\b(?:DNA|RNA|mRNA|genome|chromosome|nucleotide|organelle|allele|intron|exon|codon)\b/i,
  /\b(?:noncoding|coding) (?:sequence|segment|region)\b/i,
  /\b(?:chemical element|chemical compound|organic compound|inorganic compound)\b/i,
  /\b(?:molecule|polymer|isomer|hydrocarbon|alkaloid|amino acid|peptide|enzyme|hormone)\b/i,
  /\b(?:genus|species|family|order|class|phylum|subspecies|taxon|taxonomic)\b/i,
  /\b(?:a genus|a species|a family of|a class of|an order of)\b/i,
  /\b(?:cnidarian|hydrozoan|coelenterate|invertebrate|vertebrate|organism|bacterium|protozoan)\b/i,
  /\b(?:anatomy|anatomical|physiology|physiological|histology|botanical|zoological)\b/i,
  /\b(?:scientific name|binomial name)\b/i,
  /\b(?:segment of a|portion of a).{0,24}\b(?:DNA|RNA|gene)\b/i,
];

const MEDICAL_DEFINITION_MARKERS: RegExp[] = [
  /\b(?:medulla oblongata|bone marrow|spinal cord)\b/i,
  /\borgan of the (?:neck|body|thorax|abdomen|pelvis|skull|head)\b/i,
  /\b(?:respiratory condition|chronic disease|autoimmune disease|medical condition)\b/i,
  /\b(?:pathology|pathological|syndrome|diagnosis|symptom of)\b/i,
  /\b(?:inner substance of various organs|internal tissue of a plant)\b/i,
];

const PHYSICS_DEFINITION_MARKERS: RegExp[] = [
  /\b(?:subatomic|elementary) particle\b/i,
  /\bStandard Model\b/i,
  /\bquantum of (?:light|electromagnetic)\b/i,
  /\b(?:Pauli exclusion|strong force|nucleus of an atom|composite quantum)\b/i,
  /\bforms part of the nucleus\b/i,
];

const PHARMA_DEFINITION_MARKERS: RegExp[] = [
  /\b(?:psychotropic|pharmacology|nootropic|prescription drug|controlled substance)\b/i,
  /\bsubstance purported to\b/i,
  /\bdrug that (?:enhances|treats|reduces|inhibits)\b/i,
];

export function definitionLooksMedical(definition: string): boolean {
  return MEDICAL_DEFINITION_MARKERS.some((pattern) => pattern.test(definition));
}

export function definitionLooksPharmaceutical(definition: string): boolean {
  return PHARMA_DEFINITION_MARKERS.some((pattern) => pattern.test(definition));
}

export function definitionLooksTechnical(definition: string): boolean {
  return (
    definitionLooksScientific(definition) ||
    definitionLooksMedical(definition) ||
    definitionLooksPharmaceutical(definition) ||
    PHYSICS_DEFINITION_MARKERS.some((pattern) => pattern.test(definition))
  );
}

export function definitionLooksScientific(definition: string): boolean {
  return SCIENTIFIC_DEFINITION_MARKERS.some((pattern) => pattern.test(definition));
}

export function hasGeneralAudienceDefinition(entry: DictionaryResult): boolean {
  const primary = entry.senses[0];
  if (!primary || definitionLooksTechnical(primary.definition)) return false;
  return entry.senses.some((sense) => !definitionLooksTechnical(sense.definition));
}

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

export async function lemmaHasDefinition(lemma: string): Promise<boolean> {
  const entry = await fetchDictionaryEntry(lemma);
  return entry !== null && entry.senses.length > 0;
}

export async function lemmaIsGeneralAudienceEndpoint(lemma: string): Promise<boolean> {
  const key = lemma.trim().toLowerCase();
  if (!key) return false;
  if (GENERAL_VOCABULARY_ALLOWLIST.has(key)) return true;
  if (isScientificPuzzleLemma(key)) return false;

  const cached = generalAudienceCache.get(key);
  if (cached !== undefined) return cached;

  const entry = await fetchDictionaryEntry(key);
  const allowed = entry !== null && hasGeneralAudienceDefinition(entry);
  generalAudienceCache.set(key, allowed);
  return allowed;
}
