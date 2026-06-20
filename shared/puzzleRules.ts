import type { Difficulty } from "./types.js";

/** Shortest-path hop count bounds for a valid puzzle pair. */
export const MIN_PUZZLE_HOPS = 3;
export const MAX_PUZZLE_HOPS = 6;

/** Minimum graph degree for words chosen during runtime generation. */
export const MIN_WORD_DEGREE = 2;

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
