import { forwardRef } from "react";

interface GoalBarProps {
  word: string;
  complete?: boolean;
  onWordSelect?: (word: string) => void;
}

export const GoalBar = forwardRef<HTMLDivElement, GoalBarProps>(function GoalBar(
  { word, complete, onWordSelect },
  ref
) {
  return (
    <div
      ref={ref}
      className={["goal-bar", complete ? "goal-bar--complete" : ""].filter(Boolean).join(" ")}
    >
      <button
        type="button"
        className="goal-bar__word"
        onClick={() => onWordSelect?.(word)}
        aria-label={`Goal: ${word}. Show definition.`}
      >
        <span className="goal-bar__label">Goal</span>
        <span className="goal-bar__text">{word}</span>
      </button>
    </div>
  );
});
