import type { Proximity } from "../../../shared/types";
import type { PathNodeVariant } from "./PathNode";
import { LAYOUT_NODE_W, layoutNodeWidth, visualHeightForVariant } from "./treeGeometry";
import type { RenderGraphEdge, RenderGraphNode } from "./graphModel";

export interface PositionedNode {
  id: string;
  word: string;
  variant: PathNodeVariant;
  hopsToEnd: number;
  x: number;
  y: number;
}

export interface PositionedEdge {
  id: string;
  fromId: string;
  toId: string;
  relation?: string;
  rejected?: boolean;
  proximity?: Proximity;
  hopsToEnd?: number;
}

export interface GraphLayout {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  width: number;
  height: number;
  /** Positions for nodes that were not pinned (caller should persist). */
  newPositions: Array<{ id: string; x: number; y: number }>;
}

const NODE_W = LAYOUT_NODE_W;
const BASE_MIN_GAP = 40;
const BASE_ROW_GAP = 28;
const TOP_PAD = 0;
const BASE_START_GAP = 40;
const BASE_LAYER_GAP = 32;
const BASE_LABEL_CLEARANCE = 24;

export const CANVAS_PAD_X = 32;
export const CANVAS_PAD_TOP = 0;
export const CANVAS_PAD_BOTTOM = 16;
export const EDGE_BLEED_X = 48;
export const EDGE_BLEED_TOP = 0;
export const EDGE_BLEED_BOTTOM = 40;
/** @deprecated Use EDGE_BLEED_X */
export const EDGE_BLEED = EDGE_BLEED_X;
export const GOAL_BAR_HEIGHT = 88;

const COMPACT_CURVE_PAD = 14;
const COMPACT_STROKE_PAD = 3;
const COMPACT_CANVAS_PAD_BOTTOM = 4;
const COMPACT_EDGE_BLEED_BOTTOM = 4;
const COMPACT_BBOX_GAP = 8;

/** Tighter runs between large compact nodes. */
const COMPACT_GAP_SCALE = 0.38;

export function isCompactLayout(panelWidth: number, panelHeight = 0): boolean {
  if (panelWidth > 0 && panelWidth < 720) return true;
  if (panelHeight > 0 && panelHeight > panelWidth) return true;
  return false;
}

export function isHorizontalLayout(panelWidth: number, panelBudget: number): boolean {
  return panelWidth > 0 && panelBudget > 0 && panelWidth >= panelBudget;
}

/** Lock pill size; does not shrink as the graph grows. */
export function useFixedGraphScale(
  panelWidth: number,
  panelBudget: number,
  isMobile: boolean
): boolean {
  if (isHorizontalLayout(panelWidth, panelBudget)) return true;
  if (isMobile) return true;
  if (panelWidth <= 0 || panelBudget <= 0) return true;
  if (isCompactLayout(panelWidth, panelBudget)) return true;
  return false;
}

/** Scroll overflow instead of clipping (portrait / narrow vertical only). */
export function useScrollableGraph(
  panelWidth: number,
  panelBudget: number,
  isMobile: boolean
): boolean {
  if (isHorizontalLayout(panelWidth, panelBudget)) return false;
  return useFixedGraphScale(panelWidth, panelBudget, isMobile);
}

function layoutPadding(compact: boolean) {
  return {
    curvePad: compact ? COMPACT_CURVE_PAD : 52,
    strokePad: compact ? COMPACT_STROKE_PAD : 6,
    canvasBottom: compact ? COMPACT_CANVAS_PAD_BOTTOM : CANVAS_PAD_BOTTOM,
    bleedBottom: compact ? COMPACT_EDGE_BLEED_BOTTOM : EDGE_BLEED_BOTTOM,
    bboxGap: compact ? COMPACT_BBOX_GAP : null,
  };
}

export interface PinnedPosition {
  x: number;
  y: number;
}

function nodeHalfW(compact: boolean): number {
  return layoutNodeWidth(compact) / 2;
}

