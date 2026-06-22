import { memo, useMemo } from "react";
import type { CSSProperties } from "react";
import {
  DEFAULT_EDGE_WIDTH,
  REJECTED_PATHWAY_STYLE,
  REJECTED_TRACE_COLOR,
  pathwayStyle,
  traceColorForEdge,
} from "./edgeStyles";
import { routeGraphEdge } from "./graphGeometry";
import type { GraphLayout, PositionedEdge } from "./graphLayout";
import { graphCanvasOffset, graphCanvasSize } from "./graphLayout";
import { PathNode } from "./PathNode";

interface GraphCanvasProps {
  layout: GraphLayout;
  panelWidth?: number;
  onWordSelect?: (word: string) => void;
}

function edgeStrokeColor(edge: PositionedEdge, index: number): string {
  if (edge.rejected) return REJECTED_TRACE_COLOR;
  return traceColorForEdge(edge.id, index);
}

export const GraphCanvas = memo(function GraphCanvas({
  layout,
  panelWidth,
  onWordSelect,
}: GraphCanvasProps) {
  const offset = graphCanvasOffset(layout, panelWidth);
  const { width, height } = graphCanvasSize(layout, panelWidth);
  const nodeById = useMemo(
    () => new Map(layout.nodes.map((node) => [node.id, node])),
    [layout.nodes]
  );

  const routedEdges = useMemo(
    () =>
      layout.edges
        .map((edge, index) => {
          const from = nodeById.get(edge.fromId);
          const to = nodeById.get(edge.toId);
          if (!from || !to) return null;
          return {
            edge,
            index,
            routed: routeGraphEdge(from, to, layout.nodes, edge.fromId, edge.toId),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
    [layout.edges, layout.nodes, nodeById]
  );

  return (
    <div className="tree-canvas graph-canvas" style={{ width, height } as CSSProperties}>
      <svg
        className="tree-canvas__edges graph-canvas__edges"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        overflow="visible"
        aria-hidden="true"
      >
        {routedEdges.map(({ edge, index, routed }) => {
          const lineStyle = edge.rejected ? REJECTED_PATHWAY_STYLE : pathwayStyle(edge.relation);
          return (
            <path
              key={edge.id}
              d={routed.d}
              transform={`translate(${offset.x} ${offset.y})`}
              fill="none"
              stroke={edgeStrokeColor(edge, index)}
              strokeWidth={lineStyle.width ?? DEFAULT_EDGE_WIDTH}
              strokeLinecap={lineStyle.linecap}
              strokeLinejoin="round"
              strokeDasharray={lineStyle.dasharray}
            />
          );
        })}
      </svg>

      {layout.nodes.map((node) => (
        <div
          key={node.id}
          className="tree-canvas__node graph-canvas__node"
          style={
            {
              left: node.x + offset.x,
              top: node.y + offset.y,
            } as CSSProperties
          }
        >
          <PathNode word={node.word} variant={node.variant} onSelect={onWordSelect} />
        </div>
      ))}
    </div>
  );
});
