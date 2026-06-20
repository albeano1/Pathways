import { memo } from "react";
import type { CSSProperties } from "react";
import { formatRelation } from "./formatRelation";
import { relationColor } from "./relationColors";
import { edgeAnchors } from "./treeGeometry";
import type { PositionedEdge, TreeLayout } from "./treeLayout";
import { CANVAS_PAD_BOTTOM, CANVAS_PAD_TOP, CANVAS_PAD_X, layoutTreeBottom } from "./treeLayout";
import { PathNode } from "./PathNode";

interface TreeCanvasProps {
  layout: TreeLayout;
}

function edgeColor(edge: PositionedEdge): string {
  if (edge.kind === "rejected") return "#ef4444";
  return edge.relation ? relationColor(edge.relation) : "#64748b";
}

export const TreeCanvas = memo(function TreeCanvas({ layout }: TreeCanvasProps) {
  const width = layout.width + CANVAS_PAD_X * 2;
  const height = layoutTreeBottom(layout.nodes) + CANVAS_PAD_TOP + CANVAS_PAD_BOTTOM;

  const nodeById = new Map(layout.nodes.map((node) => [node.id, node]));

  return (
    <div
      className="tree-canvas"
      style={
        {
          width,
          height,
        } as CSSProperties
      }
    >
      <svg
        className="tree-canvas__edges"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
      >
        {layout.edges.map((edge) => {
          const from = nodeById.get(edge.fromId);
          const to = nodeById.get(edge.toId);
          if (!from || !to) return null;
          const anchors = edgeAnchors(from, to);
          const color = edgeColor(edge);

          return (
            <line
              key={edge.id}
              x1={anchors.x1 + CANVAS_PAD_X}
              y1={anchors.y1 + CANVAS_PAD_TOP}
              x2={anchors.x2 + CANVAS_PAD_X}
              y2={anchors.y2 + CANVAS_PAD_TOP}
              stroke={color}
              strokeWidth={4}
              strokeLinecap="round"
            />
          );
        })}
      </svg>

      {layout.edges.map((edge) => {
        if (!edge.relation) return null;
        const color = edgeColor(edge);
        return (
          <span
            key={`${edge.id}-label`}
            className="tree-canvas__edge-label"
            style={
              {
                left: edge.labelX + CANVAS_PAD_X,
                top: edge.labelY + CANVAS_PAD_TOP,
                background: color,
              } as CSSProperties
            }
          >
            {formatRelation(edge.relation)}
          </span>
        );
      })}

      {layout.nodes.map((node) => (
        <div
          key={node.id}
          className="tree-canvas__node"
          style={
            {
              left: node.x + CANVAS_PAD_X,
              top: node.y + CANVAS_PAD_TOP,
            } as CSSProperties
          }
        >
          <PathNode word={node.word} variant={node.variant} isNew={node.isNew} />
        </div>
      ))}
    </div>
  );
});
