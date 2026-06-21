import type {
  ConfirmedBranch,
  ConfirmedEdge,
  Puzzle,
  RejectedBranch,
  ScoreResponse,
} from "../../../shared/types";
import { getPuzzleDateKey } from "../../shared/dailyPuzzle";

const STORAGE_KEY = "connections-game-v1";

export type GameStatus = "playing" | "won";

export interface PersistedGameState {
  puzzleDate: string;
  puzzle: Puzzle;
  confirmedEdges: ConfirmedEdge[];
  confirmedBranches: ConfirmedBranch[];
  rejectedBranches: RejectedBranch[];
  activeBranchId?: string;
  status: GameStatus;
  totalGuesses: number;
  wrongGuesses: number;
  puzzleStartedAt: number | null;
  pathReachedAt: number[];
  hopDurationsMs: number[];
  score: ScoreResponse | null;
  branchCounter: number;
  statsVisible: boolean;
  solveRecorded: boolean;
}

export function purgeStaleGameState(dateKey = getPuzzleDateKey()): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const state = JSON.parse(raw) as PersistedGameState;
    if (state.puzzleDate !== dateKey || state.puzzle?.puzzleDate !== dateKey) {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function loadGameState(): PersistedGameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const state = JSON.parse(raw) as PersistedGameState;
    const todayKey = getPuzzleDateKey();
    if (state.puzzleDate !== todayKey || state.puzzle?.puzzleDate !== todayKey) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return state;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

/** Only restore in-progress progress when the saved board matches today's fetched daily. */
export function shouldRestoreSavedGame(
  saved: PersistedGameState,
  fetched: Puzzle,
  todayKey = getPuzzleDateKey()
): boolean {
  return (
    saved.puzzleDate === todayKey &&
    saved.puzzle.puzzleDate === todayKey &&
    saved.puzzle.id === fetched.id &&
    saved.puzzle.start === fetched.start &&
    saved.puzzle.end === fetched.end
  );
}

export function saveGameState(state: PersistedGameState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota or private-mode errors.
  }
}

export function clearGameState(): void {
  // Only clears in-progress game state — not connections-solve-stats or pathways-win-streak.
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}
