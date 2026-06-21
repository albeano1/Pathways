import { useEffect, useState } from "react";
import type { ScoreResponse } from "../../../shared/types";
import {
  buildShareText,
  formatHopDuration,
  getAverageSolveTimeMs,
  getWinStreak,
  scoredPathNodes,
} from "../solveStats";
import { formatPuzzleDate } from "./formatPuzzleDate";
import { formatCountdown, formatSolveTime } from "./formatSolveTime";
import { useCountdown } from "../hooks/useCountdown";

interface WinPopupProps {
  score: ScoreResponse;
  puzzleDate: string;
  hopDurationsMs: number[];
  nextPuzzleAt: string;
  onBack: () => void;
  onNextPuzzle?: () => void;
}

export function WinPopup({
  score,
  puzzleDate,
  hopDurationsMs,
  nextPuzzleAt,
  onBack,
  onNextPuzzle,
}: WinPopupProps) {
  const remainingMs = useCountdown(nextPuzzleAt);
  const [copied, setCopied] = useState(false);
  const streak = getWinStreak();
  const averageTimeMs = getAverageSolveTimeMs();

  const pathNodes = scoredPathNodes(score.playerHops);
  const optimalPathNodes = scoredPathNodes(score.optimalHops);

  useEffect(() => {
    if (remainingMs === 0 && onNextPuzzle) {
      onNextPuzzle();
    }
  }, [remainingMs, onNextPuzzle]);

  const handleShare = async () => {
    const text = buildShareText({
      puzzleDateLabel: formatPuzzleDate(puzzleDate),
      score,
      streak,
      hopDurationsMs,
      averageTimeMs,
    });

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="result result--won" role="dialog" aria-label="Statistics">
      <div className="win-popup">
        <button type="button" className="win-popup__back" onClick={onBack}>
          Back to puzzle
        </button>

        <p className="win-popup__congrats">Congratulations</p>
        <p className="win-popup__heading">Statistics</p>

        <div className="win-popup__stats">
          <div className="win-popup__stat">
            <div className="win-popup__hop-times">
              {hopDurationsMs.map((durationMs, index) => (
                <span key={index}>{formatHopDuration(durationMs)}</span>
              ))}
            </div>
            <span className="win-popup__stat-label">Hop times</span>
          </div>

          <div className="win-popup__stat">
            <span className="win-popup__stat-value">{pathNodes}</span>
            <span className="win-popup__stat-label">{pathNodes === 1 ? "Node" : "Nodes"}</span>
            {pathNodes !== optimalPathNodes && (
              <span className="win-popup__stat-detail">best {optimalPathNodes}</span>
            )}
          </div>

          {streak > 0 && (
            <div className="win-popup__stat">
              <span className="win-popup__stat-value">{streak}</span>
              <span className="win-popup__stat-label">Win streak</span>
            </div>
          )}

          {averageTimeMs !== null && (
            <div className="win-popup__stat">
              <span className="win-popup__stat-value">{formatSolveTime(averageTimeMs)}</span>
              <span className="win-popup__stat-label">Avg time</span>
            </div>
          )}
        </div>

        <button type="button" className="win-popup__share" onClick={() => void handleShare()}>
          {copied ? "Copied!" : "Share results"}
        </button>

        {onNextPuzzle && (
          <p className="win-popup__countdown">
            Next puzzle in <strong>{formatCountdown(remainingMs)}</strong>
          </p>
        )}
      </div>
    </div>
  );
}
