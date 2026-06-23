import { useRef, useState, useMemo, type CSSProperties } from "react";
import { getDebugPuzzleFromUrl } from "../debugPuzzle";
import { clearDailySession } from "../dailyStorage";
import { buildActivePath } from "../api/activePath";
import { getWinStreak } from "../solveStats";
import { useGame } from "../hooks/useGame";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useKeyboardInset } from "../hooks/useVisualViewport";
import { GraphView } from "./GraphView";
import { MobileDock, type MobileGraphView } from "./MobileDock";
import { PathView } from "./PathView";
import { WinPopup } from "./WinPopup";
import { WordInfoSheet } from "./WordInfoSheet";
import { WordInput } from "./WordInput";

export function GameBoard() {
  const debugPuzzle = getDebugPuzzleFromUrl();
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<MobileGraphView>("path");
  const [showRejected, setShowRejected] = useState(false);
  const mobileGoalBarRef = useRef<HTMLDivElement>(null);
  const isMobile = useMediaQuery("(max-width: 720px)");
  const isPortrait = useMediaQuery("(orientation: portrait)");
  const keyboardInset = useKeyboardInset();
  const {
    puzzle,
    graphNodes,
    graphEdges,
    rejectedBranches,
    currentNodeId,
    currentWord,
    currentHopsToEnd,
    closestHopsToEnd,
    status,
    error,
    score,
    hopDurationsMs,
    nodeArrivedAt,
    edgeArrivedAt,
    puzzleStartedAt,
    statsVisible,
    dismissStats,
    showStats,
    startTimer,
    submitWord,
    submitting,
    persistLayout,
  } = useGame();

  const winPath = useMemo(() => {
    if (!puzzle || status !== "won") return [];
    const endNode = graphNodes.find((node) => node.word === puzzle.end);
    if (!endNode) return [];
    return buildActivePath(graphNodes, graphEdges, puzzle.start, endNode.id);
  }, [puzzle, status, graphNodes, graphEdges]);

  const handleNextPuzzle = () => {
    clearDailySession();
    window.location.reload();
  };

  if (!puzzle) {
    if (error) {
      return (
        <div className="game-board game-board--loading">
          <p className="game-board__loading">{error}</p>
        </div>
      );
    }

    return (
      <div className="game-board">
        <section className="panel panel--play">
          <div className="play-stage play-stage--boot" />
          <div className="play-dock">
            <WordInput disabled onTypingStart={() => {}} onSubmit={async () => false} />
          </div>
        </section>
      </div>
    );
  }

  const playing = status === "playing";
  const winStreak = getWinStreak();
  const displayHopsToEnd =
    currentHopsToEnd ?? (graphNodes.length <= 1 ? puzzle.optimalHops : undefined);
  const proximityHops =
    closestHopsToEnd ?? (graphNodes.length <= 1 ? puzzle.optimalHops : undefined);
  const closeCount =
    playing &&
    proximityHops !== undefined &&
    proximityHops > 0 &&
    proximityHops <= 3
      ? proximityHops
      : undefined;

  const wordInput = (
    <WordInput
      disabled={!playing}
      submitting={submitting}
      onTypingStart={startTimer}
      onSubmit={submitWord}
    />
  );

  return (
    <div
      className={["game-board", isMobile ? "game-board--mobile" : ""].filter(Boolean).join(" ")}
      style={
        isMobile && keyboardInset > 0
          ? ({ "--keyboard-inset": `${keyboardInset}px` } as CSSProperties)
          : undefined
      }
    >
      <section className="panel panel--play">
        {debugPuzzle && (
          <p className="game-board__debug-tag">
            Custom puzzle (not daily): {debugPuzzle.start} → {debugPuzzle.end}
          </p>
        )}

        {(playing && winStreak > 0) || (status === "won" && score && !statsVisible) ? (
          <div className="game-board__corner">
            {playing && winStreak > 0 && (
              <span className="game-board__streak-count" aria-label={`${winStreak} day win streak`}>
                {winStreak}
              </span>
            )}
            {status === "won" && score && !statsVisible && (
              <button type="button" className="game-board__stats-link" onClick={showStats}>
                Stats
              </button>
            )}
          </div>
        ) : null}

        <div className="play-stage">
          {isMobile && mobileView === "path" ? (
            <PathView
              start={puzzle.start}
              end={puzzle.end}
              nodes={graphNodes}
              edges={graphEdges}
              currentNodeId={currentNodeId}
              complete={status === "won"}
              onWordSelect={setSelectedWord}
            />
          ) : (
            <GraphView
              start={puzzle.start}
              end={puzzle.end}
              graphNodes={graphNodes}
              graphEdges={graphEdges}
              rejectedBranches={rejectedBranches}
              currentNodeId={currentNodeId}
              currentWord={currentWord}
              initialHops={puzzle.optimalHops}
              complete={status === "won"}
              closeCount={isMobile ? undefined : closeCount}
              hideGoalBar={isMobile}
              hideLegendChrome={isMobile && isPortrait}
              externalGoalBarRef={isMobile ? mobileGoalBarRef : undefined}
              includeRejected={!isMobile || showRejected}
              showPortraitGuide={!isMobile}
              onPersistLayout={persistLayout}
              onWordSelect={setSelectedWord}
            />
          )}
        </div>

        {isMobile ? (
          <MobileDock
            end={puzzle.end}
            complete={status === "won"}
            closeCount={closeCount}
            mobileView={mobileView}
            rejectedCount={rejectedBranches.length}
            showRejected={showRejected}
            onToggleRejected={() => setShowRejected((value) => !value)}
            onViewChange={setMobileView}
            onWordSelect={setSelectedWord}
            goalBarRef={mobileGoalBarRef}
            showLegend={isPortrait}
          >
            {wordInput}
          </MobileDock>
        ) : (
          <div className="play-dock">{wordInput}</div>
        )}

        <WordInfoSheet word={selectedWord} onClose={() => setSelectedWord(null)} />

        {status === "won" && score && statsVisible && (
          <WinPopup
            score={score}
            puzzleDate={puzzle.puzzleDate}
            hopDurationsMs={hopDurationsMs}
            path={winPath}
            start={puzzle.start}
            graphNodes={graphNodes}
            graphEdges={graphEdges}
            nodeArrivedAt={nodeArrivedAt}
            edgeArrivedAt={edgeArrivedAt}
            puzzleStartedAt={puzzleStartedAt}
            nextPuzzleAt={puzzle.nextPuzzleAt}
            onBack={dismissStats}
            onNextPuzzle={debugPuzzle ? undefined : handleNextPuzzle}
          />
        )}
      </section>
    </div>
  );
}
