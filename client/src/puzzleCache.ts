import type { Puzzle } from "../../shared/types";
import { getPuzzleDateKey } from "../../shared/dailyPuzzle";

const CACHE_KEY = "pathways.dailyPuzzle";

interface PuzzleCacheEntry {
  puzzleDate: string;
  puzzle: Puzzle;
}

export function readPuzzleCache(dateKey = getPuzzleDateKey()): Puzzle | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const entry = JSON.parse(raw) as PuzzleCacheEntry;
    if (entry.puzzleDate !== dateKey) return null;
    if (!entry.puzzle?.id || !entry.puzzle.start || !entry.puzzle.end) return null;

    return entry.puzzle;
  } catch {
    return null;
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
