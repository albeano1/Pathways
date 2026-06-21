import { clampPuzzleDateKey, getPuzzleDateKey } from "../../shared/dailyPuzzle";
import type { Puzzle } from "../../shared/types";
import { purgeStaleDailySession } from "./dailyStorage";
import { getDebugPuzzleFromUrl } from "./debugPuzzle";
import { loadGameState, type PersistedGameState } from "./gamePersistence";
import { readSessionBootPuzzle, readEmbeddedBootPuzzle } from "./earlyPuzzleBoot";
import { readPuzzleCache } from "./puzzleCache";

export interface BootSnapshot {
  puzzle: Puzzle | null;
  saved: PersistedGameState | null;
}

let cachedBoot: BootSnapshot | null = null;

/** Synchronous read of cached puzzle + saved progress for instant first paint. */
export function getBootSnapshot(): BootSnapshot {
  if (cachedBoot?.puzzle) return cachedBoot;

  if (getDebugPuzzleFromUrl()) {
    cachedBoot = { puzzle: null, saved: null };
    return cachedBoot;
  }

  const todayKey = clampPuzzleDateKey(getPuzzleDateKey());
  purgeStaleDailySession(todayKey);

  const puzzle =
    readPuzzleCache(todayKey) ??
    readSessionBootPuzzle(todayKey) ??
    readEmbeddedBootPuzzle(todayKey);
  const saved = loadGameState();

  const snapshot: BootSnapshot = {
    puzzle,
    saved:
      puzzle && saved && saved.puzzle.id === puzzle.id && saved.puzzle.start === puzzle.start
        ? saved
        : null,
  };

  if (snapshot.puzzle) cachedBoot = snapshot;
  return snapshot;
}
