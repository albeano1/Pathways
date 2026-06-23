import type { GraphEdge, GraphNode } from "../../../shared/types";

function buildParentsByChild(edges: GraphEdge[]): Map<string, string[]> {
  const parentsByChild = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.rejected) continue;
    const parents = parentsByChild.get(edge.toNodeId) ?? [];
    parents.push(edge.fromNodeId);
    parentsByChild.set(edge.toNodeId, parents);
  }
  return parentsByChild;
}

function buildChildrenByParent(edges: GraphEdge[]): Map<string, string[]> {
  const childrenByParent = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.rejected) continue;
    const children = childrenByParent.get(edge.fromNodeId) ?? [];
    children.push(edge.toNodeId);
    childrenByParent.set(edge.fromNodeId, children);
  }
  return childrenByParent;
}

function pickDefaultParent(
  parents: string[],
  nodeById: Map<string, GraphNode>
): string {
  return parents.reduce((best, parentId) => {
    const bestNode = nodeById.get(best);
    const parentNode = nodeById.get(parentId);
    return (parentNode?.createdAt ?? 0) > (bestNode?.createdAt ?? 0) ? parentId : best;
  });
}

export function pathLabel(path: string[]): string {
  return path.join(" → ");
}

export function pathPrefixKey(prefix: string[]): string {
  return prefix.join("\0");
}

export function pathsMatchingPrefix(paths: string[][], prefix: string[]): string[][] {
  return paths.filter(
    (path) =>
      path.length >= prefix.length && prefix.every((word, index) => path[index] === word)
  );
}

