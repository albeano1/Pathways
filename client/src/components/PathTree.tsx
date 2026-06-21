import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ConfirmedBranch, ConfirmedEdge, RejectedBranch } from "../../../shared/types";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useTreeScale } from "../hooks/useTreeScale";
import { GoalBar } from "./GoalBar";
import { TrunkGoalLink } from "./TrunkGoalLink";
import { TreeCanvas } from "./TreeCanvas";
import { buildRenderTree } from "./treeModel";
import { nodeBottomY } from "./treeGeometry";
import {
  CANVAS_PAD_TOP,
  computeBranchEdgeSpacings,
  computeTreeLayout,
  computeTrunkEdgeSpacings,
  treeCanvasSize,
} from "./treeLayout";

interface PathTreeProps {
  start: string;
  end: string;
  path: string[];
  confirmedEdges: ConfirmedEdge[];
  confirmedBranches: ConfirmedBranch[];
  rejectedBranches: RejectedBranch[];
  activeBranchId?: string;
  currentWord: string;
  hopsToEnd: number;
  initialHops: number;
  complete?: boolean;
  closeCount?: number;
  onWordSelect?: (word: string) => void;
}

export function PathTree({
  start,
  end,
  path,
  confirmedEdges,
  confirmedBranches,
  rejectedBranches,
  activeBranchId,
  currentWord,
  hopsToEnd,
  initialHops,
  complete,
  closeCount,
  onWordSelect,
}: PathTreeProps) {
  const pathTreeRef = useRef<HTMLDivElement>(null);
  const treeAreaRef = useRef<HTMLDivElement>(null);
  const goalBarRef = useRef<HTMLDivElement>(null);
  const isMobile = useMediaQuery("(max-width: 720px)");

  const reachedGoal = path.length > 0 && path[path.length - 1] === end;
  const won = complete === true || reachedGoal;

  const goalGapHeight = 0;

  const [panelTreeBudget, setPanelTreeBudget] = useState(400);

  const trunkEdgeSpacings = useMemo(
    () =>
      computeTrunkEdgeSpacings(
        path,
        confirmedEdges,
        panelTreeBudget,
        hopsToEnd,
        initialHops,
        won,
        activeBranchId,
        isMobile
      ),
    [path, confirmedEdges, panelTreeBudget, hopsToEnd, initialHops, won, activeBranchId, isMobile]
  );

  const branchEdgeSpacings = useMemo(() => {
    const map: Record<string, number[]> = {};
    for (const branch of confirmedBranches) {
      map[branch.id] = computeBranchEdgeSpacings(
        branch,
        panelTreeBudget,
        initialHops,
        won,
        activeBranchId === branch.id,
        isMobile
      );
    }
    return map;
  }, [confirmedBranches, panelTreeBudget, initialHops, won, activeBranchId, isMobile]);

  const root = useMemo(
    () =>
      buildRenderTree(
        start,
        path,
        confirmedEdges,
        confirmedBranches,
        rejectedBranches,
        end,
        won,
        activeBranchId
      ),
    [start, path, confirmedEdges, confirmedBranches, rejectedBranches, end, won, activeBranchId]
  );

  const layout = useMemo(
    () =>
      computeTreeLayout(root, {
        stripGoal: won,
        end,
        trunkEdgeSpacings,
        branchEdgeSpacings,
      }),
    [root, won, end, trunkEdgeSpacings, branchEdgeSpacings]
  );

  const canvasSize = treeCanvasSize(layout);
  const scale = useTreeScale(treeAreaRef, canvasSize, { widthOnly: isMobile });

  useLayoutEffect(() => {
    const panel = pathTreeRef.current;
    const treeArea = treeAreaRef.current;
    const goalBar = goalBarRef.current;
    if (!panel || !treeArea) return;

    const measure = () => {
      const goalBarHeight = goalBar?.offsetHeight ?? 0;
      const panelHeight = panel.clientHeight;
      const goalFootHeight = goalBarHeight + goalGapHeight;
      setPanelTreeBudget(Math.max(0, panelHeight - goalFootHeight - CANVAS_PAD_TOP));

      treeArea.style.bottom = `${goalFootHeight}px`;
      treeArea.style.top = "0";
      treeArea.style.height = "";
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    if (goalBar) observer.observe(goalBar);
    return () => observer.disconnect();
  }, [goalGapHeight]);

  useLayoutEffect(() => {
    if (!isMobile || won) return;
    const treeArea = treeAreaRef.current;
    if (!treeArea) return;

    const focus =
      layout.nodes.find((node) => node.variant === "current" || node.variant === "win-tip") ??
      layout.nodes.find((node) => node.word === currentWord);
    if (!focus) return;

    const focusY = (nodeBottomY(focus) + CANVAS_PAD_TOP) * scale;
    const nextTop = Math.max(0, focusY - treeArea.clientHeight * 0.35);
    const delta = Math.abs(treeArea.scrollTop - nextTop);
    if (delta > 8) {
      treeArea.scrollTo({ top: nextTop, behavior: "smooth" });
    }
  }, [currentWord, isMobile, layout.nodes, scale, won]);

  return (
    <div
      className={[
        "path-tree",
        won ? "path-tree--won" : "",
        isMobile ? "path-tree--mobile-scroll" : "",
      ]
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
        <div
          className="path-tree__scale-wrap"
          style={{
            width: canvasSize.width * scale,
            height: canvasSize.height * scale,
          }}
        >
          <div
            className="path-tree__scale-inner"
            style={{
              width: canvasSize.width,
              height: canvasSize.height,
              transform: `scale(${scale})`,
            }}
          >
            <TreeCanvas layout={layout} onWordSelect={onWordSelect} />
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
