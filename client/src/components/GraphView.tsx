import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { GraphEdge, GraphNode, RejectedBranch } from "../../../shared/types";
import { activePathNodeIds } from "../api/activePath";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useTreeScale } from "../hooks/useTreeScale";
import { PathwayLegendButton } from "./PathwayLegendButton";
import { RelationLegend } from "./RelationLegend";
import { GoalBar } from "./GoalBar";
import { GraphCanvas } from "./GraphCanvas";
import { buildRenderGraph } from "./graphModel";
import {
  computeGraphLayout,
  graphCanvasSize,
  isCompactLayout,
  isHorizontalLayout,
  useFixedGraphScale,
  useScrollableGraph,
  type PinnedPosition,
} from "./graphLayout";
import { PortraitGuideLine } from "./PortraitGuideLine";
import { ScrollAffordances } from "./ScrollAffordances";
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
  hideGoalBar?: boolean;
  externalGoalBarRef?: RefObject<HTMLDivElement | null>;
  includeRejected?: boolean;
  showPortraitGuide?: boolean;
  hideLegendChrome?: boolean;
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
  hideGoalBar = false,
  externalGoalBarRef,
  includeRejected = true,
  showPortraitGuide = false,
  hideLegendChrome = false,
  onPersistLayout,
  onWordSelect,
}: GraphViewProps) {
  const pathTreeRef = useRef<HTMLDivElement>(null);
  const treeAreaRef = useRef<HTMLDivElement>(null);
  const internalGoalBarRef = useRef<HTMLDivElement>(null);
  const goalBarRef =
    hideGoalBar && externalGoalBarRef ? externalGoalBarRef : internalGoalBarRef;
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

  const spineNodeIds = useMemo(
    () =>
      scrollableGraph
        ? activePathNodeIds(graphNodes, graphEdges, start, currentNodeId)
        : new Set<string>(),
    [scrollableGraph, graphNodes, graphEdges, start, currentNodeId]
  );

  const goalParentNodeId = useMemo(() => {
    if (!won) return null;
    const endNode = graphNodes.find((node) => node.word === end);
    if (!endNode) return null;

    const parentEdges = graphEdges.filter(
      (edge) => edge.toNodeId === endNode.id && !edge.rejected
    );
    if (parentEdges.length === 0) return null;
    if (parentEdges.length === 1) return parentEdges[0]!.fromNodeId;

    const nodeById = new Map(graphNodes.map((node) => [node.id, node]));
    return parentEdges.reduce((best, edge) => {
      const bestParent = nodeById.get(best.fromNodeId);
      const edgeParent = nodeById.get(edge.fromNodeId);
      return (edgeParent?.createdAt ?? 0) > (bestParent?.createdAt ?? 0) ? edge : best;
    }).fromNodeId;
  }, [won, graphNodes, graphEdges, end]);

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
        includeRejected,
      }),
    [
      start,
      end,
      graphNodes,
      graphEdges,
      rejectedBranches,
      currentNodeId,
      won,
      includeRejected,
    ]
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
        pinned,
        spineNodeIds
      ),
    [renderGraph, panelBudget, initialHops, start, panelWidth, pinned, spineNodeIds]
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

  const canvasSize = graphCanvasSize(
    layout,
    panelWidth,
    panelBudget,
    scrollableGraph
  );
  const rawScale = useTreeScale(
    treeAreaRef,
    canvasSize,
    fixedScaleMode,
    compactLayout,
    horizontalLayout,
    false
  );
  const scale = scrollableGraph && isMobile ? Math.min(1, rawScale) : rawScale;

  useLayoutEffect(() => {
    if (!scrollableGraph || !currentNodeId) return;
    const treeArea = treeAreaRef.current;
    if (!treeArea) return;

    const nodeEl = treeArea.querySelector<HTMLElement>(`[data-node-id="${currentNodeId}"]`);
    if (!nodeEl) return;

    const treeRect = treeArea.getBoundingClientRect();
    const nodeRect = nodeEl.getBoundingClientRect();
    const nodeCenterX = nodeRect.left + nodeRect.width / 2 - treeRect.left + treeArea.scrollLeft;
    const nodeCenterY = nodeRect.top + nodeRect.height / 2 - treeRect.top + treeArea.scrollTop;

    const targetScrollLeft = nodeCenterX - treeArea.clientWidth / 2;
    const targetScrollTop = nodeCenterY - treeArea.clientHeight / 2;

    treeArea.scrollTo({
      left: Math.max(0, targetScrollLeft),
      top: Math.max(0, targetScrollTop),
      behavior: "smooth",
    });
  }, [scrollableGraph, currentNodeId, layout, scale, canvasSize]);

  useLayoutEffect(() => {
    const panel = pathTreeRef.current;
    const treeArea = treeAreaRef.current;
    const goalBar = hideGoalBar ? null : goalBarRef.current;
    if (!panel || !treeArea) return;

    const measure = () => {
      const goalBarHeight = goalBar?.offsetHeight ?? 0;
      const panelHeight = panel.clientHeight;
      const goalFootHeight = hideGoalBar ? 0 : goalBarHeight + goalGapHeight;
      setPanelBudget(Math.max(0, panelHeight - goalFootHeight));
      setPanelWidth(Math.max(280, treeArea.clientWidth));
      if (!hideGoalBar) {
        treeArea.style.bottom = `${goalFootHeight}px`;
      } else {
        treeArea.style.bottom = "0";
      }
      treeArea.style.top = "0";
      treeArea.style.height = "";
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    observer.observe(treeArea);
    if (goalBar) observer.observe(goalBar);
    return () => observer.disconnect();
  }, [goalGapHeight, hideGoalBar, goalBarRef]);

  return (
    <div
      className={[
        "path-tree graph-view",
        won ? "path-tree--won" : "",
        isMobile ? "graph-view--mobile" : "",
        isPortrait ? "graph-view--portrait" : "",
        horizontalLayout ? "graph-view--horizontal" : "",
        scrollableGraph ? "graph-view--scrollable" : "",
        hideGoalBar ? "graph-view--external-goal" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      ref={pathTreeRef}
    >
      {won && (
        <TrunkGoalLink
          containerRef={pathTreeRef}
          treeAreaRef={treeAreaRef}
          goalBarRef={goalBarRef}
          goalParentNodeId={goalParentNodeId}
        />
      )}
      <div className="path-tree__tree-area" ref={treeAreaRef}>
        <ScrollAffordances containerRef={treeAreaRef} />
        {showPortraitGuide && !hideGoalBar && (
          <PortraitGuideLine
            containerRef={pathTreeRef}
            goalBarRef={goalBarRef}
            layout={layout}
            panelWidth={panelWidth}
            panelHeight={panelBudget}
            centerGraphHorizontally={scrollableGraph}
            enabled={isPortrait && !won}
          />
        )}
        {!hideLegendChrome && (
          <div className="graph-view__legend-chrome">
            {isMobile ? <PathwayLegendButton /> : <RelationLegend />}
          </div>
        )}
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
              scrollableGraph ? "path-tree__scale-inner--align-left" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{
              width: canvasSize.width,
              height: canvasSize.height,
              transform: scrollableGraph
                ? `scale(${scale})`
                : `translateX(-50%) scale(${scale})`,
            }}
          >
            <GraphCanvas
              layout={layout}
              panelWidth={panelWidth}
              panelHeight={panelBudget}
              centerGraphHorizontally={scrollableGraph}
              onWordSelect={onWordSelect}
            />
          </div>
        </div>
      </div>

      {!hideGoalBar && (
        <div className="path-tree__goal-foot">
          <GoalBar
            ref={internalGoalBarRef}
            word={end}
            complete={won}
            closeCount={closeCount}
            onWordSelect={onWordSelect}
          />
        </div>
      )}
    </div>
  );
}
