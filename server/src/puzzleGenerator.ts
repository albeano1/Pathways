import {
  DAILY_PUZZLE_MAX_ATTEMPTS,
  difficultyFromHops,
  isAcceptablePuzzlePath,
  isValidPuzzleHops,
  matchesDifficulty,
  pickDailyTargetHops,
  pickRandomTargetHops,
  puzzleHopBoundsForDate,
  puzzleIdFromPair,
  RANDOM_PUZZLE_MAX_ATTEMPTS,
  STANDARD_PUZZLE_BOUNDS,
  type PuzzleHopBounds,
} from "../../shared/puzzleRules.js";
import { hashString, mulberry32 } from "../../shared/dailyPuzzle.js";
import type { Difficulty, Puzzle } from "../../shared/types.js";
import { lemmaHasDefinition, lemmaIsGeneralAudienceEndpoint } from "./dictionary.js";
import type { GraphService } from "./graph.js";

export interface GeneratePuzzleOptions {
  difficulty?: Difficulty;
  excludeIds?: Iterable<string>;
  maxAttempts?: number;
}

export type PuzzleDefinitionCheck = (lemma: string) => Promise<boolean>;

export class PuzzleGenerator {
  constructor(
    private readonly graph: GraphService,
    private readonly hasDefinition: PuzzleDefinitionCheck = lemmaHasDefinition,
    private readonly isGeneralAudienceEndpoint: PuzzleDefinitionCheck = lemmaIsGeneralAudienceEndpoint
  ) {}

  async generate(
    options: GeneratePuzzleOptions = {}
  ): Promise<Omit<Puzzle, "puzzleDate" | "nextPuzzleAt">> {
    const exclude = new Set(options.excludeIds ?? []);
    const maxAttempts = options.maxAttempts ?? RANDOM_PUZZLE_MAX_ATTEMPTS;
    const rng = mulberry32(Date.now() >>> 0);

    return this.generateFromRng(rng, {
      ...options,
      exclude,
      maxAttempts,
      bounds: STANDARD_PUZZLE_BOUNDS,
    });
  }

  async generateDaily(puzzleDate: string, nextPuzzleAt: string): Promise<Puzzle> {
    const bounds = puzzleHopBoundsForDate(puzzleDate);
    const rng = mulberry32(hashString(puzzleDate));
    const targetHops = pickDailyTargetHops(rng, bounds);
    const puzzle = await this.generateFromRng(rng, {
      maxAttempts: DAILY_PUZZLE_MAX_ATTEMPTS,
      targetHops,
      bounds,
    });

    return { ...puzzle, puzzleDate, nextPuzzleAt };
  }

  private async generateFromRng(
    rng: () => number,
    options: {
      difficulty?: Difficulty;
      exclude?: Set<string>;
      maxAttempts?: number;
      targetHops?: number;
      bounds?: PuzzleHopBounds;
    }
  ): Promise<Omit<Puzzle, "puzzleDate" | "nextPuzzleAt">> {
    const exclude = options.exclude ?? new Set<string>();
    const maxAttempts = options.maxAttempts ?? RANDOM_PUZZLE_MAX_ATTEMPTS;
    const bounds = options.bounds ?? STANDARD_PUZZLE_BOUNDS;
    const preferredHops =
      options.targetHops ?? pickRandomTargetHops(rng, options.difficulty, bounds);
    const startCount = this.graph.getEligibleLemmaCount();

    if (startCount === 0) {
      throw new Error("Not enough eligible words in graph for puzzle generation.");
    }

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const startOffset = Math.floor(rng() * startCount);
      const start = this.graph.getEligibleLemmaAt(startOffset);
      if (!start || !this.graph.isEligiblePuzzleEndpoint(start)) continue;

      const hopCandidates = this.hopCandidatesForAttempt(preferredHops, attempt, bounds);
      for (const hops of hopCandidates) {
        const ends = this.graph.getReachableLemmasAtHopDistance(start, hops);
        if (ends.length === 0) continue;

        const end = ends[Math.floor(rng() * ends.length)]!;
        const puzzle = await this.buildPuzzleFromPair(start, end, options.difficulty, bounds);
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

  private hopCandidatesForAttempt(
    preferredHops: number,
    attempt: number,
    bounds: PuzzleHopBounds
  ): number[] {
    if (attempt === 0) {
      return [preferredHops];
    }

    const candidates = new Set<number>([preferredHops]);
    for (let hops = bounds.minHops; hops <= bounds.maxHops; hops++) {
      candidates.add(hops);
    }

    return [...candidates].sort((left, right) => {
      const leftDistance = Math.abs(left - preferredHops);
      const rightDistance = Math.abs(right - preferredHops);
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      return left - right;
    });
  }

  private async buildPuzzleFromPair(
    start: string,
    end: string,
    difficulty?: Difficulty,
    bounds: PuzzleHopBounds = STANDARD_PUZZLE_BOUNDS
  ): Promise<Omit<Puzzle, "puzzleDate" | "nextPuzzleAt"> | null> {
    if (start === end) return null;
    if (!this.graph.isEligiblePuzzleEndpoint(start) || !this.graph.isEligiblePuzzleEndpoint(end)) {
      return null;
    }

    const [startDefined, endDefined, startGeneral, endGeneral] = await Promise.all([
      this.hasDefinition(start),
      this.hasDefinition(end),
      this.isGeneralAudienceEndpoint(start),
      this.isGeneralAudienceEndpoint(end),
    ]);
    if (!startDefined || !endDefined || !startGeneral || !endGeneral) return null;

    const samplePath = this.graph.shortestPath(start, end);
    if (!samplePath) return null;
    if (!isAcceptablePuzzlePath(samplePath)) return null;

    const optimalHops = samplePath.length - 1;
    if (!isValidPuzzleHops(optimalHops, bounds)) return null;
    if (!matchesDifficulty(optimalHops, difficulty, bounds)) return null;

    return {
      id: puzzleIdFromPair(start, end),
      start,
      end,
      optimalHops,
      difficulty: difficultyFromHops(optimalHops, bounds),
      samplePath,
    };
  }
}
