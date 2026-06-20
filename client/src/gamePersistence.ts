import type {
  ConfirmedBranch,
  ConfirmedEdge,
  Puzzle,
  RejectedBranch,
  ScoreResponse,
} from "../../../shared/types";

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

export function loadGameState(): PersistedGameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedGameState;
  } catch {
    return null;
  }
}

export function saveGameState(state: PersistedGameState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota or private-mode errors.
  }
}

export function clearGameState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}
