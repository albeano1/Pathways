import type { Difficulty } from "./types.js";

/** Shortest-path hop count bounds for a valid puzzle pair. */
export const MIN_PUZZLE_HOPS = 3;
export const MAX_PUZZLE_HOPS = 6;

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

export function difficultyFromHops(hops: number): Difficulty {
  if (hops <= 3) return "easy";
  if (hops <= 4) return "medium";
  return "hard";
}

export function isValidPuzzleHops(hops: number): boolean {
  return hops >= MIN_PUZZLE_HOPS && hops <= MAX_PUZZLE_HOPS;
}

export function matchesDifficulty(hops: number, difficulty?: Difficulty): boolean {
  if (!difficulty) return true;
  return difficultyFromHops(hops) === difficulty;
}

export function isEligiblePuzzleLemma(lemma: string, degree: number): boolean {
  if (degree < MIN_WORD_DEGREE || degree > MAX_WORD_DEGREE) return false;
  if (lemma.length < MIN_LEMMA_LENGTH || lemma.length > MAX_LEMMA_LENGTH) return false;
  if (!/^[a-z]+$/.test(lemma)) return false;
  if (BLOCKED_PUZZLE_LEMMAS.has(lemma)) return false;
  return true;
}

/** Deterministic daily target hop count from the date seed stream. */
export function pickDailyTargetHops(rng: () => number): number {
  const span = MAX_PUZZLE_HOPS - MIN_PUZZLE_HOPS + 1;
  return MIN_PUZZLE_HOPS + Math.floor(rng() * span);
}

export function pickRandomTargetHops(rng: () => number, difficulty?: Difficulty): number {
  if (difficulty === "easy") return 3;
  if (difficulty === "medium") return 4;
  if (difficulty === "hard") return rng() < 0.5 ? 5 : 6;
  return pickDailyTargetHops(rng);
}

export function hopRangeLabel(): string {
  return `${MIN_PUZZLE_HOPS}–${MAX_PUZZLE_HOPS}`;
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
