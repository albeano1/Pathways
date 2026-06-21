const VOWELS = new Set(["a", "e", "i", "o", "u"]);

/** Singular -> plural for common irregular English nouns. */
export const IRREGULAR_PLURALS: Readonly<Record<string, string>> = {
  child: "children",
  person: "people",
  man: "men",
  woman: "women",
  mouse: "mice",
  goose: "geese",
  tooth: "teeth",
  foot: "feet",
  ox: "oxen",
  louse: "lice",
  die: "dice",
  leaf: "leaves",
  life: "lives",
  knife: "knives",
  wolf: "wolves",
  shelf: "shelves",
  half: "halves",
  self: "selves",
  calf: "calves",
  loaf: "loaves",
  potato: "potatoes",
  tomato: "tomatoes",
  hero: "heroes",
  echo: "echoes",
  volcano: "volcanoes",
  analysis: "analyses",
  basis: "bases",
  crisis: "crises",
  diagnosis: "diagnoses",
  hypothesis: "hypotheses",
  oasis: "oases",
  thesis: "theses",
  criterion: "criteria",
  phenomenon: "phenomena",
  index: "indices",
  matrix: "matrices",
  vertex: "vertices",
  appendix: "appendices",
  fungus: "fungi",
  cactus: "cacti",
  focus: "foci",
  nucleus: "nuclei",
  syllabus: "syllabi",
  stimulus: "stimuli",
  datum: "data",
  medium: "media",
  bacterium: "bacteria",
  curriculum: "curricula",
  memorandum: "memoranda",
  schema: "schemata",
  formula: "formulae",
};

export const IRREGULAR_SINGULARS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(IRREGULAR_PLURALS).map(([singular, plural]) => [plural, singular])
);

function endsWithConsonantY(word: string): boolean {
  return word.length >= 2 && word.endsWith("y") && !VOWELS.has(word.at(-2)!);
}

function endsWithSibilant(word: string): boolean {
  return /(?:s|x|z|ch|sh)$/.test(word);
}

/** Generate likely plural surface forms for a graph lemma. */
export function generatePlurals(singular: string): string[] {
  const plurals = new Set<string>();

  if (IRREGULAR_PLURALS[singular]) {
    plurals.add(IRREGULAR_PLURALS[singular]!);
  }

  if (endsWithConsonantY(singular)) {
    plurals.add(`${singular.slice(0, -1)}ies`);
  } else if (singular.endsWith("f")) {
    plurals.add(`${singular.slice(0, -1)}ves`);
    plurals.add(`${singular}s`);
  } else if (singular.endsWith("fe")) {
    plurals.add(`${singular.slice(0, -2)}ves`);
    plurals.add(`${singular.slice(0, -1)}s`);
  } else if (endsWithSibilant(singular)) {
    plurals.add(`${singular}es`);
  } else if (singular.endsWith("o")) {
    plurals.add(`${singular}es`);
    plurals.add(`${singular}s`);
  } else {
    plurals.add(`${singular}s`);
  }

  plurals.delete(singular);
  return [...plurals];
}

/** Candidate singular forms for user input that may be plural. */
export function singularizeCandidates(word: string): string[] {
  const candidates = new Set<string>();

  if (IRREGULAR_SINGULARS[word]) {
    candidates.add(IRREGULAR_SINGULARS[word]!);
  }

  if (word.endsWith("ies") && word.length > 4) {
    candidates.add(`${word.slice(0, -3)}y`);
  }

  if (word.endsWith("ves") && word.length > 4) {
    candidates.add(`${word.slice(0, -3)}f`);
    candidates.add(`${word.slice(0, -3)}fe`);
  }

  if (word.endsWith("oes") && word.length > 4) {
    candidates.add(word.slice(0, -2));
    candidates.add(word.slice(0, -1));
  }

  if (/(?:ches|shes|xes|zes|ses)$/.test(word) && word.length > 4) {
    candidates.add(word.slice(0, -2));
  }

  if (word.endsWith("es") && word.length > 4) {
    candidates.add(word.slice(0, -2));
    candidates.add(word.slice(0, -1));
  }

  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) {
    candidates.add(word.slice(0, -1));
  }

  candidates.delete(word);
  return [...candidates];
}
