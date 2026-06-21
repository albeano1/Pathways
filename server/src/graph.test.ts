import { beforeAll, describe, expect, it } from "vitest";
import { getDbPath } from "./bootstrapGraphDb.js";
import { GraphService } from "./graph.js";
import { createBranchAnchorTestGraph, createPuzzleTestGraph } from "./testGraph.js";

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

  it("buildStepLookups matches analyzeStep for valid neighbors", () => {
    graph.warmEndDistances("india");
    const path = ["alpha"];
    const lookups = graph.buildStepLookups("india", path);
    const direct = graph.analyzeStep("alpha", "bravo", "india", path);
    expect(direct.valid).toBe(true);
    expect(lookups.bravo).toEqual(direct);
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

describe("GraphService path connection search", () => {
  const graph = createBranchAnchorTestGraph();

  it("extends from the branch node when it is first matching path word", () => {
    graph.warmEndDistances("goal");
    const explorePath = ["sergeant", "sentence", "line", "poetry", "cadet"];
    const result = graph.analyzeStep("poetry", "goal", "goal", explorePath);
    expect(result.valid).toBe(true);
    expect(result.connectedFrom).toBe("poetry");
    expect(result.connectFromIndex).toBe(3);
  });

  it("connects from any explored path node, not only the active tip", () => {
    graph.warmEndDistances("goal");
    const explorePath = ["sergeant", "sentence", "line", "poetry", "cadet"];
    const result = graph.analyzeStep("poetry", "target", "goal", explorePath);
    expect(result.valid).toBe(true);
    expect(result.connectedFrom).toBe("cadet");
    expect(result.connectFromIndex).toBe(4);
  });

  it("prefers earlier path nodes when several could connect", () => {
    graph.warmEndDistances("goal");
    const explorePath = ["sergeant", "sentence", "line"];
    const result = graph.analyzeStep("line", "army", "goal", explorePath);
    expect(result.valid).toBe(true);
    expect(result.connectedFrom).toBe("sergeant");
    expect(result.connectFromIndex).toBe(0);
  });
});
