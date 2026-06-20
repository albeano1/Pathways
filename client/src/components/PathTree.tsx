import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ConfirmedBranch, ConfirmedEdge, RejectedBranch } from "../../../shared/types";
import { useTreeScale } from "../hooks/useTreeScale";
import { GoalBar } from "./GoalBar";
import { TreeCanvas } from "./TreeCanvas";
import { buildRenderTree } from "./treeModel";
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
}: PathTreeProps) {
  const pathTreeRef = useRef<HTMLDivElement>(null);
  const treeAreaRef = useRef<HTMLDivElement>(null);
  const goalBarRef = useRef<HTMLDivElement>(null);

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
        activeBranchId
      ),
    [path, confirmedEdges, panelTreeBudget, hopsToEnd, initialHops, won, activeBranchId]
  );

  const branchEdgeSpacings = useMemo(() => {
    const map: Record<string, number[]> = {};
    for (const branch of confirmedBranches) {
      map[branch.id] = computeBranchEdgeSpacings(
        branch,
        panelTreeBudget,
        initialHops,
        won,
        activeBranchId === branch.id
      );
    }
    return map;
  }, [confirmedBranches, panelTreeBudget, initialHops, won, activeBranchId]);

  const root = buildRenderTree(
    start,
    path,
    confirmedEdges,
    confirmedBranches,
    rejectedBranches,
    end,
    won,
    activeBranchId
  );

  const layout = computeTreeLayout(root, {
    stripGoal: won,
    end,
    trunkEdgeSpacings,
    branchEdgeSpacings,
  });

  const canvasSize = treeCanvasSize(layout);
  const scale = useTreeScale(treeAreaRef, canvasSize);

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

  return (
    <div className={["path-tree", won ? "path-tree--won" : ""].filter(Boolean).join(" ")} ref={pathTreeRef}>
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
            <TreeCanvas layout={layout} />
          </div>
        </div>
      </div>

      <div className="path-tree__goal-foot">
        <GoalBar ref={goalBarRef} word={end} complete={won} />
      </div>
    </div>
  );
}
