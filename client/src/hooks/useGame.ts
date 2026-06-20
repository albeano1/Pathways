import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  branchTip,
  buildExplorePath,
  buildPathFromEdges,
  buildWinPathFromBranch,
  fetchPuzzle,
  scorePath,
  validateStep,
  type ConfirmedBranch,
  type ConfirmedEdge,
  type Puzzle,
  type RejectedBranch,
  type ScoreResponse,
} from "../api/client";
import type { ValidateStepResponse } from "../../../shared/types";
import { getDebugPuzzleFromUrl } from "../debugPuzzle";
import {
  clearGameState,
  loadGameState,
  saveGameState,
  type GameStatus,
  type PersistedGameState,
} from "../gamePersistence";
import { hopDurationsFromReachedAt, updatePathReachedAt } from "../hopTiming";
import { resolveDailyPuzzle } from "../loadPuzzle";
import { readPuzzleCache, writePuzzleCache } from "../puzzleCache";
import { warmApi } from "../warmApi";
import { getPuzzleDateKey } from "../../../shared/dailyPuzzle";
import { recordSolve, recordWinStreak } from "../solveStats";

export type { GameStatus };

let branchCounter = 0;

function syncBranchCounter(branches: ConfirmedBranch[], rejected: RejectedBranch[]): void {
  let max = 0;
  for (const item of [...branches, ...rejected]) {
    const match = item.id.match(/^branch-(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  branchCounter = max;
}

function nextBranchId(): string {
  branchCounter += 1;
  return `branch-${branchCounter}`;
}

function findBranchByTip(
  branches: ConfirmedBranch[],
  word: string
): ConfirmedBranch | undefined {
  return branches.find((branch) => branchTip(branch) === word);
}

/** Word is not on the graph or has no edge to any node on the current path. */
function isOrphanWord(result: ValidateStepResponse): boolean {
  if (result.failureType === "not_in_graph") return true;
  if (result.failureType === "duplicate") return true;
  if (result.failureType === "no_edge") {
    return !result.connectsTo || result.connectsTo.length === 0;
  }
  return false;
}

function createFreshState() {
  return {
    confirmedEdges: [] as ConfirmedEdge[],
    confirmedBranches: [] as ConfirmedBranch[],
    rejectedBranches: [] as RejectedBranch[],
    activeBranchId: undefined as string | undefined,
    status: "playing" as GameStatus,
    score: null as ScoreResponse | null,
    totalGuesses: 0,
    wrongGuesses: 0,
    puzzleStartedAt: null as number | null,
    pathReachedAt: [] as number[],
    hopDurationsMs: [] as number[],
    statsVisible: false,
    solveRecorded: false,
  };
}

export function useGame() {
  const initialPuzzleRef = useRef<Puzzle | null>(null);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(() => {
    if (getDebugPuzzleFromUrl()) return null;
    const cached = readPuzzleCache(getPuzzleDateKey());
    initialPuzzleRef.current = cached;
    return cached;
  });
  const [confirmedEdges, setConfirmedEdges] = useState<ConfirmedEdge[]>([]);
  const [confirmedBranches, setConfirmedBranches] = useState<ConfirmedBranch[]>([]);
  const [rejectedBranches, setRejectedBranches] = useState<RejectedBranch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string | undefined>();
  const [status, setStatus] = useState<GameStatus>("playing");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => initialPuzzleRef.current === null);
  const [submitting, setSubmitting] = useState(false);
  const [score, setScore] = useState<ScoreResponse | null>(null);
  const [totalGuesses, setTotalGuesses] = useState(0);
  const [wrongGuesses, setWrongGuesses] = useState(0);
  const [statsVisible, setStatsVisible] = useState(false);
  const [solveRecorded, setSolveRecorded] = useState(false);
  const [hopDurationsMs, setHopDurationsMs] = useState<number[]>([]);
  const puzzleStartedAt = useRef<number | null>(null);
  const pathReachedAt = useRef<number[]>([]);
  const hydrated = useRef(false);

  const path = useMemo(
    () => (puzzle ? buildPathFromEdges(puzzle.start, confirmedEdges) : []),
    [confirmedEdges, puzzle]
  );

  const hopsToEnd = confirmedEdges[confirmedEdges.length - 1]?.hopsToEnd;

  const currentWord = useMemo(() => {
    if (activeBranchId) {
      const branch = confirmedBranches.find((item) => item.id === activeBranchId);
      if (branch) return branchTip(branch);
    }
    return path[path.length - 1] ?? puzzle?.start ?? "";
  }, [activeBranchId, confirmedBranches, path, puzzle?.start]);

  const currentHopsToEnd = useMemo(() => {
    if (activeBranchId) {
      const branch = confirmedBranches.find((item) => item.id === activeBranchId);
      if (branch) {
        const last = branch.continuation[branch.continuation.length - 1];
        return last?.hopsToEnd ?? branch.hopsToEnd;
      }
    }
    return confirmedEdges[confirmedEdges.length - 1]?.hopsToEnd;
  }, [activeBranchId, confirmedBranches, confirmedEdges]);

  const applyFreshState = useCallback(() => {
    const fresh = createFreshState();
    branchCounter = 0;
    setConfirmedEdges(fresh.confirmedEdges);
    setConfirmedBranches(fresh.confirmedBranches);
    setRejectedBranches(fresh.rejectedBranches);
    setActiveBranchId(fresh.activeBranchId);
    setStatus(fresh.status);
    setScore(fresh.score);
    setTotalGuesses(fresh.totalGuesses);
    setWrongGuesses(fresh.wrongGuesses);
    setStatsVisible(fresh.statsVisible);
    setSolveRecorded(fresh.solveRecorded);
    puzzleStartedAt.current = fresh.puzzleStartedAt;
    pathReachedAt.current = fresh.pathReachedAt;
    setHopDurationsMs(fresh.hopDurationsMs);
  }, []);

  const restoreSavedState = useCallback((saved: PersistedGameState) => {
    branchCounter = saved.branchCounter;
    syncBranchCounter(saved.confirmedBranches, saved.rejectedBranches);
    setConfirmedEdges(saved.confirmedEdges);
    setConfirmedBranches(saved.confirmedBranches);
    setRejectedBranches(saved.rejectedBranches);
    setActiveBranchId(saved.activeBranchId);
    setStatus(saved.status);
    setScore(saved.score);
    setTotalGuesses(saved.totalGuesses);
    setWrongGuesses(saved.wrongGuesses);
    setStatsVisible(saved.statsVisible ?? saved.status === "won");
    setSolveRecorded(saved.solveRecorded ?? false);
    puzzleStartedAt.current = saved.puzzleStartedAt;
    pathReachedAt.current = saved.pathReachedAt ?? [];
    if (saved.puzzleStartedAt !== null && pathReachedAt.current.length === 0) {
      pathReachedAt.current = [saved.puzzleStartedAt];
    }
    setHopDurationsMs(saved.hopDurationsMs ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setError(null);
      const debug = getDebugPuzzleFromUrl();
      const hadCachedPuzzle = initialPuzzleRef.current !== null && !debug;

      if (hadCachedPuzzle && initialPuzzleRef.current) {
        const saved = loadGameState();
        if (
          saved &&
          saved.puzzleDate === initialPuzzleRef.current.puzzleDate &&
          saved.puzzle.id === initialPuzzleRef.current.id
        ) {
          restoreSavedState(saved);
        }
        hydrated.current = true;
      } else {
        setLoading(true);
      }

      try {
        const fetched = debug
          ? await fetchPuzzle({ start: debug.start, end: debug.end })
          : await resolveDailyPuzzle(getPuzzleDateKey());
        if (cancelled) return;

        if (
          !hadCachedPuzzle ||
          fetched.id !== initialPuzzleRef.current?.id ||
          fetched.puzzleDate !== initialPuzzleRef.current?.puzzleDate
        ) {
          if (!debug) {
            const saved = loadGameState();
            if (
              saved &&
              saved.puzzleDate === fetched.puzzleDate &&
              saved.puzzle.id === fetched.id
            ) {
              restoreSavedState(saved);
            } else {
              clearGameState();
              applyFreshState();
            }
          } else {
            applyFreshState();
          }

          setPuzzle(fetched);
          hydrated.current = true;
        }

        if (!debug) {
          writePuzzleCache(fetched);
        }
      } catch (err) {
        if (!cancelled && !hadCachedPuzzle) {
          setError((err as Error).message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [applyFreshState, restoreSavedState]);

  useEffect(() => {
    if (!puzzle) return;
    warmApi(puzzle.end);
  }, [puzzle?.end]);

  useEffect(() => {
    if (!hydrated.current || !puzzle || getDebugPuzzleFromUrl()) return;

    const snapshot: PersistedGameState = {
      puzzleDate: puzzle.puzzleDate,
      puzzle,
      confirmedEdges,
      confirmedBranches,
      rejectedBranches,
      activeBranchId,
      status,
      totalGuesses,
      wrongGuesses,
      puzzleStartedAt: puzzleStartedAt.current,
      pathReachedAt: pathReachedAt.current,
      hopDurationsMs,
      score,
      branchCounter,
      statsVisible,
      solveRecorded,
    };

    const timer = window.setTimeout(() => saveGameState(snapshot), 400);
    return () => window.clearTimeout(timer);
  }, [
    puzzle,
    confirmedEdges,
    confirmedBranches,
    rejectedBranches,
    activeBranchId,
    status,
    totalGuesses,
    wrongGuesses,
    score,
    statsVisible,
    solveRecorded,
    hopDurationsMs,
  ]);

  const recordGuess = useCallback((isWrong: boolean) => {
    setTotalGuesses((count) => count + 1);
    if (isWrong) {
      setWrongGuesses((count) => count + 1);
    }
  }, []);

  const startTimer = useCallback(() => {
    if (puzzleStartedAt.current !== null || status !== "playing") return;
    const now = Date.now();
    puzzleStartedAt.current = now;
    pathReachedAt.current = [now];
  }, [status]);

  const notePathArrival = useCallback((pathWords: string[]) => {
    const now = Date.now();
    const startTime = puzzleStartedAt.current ?? now;
    pathReachedAt.current = updatePathReachedAt(
      pathReachedAt.current,
      startTime,
      pathWords,
      now
    );
  }, []);

  const finalizeScore = useCallback(
    async (
      winPath: string[],
      guessStats: { totalGuesses: number; wrongGuesses: number }
    ) => {
      if (!puzzle) return;
      if (puzzleStartedAt.current === null) {
        startTimer();
      }
      notePathArrival(winPath);
      const durations = hopDurationsFromReachedAt(pathReachedAt.current);
      setHopDurationsMs(durations);
      const solveTimeMs =
        puzzleStartedAt.current !== null ? Date.now() - puzzleStartedAt.current : 0;
      const scoreResult = await scorePath(puzzle.start, puzzle.end, winPath, {
        totalGuesses: guessStats.totalGuesses,
        wrongGuesses: guessStats.wrongGuesses,
        solveTimeMs,
      });
      setScore(scoreResult);
      setSolveRecorded((recorded) => {
        if (!recorded) {
          recordSolve(solveTimeMs);
          recordWinStreak(puzzle.puzzleDate);
          return true;
        }
        return recorded;
      });
      setStatsVisible(true);
    },
    [notePathArrival, puzzle, startTimer]
  );

  const dismissStats = useCallback(() => {
    setStatsVisible(false);
  }, []);

  const submitWord = useCallback(
    async (word: string): Promise<boolean> => {
      if (!puzzle || status !== "playing") return false;

      const trimmed = word.trim().toLowerCase();
      if (!trimmed) return false;

      setSubmitting(true);
      try {
      const explorePath = buildExplorePath(puzzle.start, confirmedEdges, confirmedBranches);
      const previous = path[path.length - 1]!;
      const trunkLen = path.length;
      const result = await validateStep(previous, trimmed, puzzle.end, explorePath);

      if (result.valid !== true) {
        if (puzzleStartedAt.current === null) {
          startTimer();
        }
        if (isOrphanWord(result)) {
          recordGuess(true);
          setError(result.error ?? "That word does not connect to your path.");
          return false;
        }

        recordGuess(true);
        setRejectedBranches((current) => [
          ...current,
          {
            id: nextBranchId(),
            from: previous,
            attempted: trimmed,
            failureType: result.failureType ?? "no_edge",
            connectsTo: result.connectsTo,
          },
        ]);
        setError(result.error ?? "That word does not connect.");
        return false;
      }

      recordGuess(false);
      const guessStats = {
        totalGuesses: totalGuesses + 1,
        wrongGuesses,
      };

      const canonical = result.canonicalWord ?? trimmed;
      const fromIndex = result.connectFromIndex ?? trunkLen - 1;
      const fromWord = result.connectedFrom ?? previous;
      const nextEdge: ConfirmedEdge = {
        from: fromWord,
        to: canonical,
        relation: result.relation ?? "RelatedTo",
        proximity: result.proximity,
        hopsToEnd: result.hopsToEnd ?? 0,
      };

      setError(null);

      if (fromIndex < trunkLen - 1) {
        const duplicate = confirmedBranches.some(
          (branch) =>
            branch.from === fromWord &&
            (branch.to === canonical || branchTip(branch) === canonical)
        );
        if (duplicate) {
          setError(`"${trimmed}" is already explored from ${fromWord}.`);
          return false;
        }

        const branchId = nextBranchId();
        setConfirmedBranches((current) => [
          ...current,
          {
            id: branchId,
            from: fromWord,
            fromTrunkIndex: fromIndex,
            to: canonical,
            relation: nextEdge.relation,
            hopsToEnd: nextEdge.hopsToEnd,
            proximity: nextEdge.proximity,
            continuation: [],
          },
        ]);
        setActiveBranchId(branchId);

        const branchPath = [...path.slice(0, fromIndex + 1), canonical];

        if (canonical === puzzle.end) {
          setStatus("won");
          setStatsVisible(true);
          const winPath = buildWinPathFromBranch(puzzle.start, confirmedEdges, {
            id: branchId,
            from: fromWord,
            fromTrunkIndex: fromIndex,
            to: canonical,
            relation: nextEdge.relation,
            hopsToEnd: nextEdge.hopsToEnd,
            proximity: nextEdge.proximity,
            continuation: [],
          });
          await finalizeScore(winPath, guessStats);
        } else {
          notePathArrival(branchPath);
        }
        return true;
      }

      if (fromIndex > trunkLen - 1) {
        const branch = findBranchByTip(confirmedBranches, fromWord);
        if (!branch) return false;

        const updatedBranch: ConfirmedBranch = {
          ...branch,
          continuation: [...branch.continuation, nextEdge],
        };

        setConfirmedBranches((current) =>
          current.map((item) => (item.id === branch.id ? updatedBranch : item))
        );
        setActiveBranchId(branch.id);

        const branchPath = buildWinPathFromBranch(
          puzzle.start,
          confirmedEdges,
          updatedBranch
        );

        if (canonical === puzzle.end) {
          setStatus("won");
          setStatsVisible(true);
          await finalizeScore(branchPath, guessStats);
        } else {
          notePathArrival(branchPath);
        }
        return true;
      }

      const nextPath = [...path.slice(0, fromIndex + 1), canonical];
      setConfirmedEdges((current) => [...current.slice(0, fromIndex), nextEdge]);
      setRejectedBranches((current) =>
        current.filter((branch) => nextPath.slice(0, -1).includes(branch.from))
      );
      setActiveBranchId(undefined);

      if (canonical === puzzle.end) {
        setStatus("won");
        setStatsVisible(true);
        await finalizeScore(nextPath, guessStats);
      } else {
        notePathArrival(nextPath);
      }
      return true;
    } finally {
      setSubmitting(false);
    }
    },
    [confirmedBranches, confirmedEdges, finalizeScore, notePathArrival, path, puzzle, recordGuess, startTimer, status, totalGuesses, wrongGuesses]
  );

  return {
    puzzle,
    path,
    confirmedEdges,
    confirmedBranches,
    rejectedBranches,
    activeBranchId,
    hopsToEnd,
    currentWord,
    currentHopsToEnd,
    totalGuesses,
    wrongGuesses,
    status,
    error,
    loading,
    submitting,
    score,
    hopDurationsMs,
    statsVisible,
    dismissStats,
    startTimer,
    submitWord,
  };
}
