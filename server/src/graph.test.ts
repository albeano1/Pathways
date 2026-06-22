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

  it("buildStepLookups keeps number distinct from numbers on the path", () => {
    graph.warmEndDistances("fourteen");
    const path = ["regulation", "rule", "numbers"];
    const lookups = graph.buildStepLookups("fourteen", path, "numbers");
    expect(lookups.number?.valid).toBe(true);
    expect(lookups.number?.canonicalWord).toBeUndefined();
  });
});

describe("GraphService path connection search", () => {
  const graph = createBranchAnchorTestGraph();

  it("returns a single connection when only one path node matches", () => {
    graph.warmEndDistances("goal");
    const explorePath = ["sergeant", "sentence", "line", "poetry", "cadet"];
    const result = graph.analyzeStep("poetry", "goal", "goal", explorePath);
    expect(result.valid).toBe(true);
    expect(result.connections).toHaveLength(1);
    expect(result.connectedFrom).toBe("poetry");
    expect(result.connectFromIndex).toBe(3);
  });

  it("returns all matching path nodes in connections", () => {
    graph.warmEndDistances("goal");
    const explorePath = ["sergeant", "sentence", "line", "poetry", "cadet"];
    const result = graph.analyzeStep("cadet", "army", "goal", explorePath);
    expect(result.valid).toBe(true);
    expect(result.connections?.length).toBeGreaterThanOrEqual(2);
    const indices = result.connections!.map((item) => item.connectFromIndex);
    expect(indices).toContain(0);
    expect(indices).toContain(4);
  });

  it("allows reconnecting an existing word when new parents match", () => {
    graph.warmEndDistances("goal");
    const explorePath = ["sergeant", "sentence", "line", "poetry", "cadet", "army"];
    const result = graph.analyzeStep("cadet", "army", "goal", explorePath);
    expect(result.valid).toBe(true);
    expect(result.connections?.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects duplicate when the word is on the path with no new connections", () => {
    graph.warmEndDistances("goal");
    const explorePath = ["sergeant"];
    const result = graph.analyzeStep("sergeant", "sergeant", "goal", explorePath);
    expect(result.valid).toBe(false);
    expect(result.failureType).toBe("duplicate");
  });
});
