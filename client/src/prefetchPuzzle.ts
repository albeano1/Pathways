import { clampPuzzleDateKey, getPuzzleDateKey } from "../../shared/dailyPuzzle";
import type { Puzzle } from "../../shared/types";
import { getEarlyPuzzlePrefetch, writeSessionBootPuzzle } from "./earlyPuzzleBoot";
import { writePuzzleCache } from "./puzzleCache";
import { resolveDailyPuzzle } from "./loadPuzzle";

let inflight: { dateKey: string; promise: Promise<Puzzle> } | null = null;

function isValidDailyPuzzle(puzzle: Puzzle, todayKey: string): boolean {
  return (
    puzzle.puzzleDate === todayKey &&
    puzzle.id.startsWith("gen-") &&
    Boolean(puzzle.start) &&
    Boolean(puzzle.end)
  );
}

function storeResolvedPuzzle(puzzle: Puzzle): Puzzle {
  writeSessionBootPuzzle(puzzle);
  writePuzzleCache(puzzle);
  return puzzle;
}

/** Start loading today's puzzle as early as possible (shared with useGame). */
export function prefetchDailyPuzzle(dateKey = getPuzzleDateKey()): Promise<Puzzle> {
  const todayKey = clampPuzzleDateKey(dateKey);
  if (inflight?.dateKey === todayKey) return inflight.promise;

  const early = getEarlyPuzzlePrefetch();
  const source = early
    ? early.then((puzzle) => {
        if (!isValidDailyPuzzle(puzzle, todayKey)) {
          throw new Error("Early prefetch puzzle was invalid.");
        }
        return puzzle;
      })
    : resolveDailyPuzzle(todayKey);

  const promise = source.then(storeResolvedPuzzle).catch((error) => {
    if (inflight?.promise === promise) inflight = null;
    if (early) return resolveDailyPuzzle(todayKey).then(storeResolvedPuzzle);
    throw error;
  });

  inflight = { dateKey: todayKey, promise };
  return promise;
}
