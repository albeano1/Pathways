import { useState } from "react";
import { getDebugPuzzleFromUrl } from "../debugPuzzle";
import { clearDailySession } from "../dailyStorage";
import { useGame } from "../hooks/useGame";
import { PathTree } from "./PathTree";
import { WinPopup } from "./WinPopup";
import { WordInfoSheet } from "./WordInfoSheet";
import { WordInput } from "./WordInput";

export function GameBoard() {
  const debugPuzzle = getDebugPuzzleFromUrl();
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const {
    puzzle,
    path,
    confirmedEdges,
    confirmedBranches,
    rejectedBranches,
    activeBranchId,
    currentWord,
    currentHopsToEnd,
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
  } = useGame();

  const handleNextPuzzle = () => {
    clearDailySession();
    window.location.reload();
  };

  if (loading && !puzzle) {
    return (
      <div className="game-board game-board--loading">
        <p className="game-board__loading">Loading puzzle...</p>
      </div>
    );
  }

  if (!puzzle) {
    return (
      <div className="game-board game-board--loading">
        <p className="game-board__loading">{error ?? "Could not load a puzzle."}</p>
      </div>
    );
  }

  const playing = status === "playing";
  const displayHopsToEnd =
    currentHopsToEnd ?? (confirmedEdges.length === 0 ? puzzle.optimalHops : undefined);

  return (
    <div className="game-board">
      <section className="panel panel--play">
        {debugPuzzle && (
          <p className="game-board__debug-tag">
            Custom puzzle (not daily): {debugPuzzle.start} → {debugPuzzle.end}
          </p>
        )}

        {playing && (
          <div className="game-board__stats" aria-live="polite">
            <div
              className="game-board__stat game-board__stat--hops"
              aria-label={`${displayHopsToEnd ?? puzzle.optimalHops} hops to goal`}
            >
              {displayHopsToEnd ?? puzzle.optimalHops}
            </div>
          </div>
        )}

        <div className="play-stage">
          <PathTree
            start={puzzle.start}
            end={puzzle.end}
            path={path}
            confirmedEdges={confirmedEdges}
            confirmedBranches={confirmedBranches}
            rejectedBranches={rejectedBranches}
            activeBranchId={activeBranchId}
            currentWord={currentWord}
            hopsToEnd={displayHopsToEnd ?? puzzle.optimalHops}
            initialHops={puzzle.optimalHops}
            complete={status === "won"}
            onWordSelect={setSelectedWord}
          />
        </div>

        <div className="play-dock">
          <WordInput
            disabled={!playing}
            busy={submitting}
            onTypingStart={startTimer}
            onSubmit={submitWord}
          />
        </div>

        <WordInfoSheet word={selectedWord} onClose={() => setSelectedWord(null)} />

        {status === "won" && score && statsVisible && (
          <WinPopup
            score={score}
            puzzleDate={puzzle.puzzleDate}
            hopDurationsMs={hopDurationsMs}
            nextPuzzleAt={puzzle.nextPuzzleAt}
            onBack={dismissStats}
            onNextPuzzle={debugPuzzle ? undefined : handleNextPuzzle}
          />
        )}
      </section>
    </div>
  );
}
