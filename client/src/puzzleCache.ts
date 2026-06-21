import type { Puzzle } from "../../shared/types";
import { getPuzzleDateKey } from "../../shared/dailyPuzzle";

const CACHE_KEY = "pathways.dailyPuzzle.v2";

interface PuzzleCacheEntry {
  puzzleDate: string;
  puzzle: Puzzle;
}

export function readPuzzleCache(dateKey = getPuzzleDateKey()): Puzzle | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const entry = JSON.parse(raw) as PuzzleCacheEntry;
    if (entry.puzzleDate !== dateKey || entry.puzzle?.puzzleDate !== dateKey) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    if (!entry.puzzle?.id?.startsWith("gen-")) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    if (!entry.puzzle?.id || !entry.puzzle.start || !entry.puzzle.end) return null;

    return entry.puzzle;
  } catch {
    return null;
  }
}

export function purgeStalePuzzleCache(dateKey = getPuzzleDateKey()): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;

    const entry = JSON.parse(raw) as PuzzleCacheEntry;
    if (entry.puzzleDate !== dateKey || entry.puzzle?.puzzleDate !== dateKey) {
      localStorage.removeItem(CACHE_KEY);
    }
  } catch {
    localStorage.removeItem(CACHE_KEY);
  }

  // Drop entries from the previous cache key format.
  try {
    localStorage.removeItem("pathways.dailyPuzzle");
  } catch {
    // Ignore storage errors.
  }
}

export function clearPuzzleCache(): void {
  // Only clears today's puzzle cache — not cross-day solve averages.
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem("pathways.dailyPuzzle");
  } catch {
    // Ignore storage errors.
  }
}

export function writePuzzleCache(puzzle: Puzzle): void {
  try {
    const entry: PuzzleCacheEntry = {
      puzzleDate: puzzle.puzzleDate,
      puzzle,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Ignore quota / private mode errors.
  }
}
