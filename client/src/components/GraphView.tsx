import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { GraphEdge, GraphNode, RejectedBranch } from "../../../shared/types";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useTreeScale } from "../hooks/useTreeScale";
import { PathwayLegendButton } from "./PathwayLegendButton";
import { RelationLegend } from "./RelationLegend";
import { GoalBar } from "./GoalBar";
import { GraphCanvas } from "./GraphCanvas";
import { buildRenderGraph } from "./graphModel";
import { computeGraphLayout, graphCanvasSize, isCompactLayout, isHorizontalLayout, useFixedGraphScale, useScrollableGraph, type PinnedPosition } from "./graphLayout";
import { TrunkGoalLink } from "./TrunkGoalLink";

interface GraphViewProps {
  start: string;
  end: string;
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  rejectedBranches: RejectedBranch[];
  currentNodeId: string;
  currentWord: string;
  initialHops: number;
  complete?: boolean;
  closeCount?: number;
  onPersistLayout?: (positions: Array<{ id: string; x: number; y: number }>) => void;
  onWordSelect?: (word: string) => void;
}

export function GraphView({
  start,
  end,
  graphNodes,
  graphEdges,
  rejectedBranches,
  currentNodeId,
  currentWord,
  initialHops,
  complete,
  closeCount,
  onPersistLayout,
  onWordSelect,
}: GraphViewProps) {
  const pathTreeRef = useRef<HTMLDivElement>(null);
  const treeAreaRef = useRef<HTMLDivElement>(null);
  const goalBarRef = useRef<HTMLDivElement>(null);
  const persistedLayoutKey = useRef("");
  const isMobile = useMediaQuery("(max-width: 720px)");

  const won = complete === true || graphNodes.some((node) => node.word === end);
  const goalGapHeight = 0;
  const [panelBudget, setPanelBudget] = useState(0);
  const [panelWidth, setPanelWidth] = useState(0);
  const isPortrait = panelBudget > panelWidth;
  const horizontalLayout = isHorizontalLayout(panelWidth, panelBudget);
  const compactLayout = isCompactLayout(panelWidth, panelBudget);
  const fixedScaleMode = useFixedGraphScale(panelWidth, panelBudget, isMobile);
  const scrollableGraph = useScrollableGraph(panelWidth, panelBudget, isMobile);
  const leftAlignedGraph = scrollableGraph;

  const pinned = useMemo(() => {
    const map = new Map<string, PinnedPosition>();
    for (const node of graphNodes) {
      if (node.layoutX !== undefined && node.layoutY !== undefined) {
        map.set(node.id, { x: node.layoutX, y: node.layoutY });
      }
    }
    return map;
  }, [graphNodes]);

  const renderGraph = useMemo(
    () =>
      buildRenderGraph({
        start,
        end,
        nodes: graphNodes,
        edges: graphEdges,
        rejected: rejectedBranches,
        currentNodeId,
        complete: won,
      }),
    [start, end, graphNodes, graphEdges, rejectedBranches, currentNodeId, won]
  );

  const layout = useMemo(
    () =>
      computeGraphLayout(
        renderGraph.nodes,
        renderGraph.edges,
        panelBudget,
        initialHops,
        start,
        panelWidth,
        pinned
      ),
    [renderGraph, panelBudget, initialHops, start, panelWidth, pinned]
  );

  useLayoutEffect(() => {
    if (!onPersistLayout || layout.newPositions.length === 0) return;
    const graphIds = new Set(graphNodes.map((node) => node.id));
    const toPersist = layout.newPositions.filter((pos) => graphIds.has(pos.id));
    if (toPersist.length === 0) return;
    const key = toPersist.map((p) => `${p.id}:${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("|");
    if (key === persistedLayoutKey.current) return;
    persistedLayoutKey.current = key;
    onPersistLayout(toPersist);
  }, [layout.newPositions, onPersistLayout, graphNodes]);

  const canvasSize = graphCanvasSize(layout, panelWidth, panelBudget);
  const scale = useTreeScale(treeAreaRef, canvasSize, fixedScaleMode, compactLayout, horizontalLayout);

  useLayoutEffect(() => {
    const panel = pathTreeRef.current;
    const treeArea = treeAreaRef.current;
    const goalBar = goalBarRef.current;
    if (!panel || !treeArea) return;

    const measure = () => {
      const goalBarHeight = goalBar?.offsetHeight ?? 0;
      const panelHeight = panel.clientHeight;
      const goalFootHeight = goalBarHeight + goalGapHeight;
      setPanelBudget(Math.max(0, panelHeight - goalFootHeight));
      setPanelWidth(Math.max(280, treeArea.clientWidth));
      treeArea.style.bottom = `${goalFootHeight}px`;
      treeArea.style.top = "0";
      treeArea.style.height = "";
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    observer.observe(treeArea);
    if (goalBar) observer.observe(goalBar);
    return () => observer.disconnect();
  }, [goalGapHeight]);

  return (
    <div
      className={["path-tree graph-view", won ? "path-tree--won" : "", isMobile ? "graph-view--mobile" : "", isPortrait ? "graph-view--portrait" : "", horizontalLayout ? "graph-view--horizontal" : "", scrollableGraph ? "graph-view--scrollable" : ""]
        .filter(Boolean)
        .join(" ")}
      ref={pathTreeRef}
    >
      {won && (
        <TrunkGoalLink
          containerRef={pathTreeRef}
          goalBarRef={goalBarRef}
          layoutHeight={layout.height}
        />
      )}
      <div className="path-tree__tree-area" ref={treeAreaRef}>
        <div className="graph-view__legend-chrome">
          {isMobile ? <PathwayLegendButton /> : <RelationLegend />}
        </div>
        <div
          className="path-tree__scale-wrap"
          style={{
            width: canvasSize.width * scale,
            height: canvasSize.height * scale,
          }}
        >
          <div
            className={[
              "path-tree__scale-inner",
              leftAlignedGraph ? "path-tree__scale-inner--align-left" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{
              width: canvasSize.width,
              height: canvasSize.height,
              transform: leftAlignedGraph
                ? `scale(${scale})`
                : `translateX(-50%) scale(${scale})`,
            }}
          >
            <GraphCanvas
              layout={layout}
              panelWidth={panelWidth}
              panelHeight={panelBudget}
              onWordSelect={onWordSelect}
            />
          </div>
        </div>
      </div>

      <div className="path-tree__goal-foot">
        <GoalBar
          ref={goalBarRef}
          word={end}
          complete={won}
          closeCount={closeCount}
          onWordSelect={onWordSelect}
        />
      </div>
    </div>
  );
}
