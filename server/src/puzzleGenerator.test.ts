import { describe, expect, it } from "vitest";
import { PuzzleGenerator } from "./puzzleGenerator.js";
import { createPuzzleTestGraph } from "./testGraph.js";

describe("PuzzleGenerator", () => {
  it("generates solvable puzzles within hop bounds", () => {
    const graph = createPuzzleTestGraph();
    const generator = new PuzzleGenerator(graph);

    for (let i = 0; i < 20; i++) {
      const puzzle = generator.generate({ maxAttempts: 200 });
      expect(puzzle.optimalHops).toBeGreaterThanOrEqual(3);
      expect(puzzle.optimalHops).toBeLessThanOrEqual(6);
      expect(graph.isEligiblePuzzleEndpoint(puzzle.start)).toBe(true);
      expect(graph.isEligiblePuzzleEndpoint(puzzle.end)).toBe(true);
      expect(graph.shortestPath(puzzle.start, puzzle.end)?.length).toBe(
        puzzle.optimalHops + 1
      );
    }
  });

  it("generates the same daily puzzle for a date", () => {
    const graph = createPuzzleTestGraph();
    const generator = new PuzzleGenerator(graph);
    const nextAt = "2026-06-19T07:00:00.000Z";
    const first = generator.generateDaily("2026-06-18", nextAt);
    const second = generator.generateDaily("2026-06-18", nextAt);
    expect(second).toEqual(first);
    expect(first.puzzleDate).toBe("2026-06-18");
    expect(first.nextPuzzleAt).toBe(nextAt);
  });

  it("targets a hop count inside puzzle bounds for daily puzzles", () => {
    const graph = createPuzzleTestGraph();
    const generator = new PuzzleGenerator(graph);
    const puzzle = generator.generateDaily("2026-03-04", "2026-03-05T07:00:00.000Z");
    expect(puzzle.optimalHops).toBeGreaterThanOrEqual(3);
    expect(puzzle.optimalHops).toBeLessThanOrEqual(6);
  });

  it("finds endpoints at an exact hop distance on the test graph", () => {
    const graph = createPuzzleTestGraph();
    expect(graph.getReachableLemmasAtHopDistance("alpha", 3)).toContain("delta");
    expect(graph.getReachableLemmasAtHopDistance("alpha", 6)).toContain("golf");
  });
});
