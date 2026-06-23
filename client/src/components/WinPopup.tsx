import { useEffect, useState } from "react";
import type { GraphEdge, GraphNode, ScoreResponse } from "../../../shared/types";
import { buildExplorationTrailLine } from "../explorationTrail";
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
  path: string[];
  start: string;
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  nodeArrivedAt: Record<string, number>;
  edgeArrivedAt: Record<string, number>;
  puzzleStartedAt: number | null;
  nextPuzzleAt: string;
  onBack: () => void;
  onNextPuzzle?: () => void;
}

export function WinPopup({
  score,
  puzzleDate,
  hopDurationsMs,
  path,
  start,
  graphNodes,
  graphEdges,
  nodeArrivedAt,
  edgeArrivedAt,
  puzzleStartedAt,
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
  const solveTimeMs = score.solveTimeMs ?? hopDurationsMs.reduce((sum, ms) => sum + ms, 0);
  const perfectPath = score.playerHops === score.optimalHops;

  useEffect(() => {
    if (remainingMs === 0 && onNextPuzzle) {
      onNextPuzzle();
    }
  }, [remainingMs, onNextPuzzle]);

  const handleShare = async () => {
    const explorationTrail = buildExplorationTrailLine({
      nodes: graphNodes,
      edges: graphEdges,
      startWord: start,
      winPath: path,
      optimalHops: score.optimalHops,
      hopDurationsMs,
      nodeArrivals: new Map(Object.entries(nodeArrivedAt)),
      edgeArrivals: new Map(Object.entries(edgeArrivedAt)),
      puzzleStartedAt,
    });

    const text = buildShareText({
      puzzleDateLabel: formatPuzzleDate(puzzleDate),
      score,
      streak,
      hopDurationsMs,
      averageTimeMs,
      explorationTrail,
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

        {path.length > 0 && (
          <div className="win-popup__route" aria-label="Your path">
            <div className="win-popup__route-chain">
              {path.map((word, index) => {
                const onOptimalPath = index < optimalPathNodes;
                return (
                  <div key={`${word}-${index}`} className="win-popup__route-step">
                    {index > 0 && (
                      <span className="win-popup__route-link">
                        <span className="win-popup__route-arrow" aria-hidden="true">
                          →
                        </span>
                        <span className="win-popup__route-hop">
                          {formatHopDuration(hopDurationsMs[index - 1] ?? 0)}
                        </span>
                      </span>
                    )}
                    <span
                      className={[
                        "win-popup__route-word",
                        onOptimalPath
                          ? "win-popup__route-word--optimal"
                          : "win-popup__route-word--extra",
                      ].join(" ")}
                    >
                      {word}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="win-popup__stats">
          <div className="win-popup__stat">
            <span className="win-popup__stat-value">{formatHopDuration(solveTimeMs)}</span>
            <span className="win-popup__stat-label">Total time</span>
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

        {perfectPath && <p className="win-popup__perfect">Perfect path!</p>}

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
