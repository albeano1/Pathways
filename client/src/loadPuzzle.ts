import type { Puzzle } from "../../shared/types";
import { clampPuzzleDateKey, getPuzzleDateKey } from "../../shared/dailyPuzzle";
import { fetchPuzzle } from "./api/client";
import {
  clearPuzzleCache,
  purgeStalePuzzleCache,
  readPuzzleCache,
  writePuzzleCache,
} from "./puzzleCache";
import { writeSessionBootPuzzle } from "./earlyPuzzleBoot";

function assertDailyPuzzle(puzzle: Puzzle, dateKey: string): Puzzle {
  if (puzzle.puzzleDate !== dateKey) {
    throw new Error(`Expected puzzle for ${dateKey}, got ${puzzle.puzzleDate}.`);
  }
  if (!puzzle.id.startsWith("gen-")) {
    throw new Error("Received a custom puzzle instead of the daily puzzle.");
  }
  return puzzle;
}

/** Read today's puzzle from the precomputed static file (CDN, no cold function). */
async function fetchStaticDailyPuzzle(dateKey: string): Promise<Puzzle> {
  const response = await fetch(`/daily/${dateKey}.json`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Static puzzle unavailable for ${dateKey}`);
  return assertDailyPuzzle((await response.json()) as Puzzle, dateKey);
}

/**
 * Resolve today's puzzle from the API using the client's Pacific calendar date.
 * Avoids the baked daily-puzzle.json embed, which reflects deploy time and can
 * be a day ahead of the live daily before midnight Pacific.
 */
export async function resolveDailyPuzzle(dateKey = getPuzzleDateKey()): Promise<Puzzle> {
  const todayKey = clampPuzzleDateKey(dateKey);
  purgeStalePuzzleCache(todayKey);

  // Prefer the precomputed static file; only wake the serverless API if it is missing.
  try {
    const fromStatic = await fetchStaticDailyPuzzle(todayKey);
    writePuzzleCache(fromStatic);
    writeSessionBootPuzzle(fromStatic);
    return fromStatic;
  } catch {
    // Fall through to the API.
  }

  try {
    const fromApi = assertDailyPuzzle(await fetchPuzzle({ date: todayKey }), todayKey);
    writePuzzleCache(fromApi);
    writeSessionBootPuzzle(fromApi);
    return fromApi;
  } catch (apiError) {
    const cached = readPuzzleCache(todayKey);
    if (cached) return cached;

    clearPuzzleCache();
    if (apiError instanceof Error) throw apiError;
    throw new Error("Could not load today's puzzle.");
  }
}
