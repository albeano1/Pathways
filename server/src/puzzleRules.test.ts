import { describe, expect, it } from "vitest";
import {
  canonicalPairKey,
  difficultyFromHops,
  isValidPuzzleHops,
  matchesDifficulty,
  MAX_PUZZLE_HOPS,
  MIN_PUZZLE_HOPS,
  puzzleIdFromPair,
} from "../../shared/puzzleRules.js";

describe("puzzleRules", () => {
  it("defines solvable hop bounds", () => {
    expect(MIN_PUZZLE_HOPS).toBe(3);
    expect(MAX_PUZZLE_HOPS).toBe(6);
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

  it("uses stable canonical pair keys and ids", () => {
    expect(canonicalPairKey("apple", "dark")).toBe(canonicalPairKey("dark", "apple"));
    expect(puzzleIdFromPair("apple", "dark")).toBe(puzzleIdFromPair("dark", "apple"));
  });
});
