import type { CSSProperties } from "react";
import { formatRelation } from "./formatRelation";
import { relationColor } from "./relationColors";

interface PathEdgeProps {
  relation: string;
  orientation?: "vertical" | "horizontal";
}

export function PathEdge({ relation, orientation = "vertical" }: PathEdgeProps) {
  const color = relationColor(relation);
  const isHorizontal = orientation === "horizontal";

  return (
    <div
      className={`path-edge${isHorizontal ? " path-edge--horizontal" : ""}`}
      style={{ "--edge-color": color } as CSSProperties}
    >
      <div className="path-edge__stem path-edge__stem--upper" aria-hidden="true" />
      <span className="path-edge__label">{formatRelation(relation)}</span>
      <div className="path-edge__stem path-edge__stem--lower" aria-hidden="true" />
    </div>
  );
}
