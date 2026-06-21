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
  loadGameState,
  saveGameState,
  shouldRestoreSavedGame,
  type GameStatus,
  type PersistedGameState,
} from "../gamePersistence";
import { hopDurationsFromReachedAt, updatePathReachedAt } from "../hopTiming";
import { getBootSnapshot } from "../bootstrapGame";
import { prefetchDailyPuzzle } from "../prefetchPuzzle";
import { getPuzzleRefresh } from "../earlyPuzzleBoot";
import { resolveDailyPuzzle } from "../loadPuzzle";
import {
  clearDailySession,
  purgeStaleDailySession,
} from "../dailyStorage";
import { writePuzzleCache } from "../puzzleCache";
import { warmApi } from "../warmApi";
import { getPuzzleDateKey } from "../../../shared/dailyPuzzle";
import { recordSolve, recordWinStreak, isDailyPuzzle } from "../solveStats";

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
  const boot = getBootSnapshot();
  const [puzzle, setPuzzle] = useState<Puzzle | null>(() => boot.puzzle);
  const [confirmedEdges, setConfirmedEdges] = useState<ConfirmedEdge[]>([]);
  const [confirmedBranches, setConfirmedBranches] = useState<ConfirmedBranch[]>([]);
  const [rejectedBranches, setRejectedBranches] = useState<RejectedBranch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string | undefined>();
  const [status, setStatus] = useState<GameStatus>("playing");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(
    () => getDebugPuzzleFromUrl() !== null || boot.puzzle === null
  );
  const [score, setScore] = useState<ScoreResponse | null>(null);
  const [totalGuesses, setTotalGuesses] = useState(0);
  const [wrongGuesses, setWrongGuesses] = useState(0);
  const [statsVisible, setStatsVisible] = useState(false);
  const [solveRecorded, setSolveRecorded] = useState(false);
  const [hopDurationsMs, setHopDurationsMs] = useState<number[]>([]);
  const puzzleStartedAt = useRef<number | null>(null);
  const pathReachedAt = useRef<number[]>([]);
  const hydrated = useRef(false);
  const submitLock = useRef(false);

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

    async function applyDailyPuzzle(fetched: Puzzle, todayKey: string) {
      const saved = loadGameState();
      if (saved && shouldRestoreSavedGame(saved, fetched, todayKey)) {
        restoreSavedState(saved);
      } else {
        clearDailySession();
        applyFreshState();
      }

      setPuzzle(fetched);
      writePuzzleCache(fetched);
      hydrated.current = true;
    }

    async function init() {
      setError(null);
      const debug = getDebugPuzzleFromUrl();
      const todayKey = getPuzzleDateKey();

      if (!debug) {
        purgeStaleDailySession(todayKey);
        if (boot.saved && boot.puzzle && shouldRestoreSavedGame(boot.saved, boot.puzzle, todayKey)) {
          restoreSavedState(boot.saved);
          hydrated.current = true;
        }
      }

      const needsLoadingScreen = debug ? true : boot.puzzle === null;
      if (needsLoadingScreen) {
        setLoading(true);
      }

      try {
        const fetched = debug
          ? await fetchPuzzle({ start: debug.start, end: debug.end })
          : await prefetchDailyPuzzle(todayKey);
        if (cancelled) return;

        if (debug) {
          applyFreshState();
          setPuzzle(fetched);
          hydrated.current = true;
          return;
        }

        if (fetched.puzzleDate !== todayKey) {
          throw new Error(`Daily puzzle is out of date (expected ${todayKey}).`);
        }

        if (
          boot.puzzle?.puzzleDate === fetched.puzzleDate &&
          boot.puzzle.id === fetched.id &&
          boot.puzzle.start === fetched.start &&
          boot.puzzle.end === fetched.end
        ) {
          writePuzzleCache(fetched);
          hydrated.current = true;

          const refresh = getPuzzleRefresh();
          if (refresh) {
            void refresh.then((live) => {
              if (
                cancelled ||
                !live ||
                (live.puzzleDate === fetched.puzzleDate &&
                  live.id === fetched.id &&
                  live.start === fetched.start &&
                  live.end === fetched.end)
              ) {
                return;
              }
              void applyDailyPuzzle(live, todayKey);
            });
          }
          return;
        }

        await applyDailyPuzzle(fetched, todayKey);
      } catch (err) {
        if (!cancelled) {
          if (boot.puzzle) {
            hydrated.current = true;
            return;
          }
          clearDailySession();
          applyFreshState();
          setPuzzle(null);
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
  }, [applyFreshState, boot.puzzle, boot.saved, restoreSavedState]);

  useEffect(() => {
    if (!puzzle || getDebugPuzzleFromUrl()) return;

    let refreshing = false;

    async function refreshIfNewDay() {
      if (refreshing) return;

      refreshing = true;
      try {
        const todayKey = getPuzzleDateKey();
        const fetched = await resolveDailyPuzzle(todayKey);
        if (
          puzzle.puzzleDate === fetched.puzzleDate &&
          puzzle.id === fetched.id &&
          puzzle.start === fetched.start &&
          puzzle.end === fetched.end
        ) {
          return;
        }

        purgeStaleDailySession(todayKey);
        clearDailySession();
        applyFreshState();
        setPuzzle(fetched);
        writePuzzleCache(fetched);
        hydrated.current = true;
      } catch {
        // Retry on the next visibility tick or interval.
      } finally {
        refreshing = false;
      }
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshIfNewDay();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => {
      void refreshIfNewDay();
    }, 60_000);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [applyFreshState, puzzle]);

  useEffect(() => {
    if (!puzzle?.end || getDebugPuzzleFromUrl()) return;

    void warmApi(puzzle.end);
    const timer = window.setInterval(() => {
      void warmApi(puzzle.end);
    }, 25_000);

    return () => window.clearInterval(timer);
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
    (
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

      const optimisticScore: ScoreResponse = {
        valid: true,
        playerHops: winPath.length - 1,
        optimalHops: puzzle.optimalHops,
        totalGuesses: guessStats.totalGuesses,
        wrongGuesses: guessStats.wrongGuesses,
        correctGuesses: guessStats.totalGuesses - guessStats.wrongGuesses,
        solveTimeMs,
      };
      setScore(optimisticScore);
      setStatsVisible(true);
      setSolveRecorded((recorded) => {
        if (!recorded && !getDebugPuzzleFromUrl() && isDailyPuzzle(puzzle)) {
          recordSolve(solveTimeMs);
          recordWinStreak(puzzle.puzzleDate);
          return true;
        }
        return recorded;
      });

      void scorePath(puzzle.start, puzzle.end, winPath, {
        totalGuesses: guessStats.totalGuesses,
        wrongGuesses: guessStats.wrongGuesses,
        solveTimeMs,
      }).then((scoreResult) => {
        if (scoreResult.valid) {
          setScore(scoreResult);
        }
      });
    },
    [notePathArrival, puzzle, startTimer]
  );

  const dismissStats = useCallback(() => {
    setStatsVisible(false);
  }, []);

  const submitWord = useCallback(
    async (word: string): Promise<boolean> => {
      if (!puzzle || status !== "playing" || submitLock.current) return false;

      const trimmed = word.trim().toLowerCase();
      if (!trimmed) return false;

      submitLock.current = true;
      try {
      const explorePath = buildExplorePath(puzzle.start, confirmedEdges, confirmedBranches);
      const activeWord = currentWord;
      const trunkLen = path.length;
      const result = await validateStep(activeWord, trimmed, puzzle.end, explorePath);

      if (result.valid !== true) {
        if (puzzleStartedAt.current === null) {
          startTimer();
        }
        if (isOrphanWord(result)) {
          recordGuess(true);
          return false;
        }

        recordGuess(true);
        setRejectedBranches((current) => [
          ...current,
          {
            id: nextBranchId(),
            from: activeWord,
            attempted: trimmed,
            failureType: result.failureType ?? "no_edge",
            connectsTo: result.connectsTo,
          },
        ]);
        return false;
      }

      recordGuess(false);
      const guessStats = {
        totalGuesses: totalGuesses + 1,
        wrongGuesses,
      };

      const canonical = result.canonicalWord ?? trimmed;
      const fromIndex = result.connectFromIndex ?? trunkLen - 1;
      const fromWord = result.connectedFrom ?? activeWord;
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
          finalizeScore(winPath, guessStats);
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
          finalizeScore(branchPath, guessStats);
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
        finalizeScore(nextPath, guessStats);
      } else {
        notePathArrival(nextPath);
      }
      return true;
    } finally {
      submitLock.current = false;
    }
    },
    [confirmedBranches, confirmedEdges, currentWord, finalizeScore, notePathArrival, path, puzzle, recordGuess, startTimer, status, totalGuesses, wrongGuesses]
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
    score,
    hopDurationsMs,
    statsVisible,
    dismissStats,
    startTimer,
    submitWord,
  };
}
