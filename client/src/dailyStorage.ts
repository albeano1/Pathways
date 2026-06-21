import { clearGameState, purgeStaleGameState } from "./gamePersistence";
import { clearPuzzleCache, purgeStalePuzzleCache } from "./puzzleCache";

/** Long-lived stats — never cleared when the daily puzzle rotates. */
export const PRESERVED_LOCAL_STORAGE_KEYS = [
  "connections-solve-stats",
  "pathways-win-streak",
] as const;

/** In-progress game state only — safe to clear on a new daily puzzle. */
export const DAILY_SESSION_STORAGE_KEYS = [
  "connections-game-v1",
  "pathways.dailyPuzzle.v2",
  "pathways.dailyPuzzle",
] as const;

/** Drop stale puzzle cache and saved game for a prior calendar day. */
export function purgeStaleDailySession(dateKey?: string): void {
  purgeStalePuzzleCache(dateKey);
  purgeStaleGameState(dateKey);
}

/** Clear in-progress game + puzzle cache without touching solve averages or streak. */
export function clearDailySession(): void {
  clearGameState();
  clearPuzzleCache();
}
