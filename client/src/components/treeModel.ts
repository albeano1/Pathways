import type { ConfirmedBranch, ConfirmedEdge, RejectedBranch, Proximity } from "../../../shared/types";
import type { PathNodeVariant } from "./PathNode";

export type RenderArmKind = "trunk" | "confirmed" | "rejected";

export interface RenderNode {
  word: string;
  trunkIndex: number;
  variant: PathNodeVariant;
  isNew?: boolean;
  arms: RenderArm[];
}

export interface RenderArm {
  id: string;
  kind: RenderArmKind;
  relation?: string;
  hopsToEnd?: number;
  proximity?: Proximity;
  rejected?: RejectedBranch;
  branch?: ConfirmedBranch;
  child?: RenderNode;
  isActive?: boolean;
}

function nodeVariant(
  word: string,
  trunkIndex: number,
  path: string[],
  end: string,
  complete: boolean,
  reachedTarget: boolean,
  activeBranchId: string | undefined
): PathNodeVariant {
  const isStart = trunkIndex === 0;
  const isTarget = word === end;
  const isCurrent =
    !reachedTarget && trunkIndex === path.length - 1 && !activeBranchId;

  if (complete && isTarget) return "target";
  if (isStart) return "start";
  if (isTarget) return "target";
  if (isCurrent) return "current";
  return "confirmed";
}

function buildBranchChild(
  branch: ConfirmedBranch,
  activeBranchId: string | undefined
): RenderNode | undefined {
  const tipWord =
    branch.continuation.length > 0
      ? branch.continuation[branch.continuation.length - 1]!.to
      : branch.to;

  return {
    word: tipWord,
    trunkIndex: -1,
    variant: branch.id === activeBranchId ? "current" : "confirmed",
    arms: [],
  };
}

function buildTrunkNode(
  trunkIndex: number,
  path: string[],
  confirmedEdges: ConfirmedEdge[],
  confirmedBranches: ConfirmedBranch[],
  rejectedBranches: RejectedBranch[],
  end: string,
  complete: boolean,
  reachedTarget: boolean,
  activeBranchId: string | undefined
): RenderNode {
  const word = path[trunkIndex]!;
  const arms: RenderArm[] = [];

  if (trunkIndex + 1 < path.length) {
    const edge = confirmedEdges[trunkIndex]!;
    arms.push({
      id: `trunk-${trunkIndex}-${edge.to}`,
      kind: "trunk",
      relation: edge.relation,
      hopsToEnd: edge.hopsToEnd,
      proximity: edge.proximity,
      child: buildTrunkNode(
        trunkIndex + 1,
        path,
        confirmedEdges,
        confirmedBranches,
        rejectedBranches,
        end,
        complete,
        reachedTarget,
        activeBranchId
      ),
    });
  }

  for (const branch of confirmedBranches) {
    if (branch.from === word && branch.fromTrunkIndex === trunkIndex) {
      arms.push({
        id: branch.id,
        kind: "confirmed",
        relation: branch.relation,
        hopsToEnd: branch.hopsToEnd,
        proximity: branch.proximity,
        branch,
        child: buildBranchChild(branch, activeBranchId),
        isActive: branch.id === activeBranchId,
      });
    }
  }

  for (const rejected of rejectedBranches) {
    if (rejected.from === word) {
      arms.push({
        id: rejected.id,
        kind: "rejected",
        rejected,
      });
    }
  }

  return {
    word,
    trunkIndex,
    variant: nodeVariant(word, trunkIndex, path, end, complete, reachedTarget, activeBranchId),
    isNew: trunkIndex === path.length - 1 && trunkIndex > 0 && !activeBranchId,
    arms,
  };
}

export function buildRenderTree(
  start: string,
  path: string[],
  confirmedEdges: ConfirmedEdge[],
  confirmedBranches: ConfirmedBranch[],
  rejectedBranches: RejectedBranch[],
  end: string,
  complete: boolean,
  activeBranchId: string | undefined
): RenderNode {
  const trunkPath = path.length > 0 ? path : [start];
  const reachedTarget = trunkPath[trunkPath.length - 1] === end || complete;

  if (trunkPath.length === 1 && trunkPath[0] === start) {
    const arms: RenderArm[] = [];

    for (const branch of confirmedBranches) {
      if (branch.from === start && branch.fromTrunkIndex === 0) {
        arms.push({
          id: branch.id,
          kind: "confirmed",
          relation: branch.relation,
          branch,
          child: buildBranchChild(branch, activeBranchId),
          isActive: branch.id === activeBranchId,
        });
      }
    }

    for (const rejected of rejectedBranches) {
      if (rejected.from === start) {
        arms.push({ id: rejected.id, kind: "rejected", rejected });
      }
    }

    return {
      word: start,
      trunkIndex: 0,
      variant: "start",
      arms,
    };
  }

  return buildTrunkNode(
    0,
    trunkPath,
    confirmedEdges,
    confirmedBranches,
    rejectedBranches,
    end,
    complete,
    reachedTarget,
    activeBranchId
  );
}

export function isForkNode(node: RenderNode): boolean {
  if (node.arms.length === 0) return false;
  if (node.arms.length > 1) return true;
  const only = node.arms[0]!;
  return only.kind !== "trunk";
}

export function subtreeDepth(node: RenderNode): number {
  let max = 0;
  for (const arm of node.arms) {
    if (arm.child) {
      max = Math.max(max, 1 + subtreeDepth(arm.child));
    }
    if (arm.branch) {
      max = Math.max(max, 1 + arm.branch.continuation.length);
    }
  }
  return max;
}
