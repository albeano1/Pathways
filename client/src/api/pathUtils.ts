import type { ConfirmedBranch, ConfirmedEdge } from "../../../shared/types";

export function buildPathFromEdges(start: string, edges: ConfirmedEdge[]): string[] {
  if (edges.length === 0) return [start];
  return [start, ...edges.map((edge) => edge.to)];
}

export function branchTip(branch: ConfirmedBranch): string {
  const last = branch.continuation[branch.continuation.length - 1];
  return last?.to ?? branch.to;
}

/** Stable key for a trunk node at the given index. */
export function trunkNodeKey(index: number): string {
  return `T${index}`;
}

/** Stable key for a branch node: position 0 is the root, 1.. are continuation nodes. */
export function branchNodeKey(branchId: string, position: number): string {
  return `${branchId}#${position}`;
}

/** Position of a branch's tip (0 when it has no continuation yet). */
export function branchTipPosition(branch: ConfirmedBranch): number {
  return branch.continuation.length;
}

/** Anchor key a branch attaches to, tolerating legacy state without `fromKey`. */
export function branchAnchorKey(branch: ConfirmedBranch): string {
  return branch.fromKey ?? trunkNodeKey(branch.fromTrunkIndex);
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

/**
 * Append a node to a branch only when it extends the branch tip. Returns `null`
 * when `fromWord` is an interior node so the caller can fork instead of
 * truncating the existing chain.
 */
export function extendBranchContinuation(
  branch: ConfirmedBranch,
  fromWord: string,
  nextEdge: ConfirmedEdge
): ConfirmedBranch | null {
  if (fromWord !== branchTip(branch)) {
    return null;
  }
  return { ...branch, continuation: [...branch.continuation, nextEdge] };
}

/**
 * Explore-path words plus the node key for each entry (indices aligned). Built
 * with the same ordering/dedup as the path the server validates against, so a
 * server `connectFromIndex` can be mapped back to a node key.
 */
export function buildExploreNodes(
  start: string,
  trunkEdges: ConfirmedEdge[],
  branches: ConfirmedBranch[]
): { path: string[]; keys: string[] } {
  const path = buildPathFromEdges(start, trunkEdges);
  const keys = path.map((_, index) => trunkNodeKey(index));
  const seen = new Set(path);

  for (const branch of branches) {
    if (!seen.has(branch.to)) {
      path.push(branch.to);
      keys.push(branchNodeKey(branch.id, 0));
      seen.add(branch.to);
    }
    branch.continuation.forEach((edge, index) => {
      if (!seen.has(edge.to)) {
        path.push(edge.to);
        keys.push(branchNodeKey(branch.id, index + 1));
        seen.add(edge.to);
      }
    });
  }

  return { path, keys };
}

export function buildExplorePath(
  start: string,
  trunkEdges: ConfirmedEdge[],
  branches: ConfirmedBranch[]
): string[] {
  return buildExploreNodes(start, trunkEdges, branches).path;
}

/** Words from `start` down to (and including) the node identified by `key`. */
export function ancestorWordsForKey(
  start: string,
  trunkEdges: ConfirmedEdge[],
  branches: ConfirmedBranch[],
  key: string
): string[] {
  if (!key.includes("#")) {
    const index = Number(key.slice(1));
    return buildPathFromEdges(start, trunkEdges).slice(0, index + 1);
  }

  const [branchId, posStr] = key.split("#");
  const position = Number(posStr);
  const branch = branches.find((item) => item.id === branchId);
  if (!branch) return buildPathFromEdges(start, trunkEdges);

  const base = ancestorWordsForKey(start, trunkEdges, branches, branchAnchorKey(branch));
  const chain = [branch.to, ...branch.continuation.slice(0, position).map((edge) => edge.to)];
  return [...base, ...chain];
}

/** Full winning path ending at the tip of `branch`, walking fork ancestors. */
export function buildWinPathToBranch(
  start: string,
  trunkEdges: ConfirmedEdge[],
  branches: ConfirmedBranch[],
  branch: ConfirmedBranch
): string[] {
  const base = ancestorWordsForKey(start, trunkEdges, branches, branchAnchorKey(branch));
  return [...base, branch.to, ...branch.continuation.map((edge) => edge.to)];
}
