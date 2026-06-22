import type { Puzzle } from "../../shared/types";

export const SESSION_BOOT_KEY = "pathways.puzzle.boot.v1";

declare global {
  interface Window {
    __pathwaysPuzzlePrefetch?: Promise<Puzzle>;
    __pathwaysPuzzleRefresh?: Promise<Puzzle | void>;
  }
}

export function readSessionBootPuzzle(todayKey: string): Puzzle | null {
  try {
    const raw = sessionStorage.getItem(SESSION_BOOT_KEY);
    if (!raw) return null;

    const entry = JSON.parse(raw) as { puzzleDate: string; puzzle: Puzzle };
    if (entry.puzzleDate !== todayKey || entry.puzzle?.puzzleDate !== todayKey) {
      sessionStorage.removeItem(SESSION_BOOT_KEY);
      return null;
    }
    if (!entry.puzzle?.id?.startsWith("gen-")) return null;
    if (!entry.puzzle.start || !entry.puzzle.end) return null;

    return entry.puzzle;
  } catch {
    return null;
  }
}

export function writeSessionBootPuzzle(puzzle: Puzzle): void {
  try {
    sessionStorage.setItem(
      SESSION_BOOT_KEY,
      JSON.stringify({ puzzleDate: puzzle.puzzleDate, puzzle })
    );
  } catch {
    // Ignore storage errors.
  }
}

export function getEarlyPuzzlePrefetch(): Promise<Puzzle> | null {
  if (typeof window === "undefined" || !window.__pathwaysPuzzlePrefetch) return null;
  return window.__pathwaysPuzzlePrefetch;
}

export function getPuzzleRefresh(): Promise<Puzzle | void> | null {
  if (typeof window === "undefined" || !window.__pathwaysPuzzleRefresh) return null;
  return window.__pathwaysPuzzleRefresh;
}

export function readEmbeddedBootPuzzle(todayKey: string): Puzzle | null {
  if (typeof document === "undefined") return null;

  const el = document.getElementById("pathways-daily-boot");
  if (!el?.textContent) return null;

  try {
    const parsed = JSON.parse(el.textContent) as Puzzle | Record<string, Puzzle>;
    // Multi-day map keyed by date, or a legacy single puzzle object.
    const puzzle =
      "puzzleDate" in parsed ? (parsed as Puzzle) : (parsed as Record<string, Puzzle>)[todayKey];
    if (!puzzle || puzzle.puzzleDate !== todayKey || !puzzle.id?.startsWith("gen-")) return null;
    if (!puzzle.start || !puzzle.end) return null;
    return puzzle;
  } catch {
    return null;
  }
}