interface GraphExtents {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

/** Bounds of nodes plus room for curved edge bulge. */
export function measureGraphExtents(
  nodes: PositionedNode[],
  compact: boolean
): GraphExtents {
  const { curvePad, strokePad } = layoutPadding(compact);

  if (nodes.length === 0) {
    return { minX: 0, maxX: NODE_W, minY: 0, maxY: NODE_W, width: NODE_W, height: NODE_W };
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const hw = nodeHalfW(compact);

  for (const node of nodes) {
    const h = nodeHeight(node.variant, compact);
    minX = Math.min(minX, node.x - hw);
    maxX = Math.max(maxX, node.x + hw);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y + h);
  }

  const pad = curvePad + strokePad;
  minX -= pad;
  maxX += pad;
  minY -= strokePad;
  maxY += strokePad;

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function depthBelowStart(startHops: number, nodeHops: number): number {
  return Math.max(1, startHops - nodeHops);
}

function clutterScale(nodeCount: number): number {
  return 1 + Math.max(0, nodeCount - 5) * 0.12;
}

function spacing(nodeCount: number, compact = false) {
  const scale = compact ? 1 : clutterScale(nodeCount);
  const tight = compact ? COMPACT_GAP_SCALE : 1;
  return {
    minGap: Math.round(BASE_MIN_GAP * scale * tight),
    rowGap: Math.round(BASE_ROW_GAP * scale * tight),
    startGap: Math.round(BASE_START_GAP * scale * tight),
    layerGap: Math.round(BASE_LAYER_GAP * scale * tight),
    labelClearance: Math.round(BASE_LABEL_CLEARANCE * scale * tight),
  };
}

function buildAdjacency(edges: RenderGraphEdge[]) {
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();

  for (const edge of edges) {
    const parentList = parents.get(edge.toId) ?? [];
    parentList.push(edge.fromId);
    parents.set(edge.toId, parentList);

    const childList = children.get(edge.fromId) ?? [];
    childList.push(edge.toId);
    children.set(edge.fromId, childList);
  }

  return { parents, children };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function nodeHeight(variant: PathNodeVariant, compact: boolean): number {
  return visualHeightForVariant(variant, compact);
}

function overlapsNode(
  x: number,
  y: number,
  variant: PathNodeVariant,
  otherX: number,
  otherY: number,
  otherVariant: PathNodeVariant,
  minGap: number,
  nodeW: number,
  compact: boolean
): boolean {
  const hw = nodeW / 2 + minGap / 2;
  const hh = (nodeHeight(variant, compact) + nodeHeight(otherVariant, compact)) / 2 + minGap / 2;
  return Math.abs(x - otherX) < hw && Math.abs(y - otherY) < hh;
}

function pointToSegmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Penalty for sitting between two nodes that already share an edge. */
function betweenEdgePenalty(
  x: number,
  y: number,
  edges: RenderGraphEdge[],
  positions: Map<string, { x: number; y: number; variant: PathNodeVariant }>,
  nodeW: number
): number {
  let penalty = 0;

  for (const edge of edges) {
    const from = positions.get(edge.fromId);
    const to = positions.get(edge.toId);
    if (!from || !to) continue;

    const minX = Math.min(from.x, to.x);
    const maxX = Math.max(from.x, to.x);
    const sameBand = Math.abs(from.y - to.y) < 28 && Math.abs(y - from.y) < 36;

    if (sameBand && maxX - minX > nodeW && x > minX + nodeW * 0.35 && x < maxX - nodeW * 0.35) {
      penalty += 120;
    }

    const dist = pointToSegmentDistance(x, y, from.x, from.y, to.x, to.y);
    if (dist < nodeW * 0.45) {
      penalty += 40;
    }
  }

  return penalty;
}

function scoreCandidate(
  x: number,
  y: number,
  variant: PathNodeVariant,
  idealX: number,
  positions: Map<string, { x: number; y: number; variant: PathNodeVariant }>,
  edges: RenderGraphEdge[],
  minGap: number,
  nodeW: number,
  compact: boolean
): number {
  let score = Math.abs(x - idealX) * 0.5;

  for (const [, pos] of positions) {
    if (overlapsNode(x, y, variant, pos.x, pos.y, pos.variant, minGap, nodeW, compact)) {
      score += 500;
    }
  }

  score += betweenEdgePenalty(x, y, edges, positions, nodeW);
  return score;
}

function pickPlacementX(
  idealX: number,
  y: number,
  variant: PathNodeVariant,
  positions: Map<string, { x: number; y: number; variant: PathNodeVariant }>,
  edges: RenderGraphEdge[],
  minGap: number,
  panelWidth: number,
  nodeW: number,
  compact: boolean
): number {
  const step = nodeW + minGap;
  const maxOffset = Math.max(step * 4, panelWidth * 0.45);
  const candidates = [idealX];

  for (let offset = step; offset <= maxOffset; offset += step) {
    candidates.push(idealX + offset, idealX - offset);
  }

  let bestX = idealX;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const x of candidates) {
    const score = scoreCandidate(x, y, variant, idealX, positions, edges, minGap, nodeW, compact);
    if (score < bestScore) {
      bestScore = score;
      bestX = x;
    }
  }

  return bestX;
}

function computeDepthY(
  depth: number,
  startBottom: number,
  spacingValues: ReturnType<typeof spacing>,
  depthHeights: Map<number, number>,
  compact: boolean
): number {
  let y = startBottom + spacingValues.startGap;
  for (let d = 1; d < depth; d++) {
    const h = depthHeights.get(d) ?? nodeHeight("confirmed", compact);
    y += h + spacingValues.labelClearance + spacingValues.layerGap;
  }
  return y;
}

export function computeGraphLayout(
  nodes: RenderGraphNode[],
  edges: RenderGraphEdge[],
  panelBudget: number,
  initialHops: number,
  startWord: string,
  panelWidth = 720,
  pinned = new Map<string, PinnedPosition>()
): GraphLayout {
  if (nodes.length === 0) {
    return { nodes: [], edges: [], width: NODE_W, height: panelBudget, newPositions: [] };
  }

  const compact = isCompactLayout(panelWidth, panelBudget);
  const nodeW = layoutNodeWidth(compact);
  const space = spacing(nodes.length, compact);
  const { parents } = buildAdjacency(edges);

  const startNode = nodes.find((node) => node.word === startWord || node.variant === "start");
  const startHops = startNode?.hopsToEnd ?? initialHops;
  const startHeight = nodeHeight(startNode?.variant ?? "start", compact);
  const startTop = TOP_PAD;
  const startBottom = startTop + startHeight;

  const depthById = new Map<string, number>();
  if (startNode) depthById.set(startNode.id, 0);

  for (const node of nodes) {
    if (node.id === startNode?.id) continue;
    depthById.set(node.id, depthBelowStart(startHops, node.hopsToEnd));
  }

  const positions = new Map<string, { x: number; y: number; variant: PathNodeVariant }>();
  const newPositions: Array<{ id: string; x: number; y: number }> = [];

  for (const node of nodes) {
    const pin = pinned.get(node.id);
    if (pin) {
      positions.set(node.id, { x: pin.x, y: pin.y, variant: node.variant });
    }
  }

  const depthHeights = new Map<number, number>();
  for (const node of nodes) {
    const depth = depthById.get(node.id) ?? 1;
    const h = nodeHeight(node.variant, compact);
    depthHeights.set(depth, Math.max(depthHeights.get(depth) ?? 0, h));
  }

  const unpinned = nodes
    .filter((node) => !pinned.has(node.id))
    .sort((a, b) => a.createdAt - b.createdAt);

  if (startNode && !pinned.has(startNode.id)) {
    const childPins = (parents.get(startNode.id) ?? [])
      .map((id) => positions.get(id))
      .filter(Boolean) as Array<{ x: number; y: number }>;
    const x = childPins.length > 0 ? average(childPins.map((p) => p.x)) : 0;
    positions.set(startNode.id, { x, y: startTop, variant: startNode.variant });
    newPositions.push({ id: startNode.id, x, y: startTop });
  }

  for (const node of unpinned) {
    if (node.id === startNode?.id) continue;

    const depth = depthById.get(node.id) ?? 1;
    let y = computeDepthY(depth, startBottom, space, depthHeights, compact);

    const parentIds = parents.get(node.id) ?? [];
    const parentPositions = parentIds
      .map((id) => positions.get(id))
      .filter(Boolean) as Array<{ x: number; y: number; variant: PathNodeVariant }>;

    if (parentPositions.length > 0) {
      const parentBottom = Math.max(
        ...parentPositions.map((p) => p.y + nodeHeight(p.variant, compact))
      );
      y = Math.max(y, parentBottom + space.rowGap);
    }

    const rowNeighbors = [...positions.entries()].filter(
      ([, pos]) => Math.abs(pos.y - y) < space.rowGap
    );
    if (rowNeighbors.length > 0) {
      y = Math.max(y, ...rowNeighbors.map(([, pos]) => pos.y));
    }

    const idealX =
      parentPositions.length > 0
        ? average(parentPositions.map((p) => p.x))
        : 0;

    const x = pickPlacementX(idealX, y, node.variant, positions, edges, space.minGap, panelWidth, nodeW, compact);
    positions.set(node.id, { x, y, variant: node.variant });
    newPositions.push({ id: node.id, x, y });
  }

  if (startNode && positions.has(startNode.id) && !pinned.has(startNode.id)) {
    const childXs = nodes
      .filter((node) => parents.get(node.id)?.includes(startNode.id))
      .map((node) => positions.get(node.id)?.x)
      .filter((value): value is number => value !== undefined);
    if (childXs.length > 0) {
      const startPos = positions.get(startNode.id)!;
      startPos.x = average(childXs);
      const entry = newPositions.find((p) => p.id === startNode.id);
      if (entry) entry.x = startPos.x;
    }
  }

  let minX = 0;
  let maxX = nodeW;
  let maxBottom = startBottom;

  for (const [, pos] of positions) {
    minX = Math.min(minX, pos.x - nodeW / 2);
    maxX = Math.max(maxX, pos.x + nodeW / 2);
    maxBottom = Math.max(maxBottom, pos.y + nodeHeight(pos.variant, compact));
  }

  const gap = space.minGap;
  const startRawX =
    startNode && positions.has(startNode.id) ? positions.get(startNode.id)!.x : 0;
  const { canvasBottom, bboxGap: layoutBBoxGap } = layoutPadding(compact);
  const bboxGap = layoutBBoxGap ?? gap;
  const leftExtent = startRawX - minX + bboxGap;
  const rightExtent = maxX - startRawX + bboxGap;
  const contentSpan = maxX - minX;
  const width = compact
    ? Math.max(nodeW + bboxGap * 2, contentSpan + bboxGap * 2)
    : Math.max(nodeW + gap * 2, 2 * Math.max(leftExtent, rightExtent));
  const offsetX = compact ? bboxGap - minX : width / 2 - startRawX;

  const positionedNodes: PositionedNode[] = nodes.map((node) => {
    const pos = positions.get(node.id)!;
    return {
      id: node.id,
      word: node.word,
      variant: node.variant,
      hopsToEnd: node.hopsToEnd,
      x: pos.x + offsetX,
      y: pos.y,
    };
  });

  const extents = measureGraphExtents(positionedNodes, compact);
  const layoutWidth = Math.max(extents.width, width);

  const nodeById = new Map(positionedNodes.map((node) => [node.id, node]));
  const positionedEdges: PositionedEdge[] = [];

  edges.forEach((edge) => {
    const from = nodeById.get(edge.fromId);
    const to = nodeById.get(edge.toId);
    if (!from || !to) return;

    positionedEdges.push({
      id: edge.id,
      fromId: edge.fromId,
      toId: edge.toId,
      relation: edge.relation,
      rejected: edge.rejected,
      proximity: edge.proximity,
      hopsToEnd: edge.hopsToEnd,
    });
  });

  return {
    nodes: positionedNodes,
    edges: positionedEdges,
    width: layoutWidth,
    height: maxBottom + canvasBottom,
    /** Raw layout coords (before horizontal normalize); safe to persist on graph nodes. */
    newPositions,
  };
}

export function layoutGraphBottom(nodes: PositionedNode[], compact = false): number {
  if (nodes.length === 0) return 0;
  return Math.max(...nodes.map((node) => node.y + nodeHeight(node.variant, compact)));
}

export function layoutGraphTop(nodes: PositionedNode[]): number {
  if (nodes.length === 0) return 0;
  return Math.min(...nodes.map((node) => node.y));
}

export function graphCanvasSize(
  layout: GraphLayout,
  panelWidth = Number.POSITIVE_INFINITY,
  panelHeight = 0
): { width: number; height: number } {
  const compact = isCompactLayout(panelWidth, panelHeight);
  const { bleedBottom, canvasBottom } = layoutPadding(compact);
  const extents = measureGraphExtents(layout.nodes, compact);
  const contentTop = layoutGraphTop(layout.nodes);
  const contentBottom = layoutGraphBottom(layout.nodes, compact);
  const contentHeight = contentBottom - contentTop + canvasBottom;
  return {
    width: Math.max(extents.width, layout.width),
    height: contentHeight + EDGE_BLEED_TOP + bleedBottom,
  };
}

export function graphCanvasOffset(
  layout: GraphLayout,
  panelWidth = Number.POSITIVE_INFINITY,
  panelHeight = 0
): { x: number; y: number } {
  const compact = isCompactLayout(panelWidth, panelHeight);
  const extents = measureGraphExtents(layout.nodes, compact);
  const contentTop = layoutGraphTop(layout.nodes);
  const start = layout.nodes.find((node) => node.variant === "start");
  const canvasWidth = Math.max(extents.width, layout.width);
  const x =
    compact || !start ? -extents.minX : canvasWidth / 2 - start.x;
  return {
    x,
    y: EDGE_BLEED_TOP + CANVAS_PAD_TOP - contentTop,
  };
}
