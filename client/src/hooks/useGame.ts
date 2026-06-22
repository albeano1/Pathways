import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildExploreFromGraph,
  closestHopsInGraph,
  createStartNode,
  fetchPuzzle,
  hasGraphEdge,
  nextEdgeId,
  nextNodeId,
  nodeByWord,
  resolveParentNodeId,
  scorePath,
  shortestWinPath,
  syncGraphCounters,
  validateStep,
  isServerFailure,
  type GraphEdge,
  type GraphNode,
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
import { clearDailySession, purgeStaleDailySession } from "../dailyStorage";
import { writePuzzleCache } from "../puzzleCache";
import { warmApi } from "../warmApi";
import { hasStepContext, getCachedLookupWords, prefetchStepContext, resolveCachedStep } from "../stepContext";
import { prefetchWordInfo } from "../wordInfo";
import { getPuzzleDateKey } from "../../../shared/dailyPuzzle";
import { recordSolve, recordWinStreak, isDailyPuzzle } from "../solveStats";

export type SubmitResult =
  | boolean
  | {
      accepted: boolean;
      shake?: boolean;
    };

export type { GameStatus };

let rejectCounter = 0;

function nextRejectId(): string {
  rejectCounter += 1;
  return `reject-${rejectCounter}`;
}

function syncRejectCounter(rejected: RejectedBranch[]): void {
  let max = 0;
  for (const item of rejected) {
    const match = item.id.match(/^reject-(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  rejectCounter = max;
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

function createFreshGraph(start: string, optimalHops: number): {
  nodes: GraphNode[];
  edges: GraphEdge[];
  currentNodeId: string;
} {
  const startNode = createStartNode(start, optimalHops);
  return { nodes: [startNode], edges: [], currentNodeId: startNode.id };
}

function createFreshState(start: string, optimalHops: number) {
  const graph = createFreshGraph(start, optimalHops);
  return {
    graphNodes: graph.nodes,
    graphEdges: graph.edges,
    currentNodeId: graph.currentNodeId,
    rejectedBranches: [] as RejectedBranch[],
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
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>(() =>
    boot.puzzle ? createFreshGraph(boot.puzzle.start, boot.puzzle.optimalHops).nodes : []
  );
  const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
  const [currentNodeId, setCurrentNodeId] = useState<string>(() =>
    boot.puzzle ? createFreshGraph(boot.puzzle.start, boot.puzzle.optimalHops).currentNodeId : ""
  );
  const [rejectedBranches, setRejectedBranches] = useState<RejectedBranch[]>([]);
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
  const [submitting, setSubmitting] = useState(false);

  const currentNode = useMemo(
    () => graphNodes.find((node) => node.id === currentNodeId),
    [graphNodes, currentNodeId]
  );

  const currentWord = currentNode?.word ?? puzzle?.start ?? "";
  const currentHopsToEnd = currentNode?.hopsToEnd;
  const closestHopsToEnd = useMemo(() => closestHopsInGraph(graphNodes), [graphNodes]);

  const applyFreshState = useCallback((start: string, optimalHops: number) => {
    const fresh = createFreshState(start, optimalHops);
    syncGraphCounters(fresh.graphNodes, fresh.graphEdges);
    setGraphNodes(fresh.graphNodes);
    setGraphEdges(fresh.graphEdges);
    setCurrentNodeId(fresh.currentNodeId);
    setRejectedBranches(fresh.rejectedBranches);
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
    syncGraphCounters(saved.graphNodes, saved.graphEdges);
    syncRejectCounter(saved.rejectedBranches);
    setGraphNodes(saved.graphNodes);
    setGraphEdges(saved.graphEdges);
    setCurrentNodeId(saved.currentNodeId);
    setRejectedBranches(saved.rejectedBranches);
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
        applyFreshState(fetched.start, fetched.optimalHops);
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
          applyFreshState(fetched.start, fetched.optimalHops);
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
          if (boot.puzzle) {
            applyFreshState(boot.puzzle.start, boot.puzzle.optimalHops);
          }
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
        applyFreshState(fetched.start, fetched.optimalHops);
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
    if (!puzzle?.start || !puzzle?.end) return;
    prefetchWordInfo([puzzle.start, puzzle.end]);
  }, [puzzle?.start, puzzle?.end]);

  useEffect(() => {
    if (!puzzle || status !== "playing") return;

    const { path: explorePath } = buildExploreFromGraph(graphNodes);
    const graphWords = graphNodes.map((node) => node.word);
    prefetchWordInfo([
      ...explorePath,
      ...graphWords,
      puzzle.end,
      ...getCachedLookupWords(puzzle.end, explorePath, currentWord),
    ]);
    void prefetchStepContext(puzzle.end, explorePath, currentWord).then(() => {
      prefetchWordInfo([
        ...explorePath,
        ...graphWords,
        puzzle.end,
        ...getCachedLookupWords(puzzle.end, explorePath, currentWord),
      ]);
    });
  }, [puzzle, graphNodes, status, currentWord]);

  useEffect(() => {
    if (!hydrated.current || !puzzle || getDebugPuzzleFromUrl()) return;

    const snapshot: PersistedGameState = {
      puzzleDate: puzzle.puzzleDate,
      puzzle,
      graphNodes,
      graphEdges,
      currentNodeId,
      rejectedBranches,
      status,
      totalGuesses,
      wrongGuesses,
      puzzleStartedAt: puzzleStartedAt.current,
      pathReachedAt: pathReachedAt.current,
      hopDurationsMs,
      score,
      statsVisible,
      solveRecorded,
    };

    const timer = window.setTimeout(() => saveGameState(snapshot), 400);
    return () => window.clearTimeout(timer);
  }, [
    puzzle,
    graphNodes,
    graphEdges,
    currentNodeId,
    rejectedBranches,
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
    (winPath: string[], guessStats: { totalGuesses: number; wrongGuesses: number }) => {
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

  const showStats = useCallback(() => {
    if (status === "won" && score) {
      setStatsVisible(true);
    }
  }, [score, status]);

  const submitWord = useCallback(
    async (word: string): Promise<SubmitResult> => {
      if (!puzzle || status !== "playing") return false;
      if (submitLock.current) return { accepted: false, shake: false };

      const trimmed = word.trim().toLowerCase();
      if (!trimmed) return false;

      submitLock.current = true;
      try {
        const { path: explorePath, keys: exploreKeys } = buildExploreFromGraph(graphNodes);
        const activeWord = currentWord;

        let result = resolveCachedStep(puzzle.end, explorePath, trimmed, activeWord);

        if (!result && !hasStepContext(puzzle.end, explorePath, activeWord)) {
          setSubmitting(true);
          await prefetchStepContext(puzzle.end, explorePath, activeWord);
          result = resolveCachedStep(puzzle.end, explorePath, trimmed, activeWord);

          if (!result && !hasStepContext(puzzle.end, explorePath, activeWord)) {
            result = await validateStep(activeWord, trimmed, puzzle.end, explorePath);
          }
        }

        if (result?.valid !== true) {
          if (result && isServerFailure(result)) {
            return { accepted: false, shake: false };
          }
          if (puzzleStartedAt.current === null) {
            startTimer();
          }
          if (!result || isOrphanWord(result)) {
            recordGuess(true);
            return false;
          }

          recordGuess(true);
          setRejectedBranches((current) => [
            ...current,
            {
              id: nextRejectId(),
              from: activeWord,
              attempted: trimmed,
              failureType: result.failureType ?? "no_edge",
              connectsTo: result.connectsTo,
            },
          ]);
          return false;
        }

        const connections = result.connections ?? [];
        if (connections.length === 0 && result.connectFromIndex !== undefined) {
          connections.push({
            connectFromIndex: result.connectFromIndex,
            connectedFrom: result.connectedFrom ?? activeWord,
            relation: result.relation ?? "RelatedTo",
            hopsToEnd: result.hopsToEnd ?? 0,
            previousHopsToEnd: result.previousHopsToEnd ?? 0,
            proximity: result.proximity ?? "same",
          });
        }

        if (connections.length === 0) {
          recordGuess(true);
          return false;
        }

        const canonical = result.canonicalWord ?? trimmed;
        const childHops = result.hopsToEnd ?? connections[0]!.hopsToEnd;
        let targetNode = nodeByWord(graphNodes, canonical);
        const targetId = targetNode?.id ?? nextNodeId();
        const newEdges: GraphEdge[] = [];

        for (const connection of connections) {
          const parentId = resolveParentNodeId(connection, exploreKeys);
          if (!parentId) continue;
          if (hasGraphEdge(graphEdges, parentId, targetId)) continue;

          newEdges.push({
            id: nextEdgeId(),
            fromNodeId: parentId,
            toNodeId: targetId,
            relation: connection.relation,
            proximity: connection.proximity,
            hopsToEnd: connection.hopsToEnd,
          });
        }

        if (newEdges.length === 0) {
          recordGuess(true);
          return false;
        }

        recordGuess(false);
        const guessStats = {
          totalGuesses: totalGuesses + 1,
          wrongGuesses,
        };

        let nextNodes = graphNodes;
        if (!targetNode) {
          const createdAt = Math.max(0, ...graphNodes.map((node) => node.createdAt)) + 1;
          targetNode = {
            id: targetId,
            word: canonical,
            hopsToEnd: childHops,
            createdAt,
          };
          nextNodes = [...graphNodes, targetNode];
        }

        const nextEdges = [...graphEdges, ...newEdges];
        setGraphNodes(nextNodes);
        setGraphEdges(nextEdges);
        setCurrentNodeId(targetNode.id);
        setError(null);

        const winPath = shortestWinPath(nextNodes, nextEdges, puzzle.start, puzzle.end);
        if (canonical === puzzle.end && winPath) {
          setStatus("won");
          finalizeScore(winPath, guessStats);
        } else if (winPath) {
          notePathArrival(winPath);
        }

        return true;
      } catch {
        return { accepted: false, shake: false };
      } finally {
        submitLock.current = false;
        setSubmitting(false);
      }
    },
    [
      currentWord,
      finalizeScore,
      graphEdges,
      graphNodes,
      notePathArrival,
      puzzle,
      recordGuess,
      startTimer,
      status,
      totalGuesses,
      wrongGuesses,
    ]
  );

  const persistLayout = useCallback((positions: Array<{ id: string; x: number; y: number }>) => {
    if (positions.length === 0) return;
    const byId = new Map(positions.map((pos) => [pos.id, pos]));
    setGraphNodes((nodes) => {
      let changed = false;
      const next = nodes.map((node) => {
        const pos = byId.get(node.id);
        if (!pos) return node;
        if (node.layoutX === pos.x && node.layoutY === pos.y) return node;
        changed = true;
        return { ...node, layoutX: pos.x, layoutY: pos.y };
      });
      return changed ? next : nodes;
    });
  }, []);

  return {
    puzzle,
    graphNodes,
    graphEdges,
    rejectedBranches,
    currentNodeId,
    currentWord,
    currentHopsToEnd,
    closestHopsToEnd,
    totalGuesses,
    wrongGuesses,
    status,
    error,
    loading,
    score,
    hopDurationsMs,
    statsVisible,
    dismissStats,
    showStats,
    startTimer,
    submitWord,
    submitting,
    persistLayout,
  };
}
