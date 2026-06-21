import { beforeAll, describe, expect, it } from "vitest";
import { getDbPath } from "./bootstrapGraphDb.js";
import { GraphService } from "./graph.js";
import { createPuzzleTestGraph } from "./testGraph.js";

describe("GraphService distance cache", () => {
  const graph = createPuzzleTestGraph();

  it("reports hop distance from end via warmEndDistances", () => {
    graph.warmEndDistances("india");
    expect(graph.shortestPathHops("alpha", "india")).toBe(8);
    expect(graph.shortestPathHops("bravo", "india")).toBe(7);
  });

  it("analyzeStep uses cached distances for proximity", () => {
    graph.warmEndDistances("india");
    const result = graph.analyzeStep("alpha", "bravo", "india", ["alpha"]);
    expect(result.valid).toBe(true);
    expect(result.hopsToEnd).toBe(7);
    expect(result.previousHopsToEnd).toBe(8);
    expect(result.proximity).toBe("closer");
  });
});

describe("GraphService plural variants", () => {
  let graph: GraphService;

  beforeAll(() => {
    graph = new GraphService(getDbPath());
  });

  it("accepts lines when line connects from sentence", () => {
    graph.warmEndDistances("couplet");
    const result = graph.analyzeStep("sentence", "lines", "couplet", ["sergeant", "sentence"]);
    expect(result.valid).toBe(true);
    expect(result.canonicalWord).toBe("line");
    expect(result.hopsToEnd).toBe(1);
  });
});
