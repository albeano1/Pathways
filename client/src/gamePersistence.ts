import type {
  ConfirmedBranch,
  ConfirmedEdge,
  GraphEdge,
  GraphNode,
  Puzzle,
  RejectedBranch,
  ScoreResponse,
} from "../../../shared/types";
import { getPuzzleDateKey } from "../../shared/dailyPuzzle";
import { migrateTreeToGraph } from "./api/graphUtils";

const STORAGE_KEY = "connections-game-v2";
const LEGACY_STORAGE_KEY = "connections-game-v1";

export type GameStatus = "playing" | "won";

export interface PersistedGameState {
  puzzleDate: string;
  puzzle: Puzzle;
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  currentNodeId: string;
  rejectedBranches: RejectedBranch[];
  status: GameStatus;
  totalGuesses: number;
  wrongGuesses: number;
  puzzleStartedAt: number | null;
  pathReachedAt: number[];
  hopDurationsMs: number[];
  score: ScoreResponse | null;
  statsVisible: boolean;
  solveRecorded: boolean;
}

interface LegacyPersistedGameState {
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

function migrateLegacyState(legacy: LegacyPersistedGameState): PersistedGameState {
  const { nodes, edges, currentNodeId } = migrateTreeToGraph(
    legacy.puzzle.start,
    legacy.puzzle.optimalHops,
    legacy.confirmedEdges,
    legacy.confirmedBranches,
    legacy.rejectedBranches
  );

  return {
    puzzleDate: legacy.puzzleDate,
    puzzle: legacy.puzzle,
    graphNodes: nodes,
    graphEdges: edges,
    currentNodeId: currentNodeId ?? nodes[0]?.id ?? "",
    rejectedBranches: legacy.rejectedBranches,
    status: legacy.status,
    totalGuesses: legacy.totalGuesses,
    wrongGuesses: legacy.wrongGuesses,
    puzzleStartedAt: legacy.puzzleStartedAt,
    pathReachedAt: legacy.pathReachedAt ?? [],
    hopDurationsMs: legacy.hopDurationsMs ?? [],
    score: legacy.score,
    statsVisible: legacy.statsVisible ?? legacy.status === "won",
    solveRecorded: legacy.solveRecorded ?? false,
  };
}

function readRawState(): PersistedGameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as PersistedGameState;
    }

    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as LegacyPersistedGameState;
      const migrated = migrateLegacyState(legacy);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }

    return null;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return null;
  }
}

export function purgeStaleGameState(dateKey = getPuzzleDateKey()): void {
  try {
    const state = readRawState();
    if (!state) return;

    if (state.puzzleDate !== dateKey || state.puzzle?.puzzleDate !== dateKey) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }
}

export function loadGameState(): PersistedGameState | null {
  try {
    const state = readRawState();
    if (!state) return null;

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
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}
