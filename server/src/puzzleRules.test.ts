import { describe, expect, it } from "vitest";
import {
  BLOCKED_PUZZLE_LEMMAS,
  canonicalPairKey,
  difficultyFromHops,
  isAbbreviationLemma,
  isAcceptablePuzzlePath,
  isEligiblePuzzleLemma,
  isMorphologyOnlyStep,
  isNumberPuzzleLemma,
  isScientificPuzzleLemma,
  isValidPuzzleHops,
  LEGACY_DAILY_PUZZLE_BOUNDS,
  matchesDifficulty,
  MAX_PUZZLE_HOPS,
  MAX_WORD_DEGREE,
  MIN_LEMMA_LENGTH,
  MIN_PUZZLE_HOPS,
  MIN_SIX_NODE_PUZZLE_DATE,
  MIN_WORD_DEGREE,
  pickDailyTargetHops,
  puzzleHopBoundsForDate,
  puzzleIdFromPair,
  STANDARD_PUZZLE_BOUNDS,
} from "../../shared/puzzleRules.js";
import { mulberry32 } from "../../shared/dailyPuzzle.js";

describe("puzzleRules", () => {
  it("defines solvable hop bounds", () => {
    expect(MIN_PUZZLE_HOPS).toBe(5);
    expect(MAX_PUZZLE_HOPS).toBe(7);
    expect(LEGACY_DAILY_PUZZLE_BOUNDS.minHops).toBe(3);
    expect(LEGACY_DAILY_PUZZLE_BOUNDS.maxHops).toBe(6);
  });

  it("keeps legacy daily bounds through the day before the six-node minimum", () => {
    expect(puzzleHopBoundsForDate("2026-06-21")).toEqual(LEGACY_DAILY_PUZZLE_BOUNDS);
    expect(puzzleHopBoundsForDate(MIN_SIX_NODE_PUZZLE_DATE)).toEqual(STANDARD_PUZZLE_BOUNDS);
  });

  it("requires well-connected, readable lemmas for endpoints", () => {
    expect(MIN_WORD_DEGREE).toBeGreaterThanOrEqual(5);
    expect(MAX_WORD_DEGREE).toBeGreaterThan(MIN_WORD_DEGREE);
    expect(MIN_LEMMA_LENGTH).toBeGreaterThanOrEqual(3);
    expect(isEligiblePuzzleLemma("apple", 10)).toBe(true);
    expect(isEligiblePuzzleLemma("apple", MIN_WORD_DEGREE - 1)).toBe(false);
    expect(isEligiblePuzzleLemma("go", 10)).toBe(false);
    expect(isEligiblePuzzleLemma("cat", 10)).toBe(false);
    expect(isEligiblePuzzleLemma("apple", MAX_WORD_DEGREE + 1)).toBe(false);
  });

  it("blocks overly abstract lemmas", () => {
    for (const lemma of BLOCKED_PUZZLE_LEMMAS) {
      expect(isEligiblePuzzleLemma(lemma, 20)).toBe(false);
    }
  });

  it("classifies difficulty from hop count", () => {
    expect(difficultyFromHops(3, LEGACY_DAILY_PUZZLE_BOUNDS)).toBe("easy");
    expect(difficultyFromHops(4, LEGACY_DAILY_PUZZLE_BOUNDS)).toBe("medium");
    expect(difficultyFromHops(5, LEGACY_DAILY_PUZZLE_BOUNDS)).toBe("hard");
    expect(difficultyFromHops(5, STANDARD_PUZZLE_BOUNDS)).toBe("easy");
    expect(difficultyFromHops(6, STANDARD_PUZZLE_BOUNDS)).toBe("medium");
    expect(difficultyFromHops(7, STANDARD_PUZZLE_BOUNDS)).toBe("hard");
  });

  it("validates hop counts", () => {
    expect(isValidPuzzleHops(2, LEGACY_DAILY_PUZZLE_BOUNDS)).toBe(false);
    expect(isValidPuzzleHops(3, LEGACY_DAILY_PUZZLE_BOUNDS)).toBe(true);
    expect(isValidPuzzleHops(6, LEGACY_DAILY_PUZZLE_BOUNDS)).toBe(true);
    expect(isValidPuzzleHops(7, LEGACY_DAILY_PUZZLE_BOUNDS)).toBe(false);
    expect(isValidPuzzleHops(4, STANDARD_PUZZLE_BOUNDS)).toBe(false);
    expect(isValidPuzzleHops(5, STANDARD_PUZZLE_BOUNDS)).toBe(true);
    expect(isValidPuzzleHops(7, STANDARD_PUZZLE_BOUNDS)).toBe(true);
    expect(isValidPuzzleHops(8, STANDARD_PUZZLE_BOUNDS)).toBe(false);
  });

  it("matches optional difficulty filter", () => {
    expect(matchesDifficulty(3, "easy", LEGACY_DAILY_PUZZLE_BOUNDS)).toBe(true);
    expect(matchesDifficulty(3, "hard", LEGACY_DAILY_PUZZLE_BOUNDS)).toBe(false);
    expect(matchesDifficulty(5)).toBe(true);
  });

  it("picks daily hop targets inside bounds", () => {
    const rng = mulberry32(12345);
    for (let i = 0; i < 20; i++) {
      const hops = pickDailyTargetHops(rng, STANDARD_PUZZLE_BOUNDS);
      expect(hops).toBeGreaterThanOrEqual(STANDARD_PUZZLE_BOUNDS.minHops);
      expect(hops).toBeLessThanOrEqual(STANDARD_PUZZLE_BOUNDS.maxHops);
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

  it("blocks abbreviations as endpoints and path steps", () => {
    expect(isAbbreviationLemma("hev")).toBe(true);
    expect(isAbbreviationLemma("hgv")).toBe(true);
    expect(isAbbreviationLemma("star")).toBe(false);
    expect(isEligiblePuzzleLemma("hev", 20)).toBe(false);
    expect(isEligiblePuzzleLemma("star", 20)).toBe(true);
    expect(
      isAcceptablePuzzlePath(["regulation", "control", "mechanism", "vehicle", "hgv", "motor"])
    ).toBe(false);
  });

  it("blocks scientific lemmas as puzzle endpoints", () => {
    expect(isScientificPuzzleLemma("intron")).toBe(true);
    expect(isScientificPuzzleLemma("polyp")).toBe(true);
    expect(isScientificPuzzleLemma("plastid")).toBe(true);
    expect(isScientificPuzzleLemma("hypothalamus")).toBe(true);
    expect(isScientificPuzzleLemma("medulla")).toBe(true);
    expect(isScientificPuzzleLemma("asthma")).toBe(true);
    expect(isScientificPuzzleLemma("pyrrolidine")).toBe(true);
    expect(isScientificPuzzleLemma("biology")).toBe(true);
    expect(isScientificPuzzleLemma("apple")).toBe(false);
    expect(isScientificPuzzleLemma("star")).toBe(false);
    expect(isEligiblePuzzleLemma("intron", 20)).toBe(false);
    expect(isEligiblePuzzleLemma("apple", 20)).toBe(true);
  });

  it("rejects morphology-only and counting paths", () => {
    expect(isMorphologyOnlyStep("numbers", "number")).toBe(true);
    expect(isAcceptablePuzzlePath(["regulation", "rule", "dependency", "colony", "thirteen", "fourteen"])).toBe(
      false
    );
    expect(isAcceptablePuzzlePath(["apple", "fruit", "tree", "forest"])).toBe(true);
  });
});
