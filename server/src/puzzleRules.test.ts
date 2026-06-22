import { describe, expect, it } from "vitest";
import {
  BLOCKED_PUZZLE_LEMMAS,
  canonicalPairKey,
  difficultyFromHops,
  isAcceptablePuzzlePath,
  isEligiblePuzzleLemma,
  isMorphologyOnlyStep,
  isNumberPuzzleLemma,
  isValidPuzzleHops,
  matchesDifficulty,
  MAX_PUZZLE_HOPS,
  MAX_WORD_DEGREE,
  MIN_LEMMA_LENGTH,
  MIN_PUZZLE_HOPS,
  MIN_WORD_DEGREE,
  pickDailyTargetHops,
  puzzleIdFromPair,
} from "../../shared/puzzleRules.js";
import { mulberry32 } from "../../shared/dailyPuzzle.js";

describe("puzzleRules", () => {
  it("defines solvable hop bounds", () => {
    expect(MIN_PUZZLE_HOPS).toBe(3);
    expect(MAX_PUZZLE_HOPS).toBe(6);
  });

  it("requires well-connected, readable lemmas for endpoints", () => {
    expect(MIN_WORD_DEGREE).toBeGreaterThanOrEqual(5);
    expect(MAX_WORD_DEGREE).toBeGreaterThan(MIN_WORD_DEGREE);
    expect(MIN_LEMMA_LENGTH).toBeGreaterThanOrEqual(3);
    expect(isEligiblePuzzleLemma("apple", 10)).toBe(true);
    expect(isEligiblePuzzleLemma("apple", MIN_WORD_DEGREE - 1)).toBe(false);
    expect(isEligiblePuzzleLemma("go", 10)).toBe(false);
    expect(isEligiblePuzzleLemma("apple", MAX_WORD_DEGREE + 1)).toBe(false);
  });

  it("blocks overly abstract lemmas", () => {
    for (const lemma of BLOCKED_PUZZLE_LEMMAS) {
      expect(isEligiblePuzzleLemma(lemma, 20)).toBe(false);
    }
  });

  it("classifies difficulty from hop count", () => {
    expect(difficultyFromHops(3)).toBe("easy");
    expect(difficultyFromHops(4)).toBe("medium");
    expect(difficultyFromHops(5)).toBe("hard");
  });

  it("validates hop counts", () => {
    expect(isValidPuzzleHops(2)).toBe(false);
    expect(isValidPuzzleHops(3)).toBe(true);
    expect(isValidPuzzleHops(6)).toBe(true);
    expect(isValidPuzzleHops(7)).toBe(false);
  });

  it("matches optional difficulty filter", () => {
    expect(matchesDifficulty(3, "easy")).toBe(true);
    expect(matchesDifficulty(3, "hard")).toBe(false);
    expect(matchesDifficulty(3)).toBe(true);
  });

  it("picks daily hop targets inside bounds", () => {
    const rng = mulberry32(12345);
    for (let i = 0; i < 20; i++) {
      const hops = pickDailyTargetHops(rng);
      expect(hops).toBeGreaterThanOrEqual(MIN_PUZZLE_HOPS);
      expect(hops).toBeLessThanOrEqual(MAX_PUZZLE_HOPS);
    }
  });

  it("uses stable canonical pair keys and ids", () => {
    expect(canonicalPairKey("apple", "dark")).toBe(canonicalPairKey("dark", "apple"));
    expect(puzzleIdFromPair("apple", "dark")).toBe(puzzleIdFromPair("dark", "apple"));
  });

  it("blocks number lemmas as endpoints", () => {
    expect(isNumberPuzzleLemma("fourteen")).toBe(true);
    expect(isEligiblePuzzleLemma("fourteen", 20)).toBe(false);
  });

  it("rejects morphology-only and counting paths", () => {
    expect(isMorphologyOnlyStep("numbers", "number")).toBe(true);
    expect(isAcceptablePuzzlePath(["regulation", "rule", "dependency", "colony", "thirteen", "fourteen"])).toBe(
      false
    );
    expect(isAcceptablePuzzlePath(["apple", "fruit", "tree", "forest"])).toBe(true);
  });
});
