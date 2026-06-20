import { memo } from "react";

export type PathNodeVariant =
  | "start"
  | "confirmed"
  | "current"
  | "win-tip"
  | "target"
  | "target-ghost"
  | "rejected";

interface PathNodeProps {
  word: string;
  variant: PathNodeVariant;
  isNew?: boolean;
  onSelect?: (word: string) => void;
}

const HINT_LABELS: Partial<Record<PathNodeVariant, string>> = {
  start: "Starting",
  target: "Goal",
  "target-ghost": "Goal",
};

export const PathNode = memo(function PathNode({ word, variant, isNew, onSelect }: PathNodeProps) {
  const hint = HINT_LABELS[variant];

  return (
    <button
      type="button"
      className={[
        "path-node",
        `path-node--${variant}`,
        isNew ? "path-node--new" : "",
        hint ? "path-node--labeled" : "",
        onSelect ? "path-node--interactive" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onSelect?.(word)}
      aria-label={hint ? `${hint}: ${word}. Show definition.` : `${word}. Show definition.`}
    >
      <span className="path-node__word">
        {hint && <span className="path-node__hint">{hint}</span>}
        <span className="path-node__text">{word}</span>
      </span>
    </button>
  );
});
