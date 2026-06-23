import type { Difficulty } from "./types.js";
import { generatePlurals, singularizeCandidates } from "./wordForms.js";

export interface PuzzleHopBounds {
  minNodes: number;
  maxNodes: number;
  minHops: number;
  maxHops: number;
}

/** Daily puzzles through this Pacific date use the original shorter path range. */
export const LEGACY_DAILY_PUZZLE_BOUNDS: PuzzleHopBounds = {
  minNodes: 4,
  maxNodes: 7,
  minHops: 3,
  maxHops: 6,
};

/** Default bounds for new random puzzles and daily puzzles from `MIN_SIX_NODE_PUZZLE_DATE`. */
export const STANDARD_PUZZLE_BOUNDS: PuzzleHopBounds = {
  minNodes: 6,
  maxNodes: 8,
  minHops: 5,
  maxHops: 7,
};

/** First Pacific calendar day daily puzzles require at least six nodes. */
export const MIN_SIX_NODE_PUZZLE_DATE = "2026-06-22";

export function puzzleHopBoundsForDate(puzzleDate?: string): PuzzleHopBounds {
  if (!puzzleDate || puzzleDate >= MIN_SIX_NODE_PUZZLE_DATE) {
    return STANDARD_PUZZLE_BOUNDS;
  }
  return LEGACY_DAILY_PUZZLE_BOUNDS;
}

/** Shortest-path node count bounds for newly generated non-daily puzzles. */
export const MIN_PUZZLE_NODES = STANDARD_PUZZLE_BOUNDS.minNodes;
export const MAX_PUZZLE_NODES = STANDARD_PUZZLE_BOUNDS.maxNodes;
export const MIN_PUZZLE_HOPS = STANDARD_PUZZLE_BOUNDS.minHops;
export const MAX_PUZZLE_HOPS = STANDARD_PUZZLE_BOUNDS.maxHops;

/** Word must sit in this degree range to be chosen as a puzzle endpoint. */
export const MIN_WORD_DEGREE = 8;
export const MAX_WORD_DEGREE = 300;

/** Playable lemma length bounds (letters only). */
export const MIN_LEMMA_LENGTH = 3;
export const MAX_LEMMA_LENGTH = 18;

export const DAILY_PUZZLE_MAX_ATTEMPTS = 64;
export const RANDOM_PUZZLE_MAX_ATTEMPTS = 32;

/** Over-connected or overly abstract lemmas to skip as endpoints. */
export const BLOCKED_PUZZLE_LEMMAS = new Set([
  "thing",
  "something",
  "object",
  "entity",
  "person",
  "people",
  "human",
  "life",
  "world",
  "time",
  "way",
  "part",
  "form",
  "type",
  "group",
]);

/** Cardinal/ordinal number words — poor puzzle endpoints and path steps. */
export const NUMBER_PUZZLE_LEMMAS = new Set([
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
  "hundred",
  "thousand",
  "million",
  "billion",
  "dozen",
  "pair",
  "double",
  "triple",
  "single",
  "half",
  "quarter",
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
  "eleventh",
  "twelfth",
  "thirteenth",
  "fourteenth",
  "fifteenth",
  "sixteenth",
  "seventeenth",
  "eighteenth",
  "nineteenth",
  "twentieth",
  "number",
  "numbers",
  "digit",
  "digits",
  "numeral",
  "numerals",
  "integer",
  "integers",
  "count",
  "counting",
]);

/** Playable puzzle endpoints must be at least this long (filters most acronyms). */
export const MIN_PUZZLE_ENDPOINT_LENGTH = 4;

/** Known abbreviations and opaque tokens — not fun as puzzle steps or goals. */
export const ABBREVIATION_PUZZLE_LEMMAS = new Set([
  "hev",
  "hgv",
  "ev",
  "phev",
  "phevler",
  "bevx",
  "suv",
  "mpg",
  "gps",
  "pdf",
  "lcd",
  "dvd",
  "usb",
  "css",
  "html",
  "http",
  "https",
  "cpu",
  "gpu",
  "ram",
  "rom",
  "bios",
  "wifi",
  "lte",
  "gsm",
  "sdk",
  "api",
  "ide",
  "ldap",
  "dhcp",
  "tcp",
  "udp",
  "dns",
  "url",
  "uri",
  "npm",
  "cgi",
  "xml",
  "json",
  "yaml",
  "cdp",
  "cfc",
  "cgs",
  "cis",
  "crt",
  "bdsm",
  "lgbt",
  "tnt",
  "lol",
  "kb",
  "mb",
  "mm",
  "pc",
  "ph",
  "sr",
  "ss",
  "st",
  "lp",
  "cd",
  "tv",
  "vtvl",
  "vthl",
  "hbd",
]);

