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
