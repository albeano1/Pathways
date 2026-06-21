import type { Puzzle } from "../../shared/types";
import { getPuzzleDateKey } from "../../shared/dailyPuzzle";
import { fetchPuzzle } from "./api/client";
import {
  clearPuzzleCache,
  purgeStalePuzzleCache,
  readPuzzleCache,
  writePuzzleCache,
} from "./puzzleCache";

function assertDailyPuzzle(puzzle: Puzzle, dateKey: string): Puzzle {
  if (puzzle.puzzleDate !== dateKey) {
    throw new Error(`Expected puzzle for ${dateKey}, got ${puzzle.puzzleDate}.`);
  }
  if (!puzzle.id.startsWith("gen-")) {
    throw new Error("Received a custom puzzle instead of the daily puzzle.");
  }
  return puzzle;
}

/**
 * Resolve today's puzzle from the API using the client's Pacific calendar date.
 * Avoids the baked daily-puzzle.json embed, which reflects deploy time and can
 * be a day ahead of the live daily before midnight Pacific.
 */
export async function resolveDailyPuzzle(dateKey = getPuzzleDateKey()): Promise<Puzzle> {
  purgeStalePuzzleCache(dateKey);

  try {
    const fromApi = assertDailyPuzzle(await fetchPuzzle({ date: dateKey }), dateKey);
    writePuzzleCache(fromApi);
    return fromApi;
  } catch (apiError) {
    const cached = readPuzzleCache(dateKey);
    if (cached) return cached;

    clearPuzzleCache();
    if (apiError instanceof Error) throw apiError;
    throw new Error("Could not load today's puzzle.");
  }
}