function canReachNode(
  fromNodeId: string,
  targetNodeId: string,
  childrenByParent: Map<string, string[]>,
  cache: Map<string, boolean>
): boolean {
  if (fromNodeId === targetNodeId) return true;

  const cacheKey = `${fromNodeId}->${targetNodeId}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const visited = new Set<string>();
  const queue = [fromNodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === targetNodeId) {
      cache.set(cacheKey, true);
      return true;
    }
    if (visited.has(current)) continue;
    visited.add(current);
    for (const childId of childrenByParent.get(current) ?? []) {
      queue.push(childId);
    }
  }

  cache.set(cacheKey, false);
  return false;
}

/** Node ids at the end of a word prefix from start (handles reconverging branches). */
function resolveNodeIdsAtPrefix(
  nodes: GraphNode[],
  edges: GraphEdge[],
  startWord: string,
  prefix: string[]
): string[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const startNode = nodes.find((node) => node.word === startWord);
  if (!startNode || prefix.length === 0) return [];

  const childrenByParent = buildChildrenByParent(edges);
  let currentIds = [startNode.id];

  for (let index = 1; index < prefix.length; index++) {
    const word = prefix[index]!;
    const nextIds: string[] = [];
    for (const parentId of currentIds) {
      for (const childId of childrenByParent.get(parentId) ?? []) {
        const child = nodeById.get(childId);
        if (child?.word === word) {
          nextIds.push(childId);
        }
      }
    }
    currentIds = [...new Set(nextIds)];
    if (currentIds.length === 0) break;
  }

  return currentIds;
}

/** Distinct next words from this prefix that can still reach the current node. */
export function forkNextOptions(
  nodes: GraphNode[],
  edges: GraphEdge[],
  startWord: string,
  targetNodeId: string,
  prefix: string[]
): string[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParent = buildChildrenByParent(edges);
  const reachabilityCache = new Map<string, boolean>();
  const prefixNodeIds = resolveNodeIdsAtPrefix(nodes, edges, startWord, prefix);
  const nextWords = new Set<string>();

  for (const parentId of prefixNodeIds) {
    for (const childId of childrenByParent.get(parentId) ?? []) {
      if (!canReachNode(childId, targetNodeId, childrenByParent, reachabilityCache)) {
        continue;
      }
      const child = nodeById.get(childId);
      if (child) nextWords.add(child.word);
    }
  }

  return [...nextWords].sort((left, right) => left.localeCompare(right));
}

export function defaultForkChoices(
  nodes: GraphNode[],
  edges: GraphEdge[],
  startWord: string,
  targetNodeId: string,
  defaultPath: string[]
): Record<string, number> {
  const choices: Record<string, number> = {};
  for (let index = 0; index < defaultPath.length - 1; index++) {
    const prefix = defaultPath.slice(0, index + 1);
    const options = forkNextOptions(nodes, edges, startWord, targetNodeId, prefix);
    if (options.length <= 1) continue;
    const nextWord = defaultPath[index + 1];
    const optionIndex = nextWord ? options.indexOf(nextWord) : -1;
    choices[pathPrefixKey(prefix)] = optionIndex >= 0 ? optionIndex : 0;
  }
  return choices;
}

/** Walk from start using per-fork choices until the route reaches the current node. */
export function buildPathFromForkChoices(
  nodes: GraphNode[],
  edges: GraphEdge[],
  forkChoices: Record<string, number>,
  startWord: string,
  targetNodeId: string
): string[] {
  const startNode = nodes.find((node) => node.word === startWord);
  if (!startNode) return [startWord];
  if (startNode.id === targetNodeId) return [startWord];

  const result: string[] = [startWord];
  while (true) {
    const options = forkNextOptions(nodes, edges, startWord, targetNodeId, result);
    if (options.length === 0) break;

    const key = pathPrefixKey(result);
    const choiceIndex = forkChoices[key] ?? 0;
    const nextWord = options[Math.min(choiceIndex, options.length - 1)]!;
    result.push(nextWord);

    const atPrefixIds = resolveNodeIdsAtPrefix(nodes, edges, startWord, result);
    if (atPrefixIds.includes(targetNodeId)) break;
  }

  return result;
}

export function pathsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((word, index) => word === b[index]);
}

/** All confirmed routes from start to target (capped for performance). */
export function enumeratePathsToNode(
  nodes: GraphNode[],
  edges: GraphEdge[],
  startWord: string,
  targetNodeId: string,
  maxPaths = 16
): string[][] {
  const startNode = nodes.find((node) => node.word === startWord);
  if (!startNode) return [];
  if (targetNodeId === startNode.id) return [[startWord]];

  const childrenByParent = buildChildrenByParent(edges);
  const paths: string[][] = [];

  const visit = (nodeId: string, visited: Set<string>, chain: string[]) => {
    if (paths.length >= maxPaths) return;
    const node = nodes.find((entry) => entry.id === nodeId);
    if (!node || visited.has(nodeId)) return;

    const nextChain = [...chain, node.word];
    if (nodeId === targetNodeId) {
      paths.push(nextChain);
      return;
    }

    const nextVisited = new Set(visited);
    nextVisited.add(nodeId);
    for (const childId of childrenByParent.get(nodeId) ?? []) {
      visit(childId, nextVisited, nextChain);
    }
  };

  visit(startNode.id, new Set(), []);

  const defaultPath = buildActivePath(nodes, edges, startWord, targetNodeId);
  paths.sort((left, right) => {
    const leftDefault = pathsEqual(left, defaultPath);
    const rightDefault = pathsEqual(right, defaultPath);
    if (leftDefault !== rightDefault) return leftDefault ? -1 : 1;
    if (left.length !== right.length) return left.length - right.length;
    return pathLabel(left).localeCompare(pathLabel(right));
  });

  return paths;
}

/** Confirmed path from start to the current node (most recent parent chain). */
export function buildActivePath(
  nodes: GraphNode[],
  edges: GraphEdge[],
  startWord: string,
  currentNodeId: string
): string[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const startNode = nodes.find((node) => node.word === startWord);
  if (!startNode) return [];
  if (currentNodeId === startNode.id) return [startWord];

  const parentsByChild = buildParentsByChild(edges);

  const path: string[] = [];
  let current: string | undefined = currentNodeId;

  while (current) {
    const node = nodeById.get(current);
    if (!node) break;
    path.unshift(node.word);
    if (node.word === startWord) break;

    const parents = parentsByChild.get(current) ?? [];
    if (parents.length === 0) break;

    current = pickDefaultParent(parents, nodeById);
  }

  return path;
}

/** Node ids on the active path from start to current (for spine layout). */
export function activePathNodeIds(
  nodes: GraphNode[],
  edges: GraphEdge[],
  startWord: string,
  currentNodeId: string
): Set<string> {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const startNode = nodes.find((node) => node.word === startWord);
  if (!startNode) return new Set();

  const parentsByChild = buildParentsByChild(edges);

  const ids = new Set<string>();
  let current: string | undefined = currentNodeId;

  while (current) {
    ids.add(current);
    const node = nodeById.get(current);
    if (!node || node.word === startWord) break;
    const parents = parentsByChild.get(current) ?? [];
    if (parents.length === 0) break;
    current = pickDefaultParent(parents, nodeById);
  }

  return ids;
}
