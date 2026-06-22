import {
  getNextPuzzleAt,
  getNextPuzzleAtForDateKey,
  getPuzzleDateKey,
} from "../../shared/dailyPuzzle.js";
import {
  difficultyFromHops,
  isAcceptablePuzzlePath,
  isValidPuzzleHops,
  puzzleIdFromPair,
} from "../../shared/puzzleRules.js";
import type { Difficulty, Puzzle } from "../../shared/types.js";
import type { GraphService } from "./graph.js";
import { PuzzleGenerator } from "./puzzleGenerator.js";

export class PuzzleService {
  private readonly generator: PuzzleGenerator;

  constructor(graph: GraphService) {
    this.generator = new PuzzleGenerator(graph);
  }

  getDaily(dateKey?: string): Puzzle {
    const puzzleDate = dateKey ?? getPuzzleDateKey();
    const nextPuzzleAt = (
      dateKey ? getNextPuzzleAtForDateKey(puzzleDate) : getNextPuzzleAt()
    ).toISOString();
    return this.generator.generateDaily(puzzleDate, nextPuzzleAt);
  }

  /** Build a puzzle from an explicit pair (debug mode). */
  fromPair(start: string, end: string, graph: GraphService): Puzzle | null {
    const samplePath = graph.shortestPath(start, end);
    if (!samplePath) return null;
    if (!isAcceptablePuzzlePath(samplePath)) return null;

    const optimalHops = samplePath.length - 1;
    if (!isValidPuzzleHops(optimalHops)) return null;

    const puzzleDate = getPuzzleDateKey();
    return {
      id: puzzleIdFromPair(start, end),
      start: graph.normalize(start),
      end: graph.normalize(end),
      optimalHops,
      difficulty: difficultyFromHops(optimalHops),
      samplePath,
      puzzleDate,
      nextPuzzleAt: getNextPuzzleAt().toISOString(),
    };
  }
}

export { difficultyFromHops, isValidPuzzleHops };
