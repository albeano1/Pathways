import {
  difficultyFromHops,
  isValidPuzzleHops,
  matchesDifficulty,
  MIN_WORD_DEGREE,
  puzzleIdFromPair,
} from "../../shared/puzzleRules.js";
import { hashString, mulberry32 } from "../../shared/dailyPuzzle.js";
import type { Difficulty, Puzzle } from "../../shared/types.js";
import type { GraphService } from "./graph.js";

export interface GeneratePuzzleOptions {
  difficulty?: Difficulty;
  excludeIds?: Iterable<string>;
  maxAttempts?: number;
}

const DEFAULT_MAX_ATTEMPTS = 100;
const DAILY_MAX_ATTEMPTS = 500;

export class PuzzleGenerator {
  constructor(private readonly graph: GraphService) {}

  generate(options: GeneratePuzzleOptions = {}): Omit<Puzzle, "puzzleDate" | "nextPuzzleAt"> {
    const exclude = new Set(options.excludeIds ?? []);
    const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const pair = this.graph.getRandomLemmaPair(MIN_WORD_DEGREE);
      if (!pair) break;

      const puzzle = this.buildPuzzleFromPair(pair[0], pair[1], options.difficulty);
      if (!puzzle) continue;
      if (exclude.has(puzzle.id)) continue;
      return puzzle;
    }

    throw new Error(
      options.difficulty
        ? `Could not generate a ${options.difficulty} puzzle. Try again.`
        : "Could not generate a puzzle. Try again."
    );
  }

  generateDaily(puzzleDate: string, nextPuzzleAt: string): Puzzle {
    const rng = mulberry32(hashString(puzzleDate));
    const count = this.graph.getEligibleLemmaCount(MIN_WORD_DEGREE);
    if (count < 2) {
      throw new Error("Not enough words in graph for a daily puzzle.");
    }

    for (let attempt = 0; attempt < DAILY_MAX_ATTEMPTS; attempt++) {
      const startOffset = Math.floor(rng() * count);
      let endOffset = Math.floor(rng() * (count - 1));
      if (endOffset >= startOffset) endOffset += 1;

      const start = this.graph.getEligibleLemmaAt(MIN_WORD_DEGREE, startOffset);
      const end = this.graph.getEligibleLemmaAt(MIN_WORD_DEGREE, endOffset);
      if (!start || !end || start === end) continue;

      const puzzle = this.buildPuzzleFromPair(start, end);
      if (!puzzle) continue;

      return { ...puzzle, puzzleDate, nextPuzzleAt };
    }

    throw new Error(`Could not generate daily puzzle for ${puzzleDate}.`);
  }

  private buildPuzzleFromPair(
    start: string,
    end: string,
    difficulty?: Difficulty
  ): Omit<Puzzle, "puzzleDate" | "nextPuzzleAt"> | null {
    const samplePath = this.graph.shortestPath(start, end);
    if (!samplePath) return null;

    const optimalHops = samplePath.length - 1;
    if (!isValidPuzzleHops(optimalHops)) return null;
    if (!matchesDifficulty(optimalHops, difficulty)) return null;

    return {
      id: puzzleIdFromPair(start, end),
      start,
      end,
      optimalHops,
      difficulty: difficultyFromHops(optimalHops),
      samplePath,
    };
  }
}
