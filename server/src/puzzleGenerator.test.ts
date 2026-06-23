import { describe, expect, it } from "vitest";
import { MAX_PUZZLE_HOPS, MIN_PUZZLE_HOPS, LEGACY_DAILY_PUZZLE_BOUNDS } from "../../shared/puzzleRules.js";
import { PuzzleGenerator } from "./puzzleGenerator.js";
import { createPuzzleTestGraph } from "./testGraph.js";

describe("PuzzleGenerator", () => {
  const hasDefinition = async () => true;

  it("generates solvable puzzles within hop bounds", async () => {
    const graph = createPuzzleTestGraph();
    const generator = new PuzzleGenerator(graph, hasDefinition);

    for (let i = 0; i < 20; i++) {
      const puzzle = await generator.generate({ maxAttempts: 200 });
      expect(puzzle.optimalHops).toBeGreaterThanOrEqual(MIN_PUZZLE_HOPS);
      expect(puzzle.optimalHops).toBeLessThanOrEqual(MAX_PUZZLE_HOPS);
      expect(graph.isEligiblePuzzleEndpoint(puzzle.start)).toBe(true);
      expect(graph.isEligiblePuzzleEndpoint(puzzle.end)).toBe(true);
      expect(graph.shortestPath(puzzle.start, puzzle.end)?.length).toBe(
        puzzle.optimalHops + 1
      );
    }
  });

  it("generates the same daily puzzle for a date", async () => {
    const graph = createPuzzleTestGraph();
    const generator = new PuzzleGenerator(graph, hasDefinition);
    const nextAt = "2026-06-19T07:00:00.000Z";
    const first = await generator.generateDaily("2026-06-18", nextAt);
    const second = await generator.generateDaily("2026-06-18", nextAt);
    expect(second).toEqual(first);
    expect(first.puzzleDate).toBe("2026-06-18");
    expect(first.nextPuzzleAt).toBe(nextAt);
  });

  it("targets a hop count inside puzzle bounds for daily puzzles", async () => {
    const graph = createPuzzleTestGraph();
    const generator = new PuzzleGenerator(graph, hasDefinition);
    const legacy = await generator.generateDaily("2026-03-04", "2026-03-05T07:00:00.000Z");
    expect(legacy.optimalHops).toBeGreaterThanOrEqual(LEGACY_DAILY_PUZZLE_BOUNDS.minHops);
    expect(legacy.optimalHops).toBeLessThanOrEqual(LEGACY_DAILY_PUZZLE_BOUNDS.maxHops);

    const longer = await generator.generateDaily("2026-06-23", "2026-06-24T07:00:00.000Z");
    expect(longer.optimalHops).toBeGreaterThanOrEqual(MIN_PUZZLE_HOPS);
    expect(longer.optimalHops).toBeLessThanOrEqual(MAX_PUZZLE_HOPS);
  });

  it("finds endpoints at an exact hop distance on the test graph", () => {
    const graph = createPuzzleTestGraph();
    expect(graph.getReachableLemmasAtHopDistance("alpha", 5)).toContain("foxtrot");
    expect(graph.getReachableLemmasAtHopDistance("alpha", 6)).toContain("golf");
    expect(graph.getReachableLemmasAtHopDistance("alpha", 7)).toContain("hotel");
  });
});
