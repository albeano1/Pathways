import type { Puzzle } from "../../shared/types";
import { getPuzzleDateKey } from "../../shared/dailyPuzzle";
import { fetchPuzzle } from "./api/client";
import { readPuzzleCache, writePuzzleCache } from "./puzzleCache";

const STATIC_PUZZLE_URL = "/daily-puzzle.json";

async function fetchStaticDailyPuzzle(dateKey: string): Promise<Puzzle | null> {
  try {
    const response = await fetch(STATIC_PUZZLE_URL, { cache: "force-cache" });
    if (!response.ok) return null;

    const puzzle = (await response.json()) as Puzzle;
    if (puzzle.puzzleDate !== dateKey) return null;
    if (!puzzle.id || !puzzle.start || !puzzle.end) return null;

    return puzzle;
  } catch {
    return null;
  }
}

/** Resolve today's puzzle from cache, static bundle, then API (slowest). */
export async function resolveDailyPuzzle(dateKey = getPuzzleDateKey()): Promise<Puzzle> {
  const cached = readPuzzleCache(dateKey);
  if (cached) return cached;

  const fromStatic = await fetchStaticDailyPuzzle(dateKey);
  if (fromStatic) {
    writePuzzleCache(fromStatic);
    return fromStatic;
  }

  const fromApi = await fetchPuzzle();
  writePuzzleCache(fromApi);
  return fromApi;
}
