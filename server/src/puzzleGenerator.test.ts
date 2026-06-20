import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { GraphService } from "./graph.js";
import { PuzzleGenerator } from "./puzzleGenerator.js";

function createMiniGraph(): GraphService {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE words (id INTEGER PRIMARY KEY, lemma TEXT UNIQUE NOT NULL, label TEXT NOT NULL);
    CREATE TABLE edges (from_id INTEGER NOT NULL, to_id INTEGER NOT NULL, relation TEXT NOT NULL, weight REAL NOT NULL);
  `);

  const insertWord = db.prepare("INSERT INTO words (lemma, label) VALUES (?, ?)");
  for (const word of ["apple", "red", "color", "black", "dark", "fruit"]) {
    insertWord.run(word, word);
  }

  const insertEdge = db.prepare(
    "INSERT INTO edges (from_id, to_id, relation, weight) VALUES (?, ?, ?, ?)"
  );
  const idFor = db.prepare("SELECT id FROM words WHERE lemma = ?").pluck();
  const pairs: Array<[string, string]> = [
    ["apple", "red"],
    ["apple", "fruit"],
    ["red", "color"],
    ["color", "black"],
    ["black", "dark"],
    ["fruit", "red"],
  ];

  for (const [from, to] of pairs) {
    const fromId = idFor.get(from) as number;
    const toId = idFor.get(to) as number;
    insertEdge.run(fromId, toId, "RelatedTo", 2);
    insertEdge.run(toId, fromId, "RelatedTo", 2);
  }

  return GraphService.fromDatabase(db);
}

describe("PuzzleGenerator", () => {
  it("generates solvable puzzles within hop bounds", () => {
    const graph = createMiniGraph();
    const generator = new PuzzleGenerator(graph);

    for (let i = 0; i < 20; i++) {
      const puzzle = generator.generate({ maxAttempts: 200 });
      expect(puzzle.optimalHops).toBeGreaterThanOrEqual(3);
      expect(puzzle.optimalHops).toBeLessThanOrEqual(6);
      expect(graph.shortestPath(puzzle.start, puzzle.end)?.length).toBe(
        puzzle.optimalHops + 1
      );
    }
  });

  it("generates the same daily puzzle for a date", () => {
    const graph = createMiniGraph();
    const generator = new PuzzleGenerator(graph);
    const nextAt = "2026-06-19T07:00:00.000Z";
    const first = generator.generateDaily("2026-06-18", nextAt);
    const second = generator.generateDaily("2026-06-18", nextAt);
    expect(second).toEqual(first);
    expect(first.puzzleDate).toBe("2026-06-18");
    expect(first.nextPuzzleAt).toBe(nextAt);
  });
});
