import { forwardRef } from "react";

interface GoalBarProps {
  word: string;
  complete?: boolean;
  closeCount?: number;
  onWordSelect?: (word: string) => void;
}

export const GoalBar = forwardRef<HTMLDivElement, GoalBarProps>(function GoalBar(
  { word, complete, closeCount, onWordSelect },
  ref
) {
  const showProximity = closeCount !== undefined && closeCount > 0;
  const proximityLabel = closeCount === 1 ? "node away" : "nodes away";

  return (
    <div
      ref={ref}
      className={["goal-bar", complete ? "goal-bar--complete" : ""].filter(Boolean).join(" ")}
    >
      <button
        type="button"
        className="goal-bar__word"
        onClick={() => onWordSelect?.(word)}
        aria-label={
          showProximity
            ? `Goal, ${closeCount} ${proximityLabel}: ${word}. Show definition.`
            : `Goal: ${word}. Show definition.`
        }
      >
        <span className="goal-bar__label-row">
          <span className="goal-bar__label">Goal{showProximity ? ":" : ""}</span>
          {showProximity && (
            <span className="goal-bar__proximity">
              {closeCount} {proximityLabel}
            </span>
          )}
        </span>
        <span className="goal-bar__text">{word}</span>
      </button>
    </div>
  );
});
