import { useState } from "react";
import { getDebugPuzzleFromUrl } from "../debugPuzzle";
import { clearDailySession } from "../dailyStorage";
import { getWinStreak } from "../solveStats";
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
    score,
    hopDurationsMs,
    statsVisible,
    dismissStats,
    showStats,
    startTimer,
    submitWord,
    submitting,
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
            <WordInput disabled onTypingStart={() => {}} onSubmit={async () => false} />
          </div>
        </section>
      </div>
    );
  }

  const playing = status === "playing";
  const winStreak = getWinStreak();
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
            submitting={submitting}
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
