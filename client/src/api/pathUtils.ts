import type { ConfirmedBranch, ConfirmedEdge } from "../../../shared/types";

export function buildPathFromEdges(start: string, edges: ConfirmedEdge[]): string[] {
  if (edges.length === 0) return [start];
  return [start, ...edges.map((edge) => edge.to)];
}

export function branchTip(branch: ConfirmedBranch): string {
  const last = branch.continuation[branch.continuation.length - 1];
  return last?.to ?? branch.to;
}

/** Branch whose root or continuation contains `word` (not the trunk attachment `branch.from`). */
export function findBranchContainingWord(
  branches: ConfirmedBranch[],
  word: string
): ConfirmedBranch | undefined {
  return branches.find(
    (branch) =>
      branch.to === word || branch.continuation.some((edge) => edge.to === word)
  );
}

/** Extend a branch from any node on its chain, truncating any dead-end suffix after that node. */
export function extendBranchContinuation(
  branch: ConfirmedBranch,
  fromWord: string,
  nextEdge: ConfirmedEdge
): ConfirmedBranch {
  if (fromWord === branchTip(branch)) {
    return { ...branch, continuation: [...branch.continuation, nextEdge] };
  }

  if (fromWord === branch.to) {
    return { ...branch, continuation: [nextEdge] };
  }

  const splitIndex = branch.continuation.findIndex((edge) => edge.to === fromWord);
  if (splitIndex < 0) {
    return { ...branch, continuation: [...branch.continuation, nextEdge] };
  }

  return {
    ...branch,
    continuation: [...branch.continuation.slice(0, splitIndex + 1), nextEdge],
  };
}

export function buildExplorePath(
  start: string,
  trunkEdges: ConfirmedEdge[],
  branches: ConfirmedBranch[]
): string[] {
  const explorePath = buildPathFromEdges(start, trunkEdges);
  const seen = new Set(explorePath);

  for (const branch of branches) {
    if (!seen.has(branch.to)) {
      explorePath.push(branch.to);
      seen.add(branch.to);
    }
    for (const edge of branch.continuation) {
      if (!seen.has(edge.to)) {
        explorePath.push(edge.to);
        seen.add(edge.to);
      }
    }
  }

  return explorePath;
}

export function buildWinPathFromBranch(
  start: string,
  trunkEdges: ConfirmedEdge[],
  branch: ConfirmedBranch
): string[] {
  const trunkPath = buildPathFromEdges(start, trunkEdges);
  const prefix = trunkPath.slice(0, branch.fromTrunkIndex + 1);
  return [...prefix, branch.to, ...branch.continuation.map((edge) => edge.to)];
}
