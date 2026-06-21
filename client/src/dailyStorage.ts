import { clearGameState, purgeStaleGameState } from "./gamePersistence";
import { clearPuzzleCache, purgeStalePuzzleCache } from "./puzzleCache";

export {
  DAILY_SESSION_STORAGE_KEYS,
  PRESERVED_LOCAL_STORAGE_KEYS,
} from "../../shared/dailyStorageKeys";

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
