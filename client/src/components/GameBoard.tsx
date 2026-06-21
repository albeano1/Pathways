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
            <WordInput disabled busy={false} onTypingStart={() => {}} onSubmit={async () => false} />
          </div>
        </section>
      </div>
    );
  }

  const playing = status === "playing";
  const displayHopsToEnd =
    currentHopsToEnd ?? (confirmedEdges.length === 0 ? puzzle.optimalHops : undefined);
  const closeCount =
    playing &&
    displayHopsToEnd !== undefined &&
    displayHopsToEnd > 0 &&
    displayHopsToEnd <= 3
      ? displayHopsToEnd
      : undefined;

  return (
    <div className="game-board">
      <section className="panel panel--play">
        {debugPuzzle && (
          <p className="game-board__debug-tag">
            Custom puzzle (not daily): {debugPuzzle.start} → {debugPuzzle.end}
          </p>
        )}

        {playing && (
          <p
            className="game-board__hops-count"
            aria-live="polite"
            aria-label={`${displayHopsToEnd ?? puzzle.optimalHops} hops to goal`}
          >
            {displayHopsToEnd ?? puzzle.optimalHops}
          </p>
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
            closeCount={closeCount}
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
