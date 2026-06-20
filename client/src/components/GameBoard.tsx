import { getDebugPuzzleFromUrl } from "../debugPuzzle";
import { clearGameState } from "../gamePersistence";
import { useGame } from "../hooks/useGame";
import { formatPuzzleDate } from "./formatPuzzleDate";
import { PathTree } from "./PathTree";
import { WinPopup } from "./WinPopup";
import { WordInput } from "./WordInput";

export function GameBoard() {
  const debugPuzzle = getDebugPuzzleFromUrl();
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
    score,
    hopDurationsMs,
    statsVisible,
    dismissStats,
    startTimer,
    submitWord,
  } = useGame();

  const handleNextPuzzle = () => {
    clearGameState();
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
      <section className="panel panel--tree">
        {debugPuzzle ? (
          <p className="game-board__debug-tag">
            Debug: {debugPuzzle.start} → {debugPuzzle.end}
          </p>
        ) : (
          <p className="game-board__daily-tag">
            Daily puzzle · {formatPuzzleDate(puzzle.puzzleDate)}
          </p>
        )}

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
        />

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

      <section className="panel panel--input">
        <WordInput
          disabled={!playing}
          error={playing ? error : null}
          onTypingStart={startTimer}
          onSubmit={submitWord}
        />
      </section>
    </div>
  );
}
