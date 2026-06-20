import {
  DAILY_PUZZLE_MAX_ATTEMPTS,
  difficultyFromHops,
  isValidPuzzleHops,
  matchesDifficulty,
  MAX_PUZZLE_HOPS,
  MIN_PUZZLE_HOPS,
  pickDailyTargetHops,
  pickRandomTargetHops,
  puzzleIdFromPair,
  RANDOM_PUZZLE_MAX_ATTEMPTS,
} from "../../shared/puzzleRules.js";
import { hashString, mulberry32 } from "../../shared/dailyPuzzle.js";
import type { Difficulty, Puzzle } from "../../shared/types.js";
import type { GraphService } from "./graph.js";

export interface GeneratePuzzleOptions {
  difficulty?: Difficulty;
  excludeIds?: Iterable<string>;
  maxAttempts?: number;
}

export class PuzzleGenerator {
  constructor(private readonly graph: GraphService) {}

  generate(options: GeneratePuzzleOptions = {}): Omit<Puzzle, "puzzleDate" | "nextPuzzleAt"> {
    const exclude = new Set(options.excludeIds ?? []);
    const maxAttempts = options.maxAttempts ?? RANDOM_PUZZLE_MAX_ATTEMPTS;
    const rng = mulberry32(Date.now() >>> 0);

    return this.generateFromRng(rng, {
      ...options,
      exclude,
      maxAttempts,
    });
  }

  generateDaily(puzzleDate: string, nextPuzzleAt: string): Puzzle {
    const rng = mulberry32(hashString(puzzleDate));
    const targetHops = pickDailyTargetHops(rng);
    const puzzle = this.generateFromRng(rng, {
      maxAttempts: DAILY_PUZZLE_MAX_ATTEMPTS,
      targetHops,
    });

    return { ...puzzle, puzzleDate, nextPuzzleAt };
  }

  private generateFromRng(
    rng: () => number,
    options: {
      difficulty?: Difficulty;
      exclude?: Set<string>;
      maxAttempts?: number;
      targetHops?: number;
    }
  ): Omit<Puzzle, "puzzleDate" | "nextPuzzleAt"> {
    const exclude = options.exclude ?? new Set<string>();
    const maxAttempts = options.maxAttempts ?? RANDOM_PUZZLE_MAX_ATTEMPTS;
    const preferredHops =
      options.targetHops ?? pickRandomTargetHops(rng, options.difficulty);
    const startCount = this.graph.getEligibleLemmaCount();

    if (startCount === 0) {
      throw new Error("Not enough eligible words in graph for puzzle generation.");
    }

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const startOffset = Math.floor(rng() * startCount);
      const start = this.graph.getEligibleLemmaAt(startOffset);
      if (!start) continue;

      const hopCandidates = this.hopCandidatesForAttempt(preferredHops, attempt);
      for (const hops of hopCandidates) {
        const ends = this.graph.getReachableLemmasAtHopDistance(start, hops);
        if (ends.length === 0) continue;

        const end = ends[Math.floor(rng() * ends.length)]!;
        const puzzle = this.buildPuzzleFromPair(start, end, options.difficulty);
        if (!puzzle) continue;
        if (exclude.has(puzzle.id)) continue;
        return puzzle;
      }
    }

    throw new Error(
      options.difficulty
        ? `Could not generate a ${options.difficulty} puzzle. Try again.`
        : "Could not generate a puzzle. Try again."
    );
  }

  private hopCandidatesForAttempt(preferredHops: number, attempt: number): number[] {
    if (attempt === 0) {
      return [preferredHops];
    }

    const candidates = new Set<number>([preferredHops]);
    for (let hops = MIN_PUZZLE_HOPS; hops <= MAX_PUZZLE_HOPS; hops++) {
      candidates.add(hops);
    }

    return [...candidates].sort((left, right) => {
      const leftDistance = Math.abs(left - preferredHops);
      const rightDistance = Math.abs(right - preferredHops);
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      return left - right;
    });
  }

  private buildPuzzleFromPair(
    start: string,
    end: string,
    difficulty?: Difficulty
  ): Omit<Puzzle, "puzzleDate" | "nextPuzzleAt"> | null {
    if (start === end) return null;
    if (!this.graph.isEligiblePuzzleEndpoint(start) || !this.graph.isEligiblePuzzleEndpoint(end)) {
      return null;
    }

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
