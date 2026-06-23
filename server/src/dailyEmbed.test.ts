import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isScientificPuzzleLemma } from "../../shared/puzzleRules.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DAILY_DIR = path.join(ROOT, "client/public/daily");
const EMBED_MAP_PATH = path.join(ROOT, "client/public/daily-embed.json");

interface PublicPuzzle {
  start: string;
  end: string;
  puzzleDate: string;
}

function readDailyPuzzles(): PublicPuzzle[] {
  if (!fs.existsSync(DAILY_DIR)) return [];

  return fs
    .readdirSync(DAILY_DIR)
    .filter((name) => name.endsWith(".json") && !name.endsWith(".step.json"))
    .map((name) => JSON.parse(fs.readFileSync(path.join(DAILY_DIR, name), "utf8")) as PublicPuzzle);
}

describe("committed daily embed", () => {
  it("keeps technical lemmas out of cached start and goal words", () => {
    const puzzles = readDailyPuzzles();
    expect(puzzles.length).toBeGreaterThan(0);

    for (const puzzle of puzzles) {
      expect(isScientificPuzzleLemma(puzzle.start), puzzle.puzzleDate).toBe(false);
      expect(isScientificPuzzleLemma(puzzle.end), puzzle.puzzleDate).toBe(false);
    }
  });

  it("keeps the inline embed map aligned with the technical-lemma filter", () => {
    if (!fs.existsSync(EMBED_MAP_PATH)) return;

    const embedMap = JSON.parse(fs.readFileSync(EMBED_MAP_PATH, "utf8")) as Record<
      string,
      PublicPuzzle
    >;

    for (const [dateKey, puzzle] of Object.entries(embedMap)) {
      expect(isScientificPuzzleLemma(puzzle.start), dateKey).toBe(false);
      expect(isScientificPuzzleLemma(puzzle.end), dateKey).toBe(false);
    }
  });
});
