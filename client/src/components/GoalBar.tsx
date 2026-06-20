import { forwardRef } from "react";

interface GoalBarProps {
  word: string;
  complete?: boolean;
}

export const GoalBar = forwardRef<HTMLDivElement, GoalBarProps>(function GoalBar(
  { word, complete },
  ref
) {
  return (
    <div
      ref={ref}
      className={["goal-bar", complete ? "goal-bar--complete" : ""].filter(Boolean).join(" ")}
    >
      <span className="goal-bar__label">Goal</span>
      <span className="goal-bar__word">{word}</span>
    </div>
  );
});
