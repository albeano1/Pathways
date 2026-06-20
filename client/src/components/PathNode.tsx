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
}

const HINT_LABELS: Partial<Record<PathNodeVariant, string>> = {
  start: "Starting",
  target: "Goal",
  "target-ghost": "Goal",
};

export function PathNode({ word, variant, isNew }: PathNodeProps) {
  const hint = HINT_LABELS[variant];

  return (
    <div
      className={[
        "path-node",
        `path-node--${variant}`,
        isNew ? "path-node--new" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {hint && <span className="path-node__hint">{hint}</span>}
      <span className="path-node__word">{word}</span>
    </div>
  );
}