export function isAbbreviationLemma(lemma: string): boolean {
  if (!/^[a-z]+$/.test(lemma)) return true;
  if (lemma.length <= 2) return true;
  if (ABBREVIATION_PUZZLE_LEMMAS.has(lemma)) return true;

  const vowelCount = (lemma.match(/[aeiou]/g) ?? []).length;
  if (vowelCount === 0) return true;

  return false;
}

export function isNumberPuzzleLemma(lemma: string): boolean {
  return NUMBER_PUZZLE_LEMMAS.has(lemma);
}

export function isMorphologyOnlyStep(from: string, to: string): boolean {
  if (from === to) return true;
  if (singularizeCandidates(from).includes(to) || singularizeCandidates(to).includes(from)) {
    return true;
  }
  if (generatePlurals(from).includes(to) || generatePlurals(to).includes(from)) {
    return true;
  }
  return false;
}

/** Reject paths that rely on counting up or redundant singular/plural hops. */
export function isAcceptablePuzzlePath(path: string[]): boolean {
  if (path.length < 2) return true;

  if (isNumberPuzzleLemma(path[0]!) || isNumberPuzzleLemma(path[path.length - 1]!)) {
    return false;
  }

  if (isAbbreviationLemma(path[0]!) || isAbbreviationLemma(path[path.length - 1]!)) {
    return false;
  }

  let numberWordCount = 0;
  for (const lemma of path) {
    if (isNumberPuzzleLemma(lemma)) numberWordCount++;
    if (isAbbreviationLemma(lemma)) return false;
  }
  if (numberWordCount >= 2) return false;

  for (let index = 1; index < path.length; index++) {
    const prev = path[index - 1]!;
    const next = path[index]!;
    if (isMorphologyOnlyStep(prev, next)) return false;
  }

  return true;
}

export function difficultyFromHops(
  hops: number,
  bounds: PuzzleHopBounds = STANDARD_PUZZLE_BOUNDS
): Difficulty {
  if (hops <= bounds.minHops) return "easy";
  if (hops <= bounds.minHops + 1) return "medium";
  return "hard";
}

export function isValidPuzzleHops(
  hops: number,
  bounds: PuzzleHopBounds = STANDARD_PUZZLE_BOUNDS
): boolean {
  return hops >= bounds.minHops && hops <= bounds.maxHops;
}

export function matchesDifficulty(
  hops: number,
  difficulty?: Difficulty,
  bounds: PuzzleHopBounds = STANDARD_PUZZLE_BOUNDS
): boolean {
  if (!difficulty) return true;
  return difficultyFromHops(hops, bounds) === difficulty;
}

export function isEligiblePuzzleLemma(lemma: string, degree: number): boolean {
  if (degree < MIN_WORD_DEGREE || degree > MAX_WORD_DEGREE) return false;
  if (lemma.length < MIN_PUZZLE_ENDPOINT_LENGTH || lemma.length > MAX_LEMMA_LENGTH) return false;
  if (!/^[a-z]+$/.test(lemma)) return false;
  if (BLOCKED_PUZZLE_LEMMAS.has(lemma)) return false;
  if (isNumberPuzzleLemma(lemma)) return false;
  if (isAbbreviationLemma(lemma)) return false;
  return true;
}

/** Deterministic daily target hop count from the date seed stream. */
export function pickDailyTargetHops(rng: () => number, bounds: PuzzleHopBounds): number {
  const span = bounds.maxHops - bounds.minHops + 1;
  return bounds.minHops + Math.floor(rng() * span);
}

export function pickRandomTargetHops(
  rng: () => number,
  difficulty?: Difficulty,
  bounds: PuzzleHopBounds = STANDARD_PUZZLE_BOUNDS
): number {
  if (difficulty === "easy") return bounds.minHops;
  if (difficulty === "medium") return bounds.minHops + 1;
  if (difficulty === "hard") {
    return rng() < 0.5 ? bounds.maxHops - 1 : bounds.maxHops;
  }
  return pickDailyTargetHops(rng, bounds);
}

export function hopRangeLabel(bounds: PuzzleHopBounds = STANDARD_PUZZLE_BOUNDS): string {
  return `${bounds.minNodes}–${bounds.maxNodes} nodes`;
}

/** Stable unordered pair key for deduplication. */
export function canonicalPairKey(start: string, end: string): string {
  return start < end ? `${start}|${end}` : `${end}|${start}`;
}

/** Deterministic id for a generated start/end pair. */
export function puzzleIdFromPair(start: string, end: string): string {
  const key = canonicalPairKey(start, end);
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return `gen-${hash.toString(36)}`;
}
