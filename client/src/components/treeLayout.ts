import type { ConfirmedBranch, ConfirmedEdge, Proximity } from "../../../shared/types";
import type { PathNodeVariant } from "./PathNode";
import { edgeLabelPoint, nodeBottomY, nodeVisualHeight, nodeWordTopY, visualHeightForVariant } from "./treeGeometry";
import type { RenderArm, RenderNode } from "./treeModel";

export interface LayoutNode {
  id: string;
  word: string;
  variant: PathNodeVariant;
  isNew?: boolean;
  children: LayoutChild[];
}

export interface LayoutChild {
  id: string;
  relation?: string;
  kind: RenderArm["kind"];
  hopsToEnd?: number;
  proximity?: Proximity;
  branchId?: string;
  branchEdgeIndex?: number;
  node: LayoutNode;
}

export interface PositionedNode {
  id: string;
  word: string;
  variant: PathNodeVariant;
  isNew?: boolean;
  x: number;
  y: number;
}

export interface PositionedEdge {
  id: string;
  relation?: string;
  kind: RenderArm["kind"];
  fromId: string;
  toId: string;
  labelX: number;
  labelY: number;
  hopsToEnd?: number;
  proximity?: Proximity;
}

export interface TreeLayout {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  width: number;
  height: number;
}

const NODE_W = 108;
const MIN_GAP = 24;
const BOTTOM_MARGIN = 20;

export const EDGE_MIN = 28;
export const EDGE_PER_HOP = 44;
export const CANVAS_PAD_X = 48;
export const CANVAS_PAD_TOP = 8;
export const CANVAS_PAD_BOTTOM = 0;
/** @deprecated Use CANVAS_PAD_TOP */
export const CANVAS_PAD_Y = CANVAS_PAD_TOP;
export const GOAL_BAR_HEIGHT = 88;

/** Uniform connector length for hops that move toward the goal. */
export const CLOSER_EDGE = 44;
const REJECTED_EDGE = 32;
const STUB_EDGE = 12;

export function edgeSpacing(
  hopsToEnd?: number,
  proximity?: Proximity,
  _parentHopsToEnd?: number
): number {
  if (hopsToEnd === undefined) return REJECTED_EDGE;
  if (proximity === "farther" || proximity === "same") return STUB_EDGE;
  if (proximity === "closer") return CLOSER_EDGE;
  return STUB_EDGE;
}

/** Space reserved between the current tip and the goal bar. */
export function goalLinkSpacing(hopsToEnd: number): number {
  if (hopsToEnd <= 1) return STUB_EDGE;
  return edgeSpacing(hopsToEnd, "closer");
}

/** Max scale across every route from the root — trunk and all branches. */
export function globalMaxHopsForTree(
  initialHops: number,
  trunkEdges: ConfirmedEdge[],
  branches: ConfirmedBranch[]
): number {
  let max = Math.max(initialHops, trunkEdges.length);
  for (const edge of trunkEdges) {
    if (edge.hopsToEnd !== undefined) {
      max = Math.max(max, edge.hopsToEnd);
    }
  }
  for (const branch of branches) {
    const edgeCount = 1 + branch.continuation.length;
    max = Math.max(max, edgeCount);
    if (branch.hopsToEnd !== undefined) {
      max = Math.max(max, branch.hopsToEnd);
    }
    for (const edge of branch.continuation) {
      if (edge.hopsToEnd !== undefined) {
        max = Math.max(max, edge.hopsToEnd);
      }
    }
  }
  return max;
}

/** @deprecated Prefer globalMaxHopsForTree when branches may exist. */
export function globalMaxHopsForPath(initialHops: number, edges: ConfirmedEdge[]): number {
  return globalMaxHopsForTree(initialHops, edges, []);
}

export function branchChainEdges(branch: ConfirmedBranch): ConfirmedEdge[] {
  return [
    {
      from: branch.from,
      to: branch.to,
      relation: branch.relation,
      hopsToEnd: branch.hopsToEnd,
      proximity: branch.proximity,
    },
    ...branch.continuation,
  ];
}

export function branchChainWords(branch: ConfirmedBranch): string[] {
  return [branch.from, branch.to, ...branch.continuation.map((edge) => edge.to)];
}

/** Target word-top Y from this route's hop distance and its own step count from root. */
export function targetWordTopForPathEdge(
  childHops: number,
  routeMaxHops: number,
  panelTreeBudget: number,
  startBottom: number,
  childHeight: number,
  isLastEdge: boolean
): number {
  const maxTipBottom = maxTipBottomForPanel(panelTreeBudget);
  if (isLastEdge && childHops === 1) {
    return maxTipBottom - childHeight;
  }
  const top = targetWordTopForHops(childHops, routeMaxHops, panelTreeBudget, startBottom);
  return Math.min(top, maxTipBottom - childHeight);
}

/** Target word-top Y for a node based on its hops-to-goal in the concept net. */
export function targetWordTopForHops(
  hopsToEnd: number,
  maxHops: number,
  panelTreeBudget: number,
  startBottom: number
): number {
  if (maxHops <= 0) return startBottom;
  const goalAnchor = panelTreeBudget - BOTTOM_MARGIN - goalLinkSpacing(1);
  const trunkRange = Math.max(0, goalAnchor - startBottom);
  const progress = (maxHops - hopsToEnd) / maxHops;
  return startBottom + progress * trunkRange;
}

/** Estimate node block heights for a linear chain (trunk or branch). */
function estimateChainNodeHeights(
  chainWords: string[],
  won: boolean,
  isActiveTip: boolean,
  forkVariant: PathNodeVariant = "start"
): number[] {
  const visible = won ? chainWords.slice(0, -1) : chainWords;
  return visible.map((_, index) => {
    if (index === 0) return visualHeightForVariant(forkVariant);
    if (!won && index === visible.length - 1 && isActiveTip) {
      return visualHeightForVariant("current");
    }
    if (won && index === visible.length - 1) return visualHeightForVariant("win-tip");
    return visualHeightForVariant("confirmed");
  });
}

/** Estimate trunk node block heights for spacing budget (one height per visible hop segment). */
export function estimateTrunkNodeHeights(
  path: string[],
  won: boolean,
  activeBranchId?: string
): number[] {
  return estimateChainNodeHeights(path, won, !activeBranchId);
}

/** Minimum trunk gap when the panel is too short to fit content. */
export const MIN_TRUNK_FILL = 8;

/** Extra space between the current tip glow and the goal bar. */
const GOAL_TIP_CLEARANCE = 20;
/** box-shadow on .path-node--current extends past layout height estimates. */
const SHADOW_BLEED = 8;

/** Enforce non-overlapping tops; each child sits at least MIN_TRUNK_FILL below its parent word bottom. */
function enforceMonotonicTops(
  tops: number[],
  nodeHeights: number[],
  startBottom: number,
  stubIndices: Set<number>
): number[] {
  const fitted = [...tops];
  let prevBottom = startBottom;
  for (let i = 0; i < fitted.length; i++) {
    const minTop = prevBottom + (stubIndices.has(i) ? STUB_EDGE : MIN_TRUNK_FILL);
    fitted[i] = Math.max(fitted[i] ?? minTop, minTop);
    prevBottom = fitted[i]! + (nodeHeights[i + 1] ?? visualHeightForVariant("confirmed"));
  }
  return fitted;
}

/** Pin the last hop below the goal line when the chain overflows and the tip is one hop out. */
function pinTrunkTopsToGoal(
  tops: number[],
  nodeHeights: number[],
  startBottom: number,
  maxTipBottom: number,
  stubIndices: Set<number>
): number[] {
  if (tops.length === 0) return tops;

  let fitted = enforceMonotonicTops(tops, nodeHeights, startBottom, stubIndices);
  const lastIdx = fitted.length - 1;
  const lastHeight = nodeHeights[lastIdx + 1] ?? visualHeightForVariant("current");
  const pinnedLastTop = maxTipBottom - lastHeight;
  fitted[lastIdx] = pinnedLastTop;

  for (let i = lastIdx - 1; i >= 0; i--) {
    const childHeight = nodeHeights[i + 1] ?? visualHeightForVariant("confirmed");
    const gap = stubIndices.has(i) ? STUB_EDGE : MIN_TRUNK_FILL;
    fitted[i] = Math.min(fitted[i] ?? pinnedLastTop, fitted[i + 1]! - childHeight - gap);
  }

  let prevBottom = startBottom;
  for (let i = 0; i < fitted.length; i++) {
    const minTop = prevBottom + (stubIndices.has(i) ? STUB_EDGE : MIN_TRUNK_FILL);
    fitted[i] =
      i === lastIdx
        ? Math.min(Math.max(fitted[i] ?? minTop, minTop), pinnedLastTop)
        : Math.max(fitted[i] ?? minTop, minTop);
    prevBottom = fitted[i]! + (nodeHeights[i + 1] ?? visualHeightForVariant("confirmed"));
  }

  if (prevBottom > maxTipBottom + 0.5 && lastIdx > 0) {
    const overflow = prevBottom - maxTipBottom;
    for (let i = 0; i < lastIdx; i++) {
      const floor = startBottom + (stubIndices.has(i) ? STUB_EDGE : MIN_TRUNK_FILL);
      fitted[i] = Math.max(floor, fitted[i]! - overflow);
    }
    prevBottom = startBottom;
    for (let i = 0; i < fitted.length; i++) {
      const minTop = prevBottom + (stubIndices.has(i) ? STUB_EDGE : MIN_TRUNK_FILL);
      fitted[i] = i === lastIdx ? pinnedLastTop : Math.max(fitted[i] ?? minTop, minTop);
      prevBottom = fitted[i]! + (nodeHeights[i + 1] ?? visualHeightForVariant("confirmed"));
    }
  }

  return fitted;
}

function tipBottomFromTops(
  tops: number[],
  nodeHeights: number[],
  startBottom: number
): number {
  if (tops.length === 0) return startBottom;
  const lastIdx = tops.length - 1;
  return tops[lastIdx]! + (nodeHeights[lastIdx + 1] ?? visualHeightForVariant("confirmed"));
}

/** Shrink the chain proportionally when it overflows but the tip is not yet on the final hop. */
function scaleTopsProportionally(
  tops: number[],
  nodeHeights: number[],
  startBottom: number,
  maxTipBottom: number,
  stubIndices: Set<number>
): number[] {
  const tipBottom = tipBottomFromTops(tops, nodeHeights, startBottom);
  if (tipBottom <= maxTipBottom) return tops;
  const anchor = startBottom;
  const scale = (maxTipBottom - anchor) / (tipBottom - anchor);
  const scaled = tops.map((top, i) => {
    const childHeight = nodeHeights[i + 1] ?? visualHeightForVariant("confirmed");
    const bottom = top + childHeight;
    const newBottom = anchor + (bottom - anchor) * scale;
    return newBottom - childHeight;
  });
  return enforceMonotonicTops(scaled, nodeHeights, startBottom, stubIndices);
}

/** Only compress when monotonic placement would cross the goal line. */
function compressIfOverflow(
  tops: number[],
  nodeHeights: number[],
  startBottom: number,
  maxTipBottom: number,
  stubIndices: Set<number>,
  lastChildHops: number
): number[] {
  const tipBottom = tipBottomFromTops(tops, nodeHeights, startBottom);
  if (tipBottom <= maxTipBottom) return tops;
  if (lastChildHops === 1) {
    return pinTrunkTopsToGoal(tops, nodeHeights, startBottom, maxTipBottom, stubIndices);
  }
  return scaleTopsProportionally(tops, nodeHeights, startBottom, maxTipBottom, stubIndices);
}

/** Lowest allowed bottom edge for the active path tip within the panel budget. */
export function maxTipBottomForPanel(panelTreeBudget: number): number {
  const tailGap = goalLinkSpacing(1);
  const goalLine = panelTreeBudget - BOTTOM_MARGIN - tailGap;
  return goalLine - GOAL_TIP_CLEARANCE - SHADOW_BLEED;
}

/** Split panel height evenly across all trunk gaps, including the final hop to goal. */
export function computeDistributedTrunkSpacing(
  nodeHeights: number[],
  totalBudget: number
): { trunk: number; goal: number } {
  const nodeTotal = nodeHeights.reduce((sum, height) => sum + height, 0);
  const gapCount = nodeHeights.length;
  if (gapCount === 0) return { trunk: CLOSER_EDGE, goal: CLOSER_EDGE };

  const available = totalBudget - nodeTotal;
  if (available <= 0) {
    return { trunk: MIN_TRUNK_FILL, goal: MIN_TRUNK_FILL };
  }

  const spacing = available / gapCount;
  return { trunk: spacing, goal: spacing };
}

function resolveProximity(
  hopsToEnd: number | undefined,
  proximity: Proximity | undefined,
  parentHopsToEnd: number | undefined
): Proximity | undefined {
  if (proximity) return proximity;
  if (hopsToEnd === undefined || parentHopsToEnd === undefined) return undefined;
  if (hopsToEnd < parentHopsToEnd) return "closer";
  if (hopsToEnd > parentHopsToEnd) return "farther";
  return "same";
}

export function layoutTreeBottom(nodes: PositionedNode[]): number {
  if (nodes.length === 0) return visualHeightForVariant("confirmed");
  return nodes.reduce((max, node) => Math.max(max, node.y + nodeVisualHeight(node)), 0);
}

export function layoutContentBottom(nodes: PositionedNode[]): number {
  return layoutTreeBottom(nodes) + BOTTOM_MARGIN;
}

export function treeCanvasSize(layout: TreeLayout): { width: number; height: number } {
  return {
    width: layout.width + CANVAS_PAD_X * 2,
    height: layoutTreeBottom(layout.nodes) + CANVAS_PAD_TOP + CANVAS_PAD_BOTTOM,
  };
}

function layoutFromBranch(
  branch: NonNullable<RenderArm["branch"]>,
  isActive: boolean | undefined,
  branchId: string
): LayoutNode {
  let tip: LayoutNode = {
    id: `${branch.id}-root`,
    word: branch.to,
    variant: isActive && branch.continuation.length === 0 ? "current" : "confirmed",
    children: [],
  };
  let parent = tip;

  for (let i = 0; i < branch.continuation.length; i++) {
    const edge = branch.continuation[i]!;
    const isLast = i === branch.continuation.length - 1;
    const child: LayoutNode = {
      id: `${branch.id}-${edge.to}-${i}`,
      word: edge.to,
      variant: isActive && isLast ? "current" : "confirmed",
      children: [],
    };
    parent.children = [
      {
        id: `${branch.id}-edge-${i}`,
        relation: edge.relation,
        kind: "confirmed",
        hopsToEnd: edge.hopsToEnd,
        proximity: edge.proximity,
        branchId,
        branchEdgeIndex: i + 1,
        node: child,
      },
    ];
    parent = child;
  }

  return tip;
}

function layoutFromRenderNode(node: RenderNode): LayoutNode {
  const children: LayoutChild[] = [];

  for (const arm of node.arms) {
    if (arm.kind === "rejected" && arm.rejected) {
      children.push({
        id: arm.id,
        kind: "rejected",
        node: {
          id: `${arm.id}-leaf`,
          word: arm.rejected.attempted,
          variant: "rejected",
          children: [],
        },
      });
      continue;
    }

    if (arm.kind === "confirmed" && arm.branch) {
      children.push({
        id: arm.id,
        relation: arm.relation,
        kind: "confirmed",
        hopsToEnd: arm.hopsToEnd,
        proximity: arm.proximity,
        branchId: arm.branch.id,
        branchEdgeIndex: 0,
        node: layoutFromBranch(arm.branch, arm.isActive, arm.branch.id),
      });
      continue;
    }

    if (arm.kind === "trunk" && arm.child) {
      children.push({
        id: arm.id,
        relation: arm.relation,
        kind: "trunk",
        hopsToEnd: arm.hopsToEnd,
        proximity: arm.proximity,
        node: layoutFromRenderNode(arm.child),
      });
    }
  }

  return {
    id: `node-${node.trunkIndex}-${node.word}`,
    word: node.word,
    variant: node.variant,
    isNew: node.isNew,
    children,
  };
}

interface MeasureResult {
  width: number;
}

function orderChildren(children: LayoutChild[]): LayoutChild[] {
  const trunk = children.filter((child) => child.kind === "trunk");
  const others = children.filter((child) => child.kind !== "trunk");
  if (trunk.length === 0) return others;
  if (others.length === 0) return trunk;
  const leftCount = Math.ceil(others.length / 2);
  return [...others.slice(0, leftCount), ...trunk, ...others.slice(leftCount)];
}

function measure(node: LayoutNode): MeasureResult {
  const children = orderChildren(node.children);
  if (children.length === 0) {
    return { width: NODE_W };
  }

  const childWidths = children.map((child) => measure(child.node));
  const total =
    childWidths.reduce((sum, item) => sum + item.width, 0) +
    MIN_GAP * Math.max(0, children.length - 1);

  return { width: Math.max(NODE_W, total) };
}

interface LayoutSpacing {
  /** Per trunk-edge index spacing; earlier edges stay fixed when the path grows. */
  trunkEdgeSpacings?: number[];
  /** Per-branch edge spacings keyed by branch id. */
  branchEdgeSpacings?: Record<string, number[]>;
}

function assign(
  node: LayoutNode,
  left: number,
  y: number,
  parentHopsToEnd: number | undefined,
  nodes: PositionedNode[],
  edges: PositionedEdge[],
  spacing: LayoutSpacing = {},
  trunkEdgeIndex = { value: 0 }
): number {
  const measured = measure(node);
  const x = left + measured.width / 2;
  const children = orderChildren(node.children);

  nodes.push({
    id: node.id,
    word: node.word,
    variant: node.variant,
    isNew: node.isNew,
    x,
    y,
  });

  const parentHeight = visualHeightForVariant(node.variant);

  if (children.length === 0) {
    return measured.width;
  }

  let cursor = left;
  for (const child of children) {
    const childWidth = measure(child.node).width;
    const proximity = resolveProximity(child.hopsToEnd, child.proximity, parentHopsToEnd);
    let spacingPx = edgeSpacing(child.hopsToEnd, proximity, parentHopsToEnd);
    if (child.kind === "trunk") {
      if (spacing.trunkEdgeSpacings && spacing.trunkEdgeSpacings[trunkEdgeIndex.value] !== undefined) {
        spacingPx = spacing.trunkEdgeSpacings[trunkEdgeIndex.value]!;
      }
      trunkEdgeIndex.value += 1;
    } else if (child.branchId !== undefined && child.branchEdgeIndex !== undefined) {
      const branchSpacings = spacing.branchEdgeSpacings?.[child.branchId];
      if (branchSpacings?.[child.branchEdgeIndex] !== undefined) {
        spacingPx = branchSpacings[child.branchEdgeIndex]!;
      }
    }
    const childY = y + parentHeight + spacingPx;
    assign(child.node, cursor, childY, child.hopsToEnd, nodes, edges, spacing, trunkEdgeIndex);

    edges.push({
      id: child.id,
      relation: child.relation,
      kind: child.kind,
      fromId: node.id,
      toId: child.node.id,
      labelX: 0,
      labelY: 0,
      hopsToEnd: child.hopsToEnd,
      proximity,
    });

    cursor += childWidth + MIN_GAP;
  }

  return measured.width;
}

function fixEdgeLabels(nodes: PositionedNode[], edges: PositionedEdge[]): void {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const edge of edges) {
    const from = byId.get(edge.fromId);
    const to = byId.get(edge.toId);
    if (!from || !to) continue;
    const label = edgeLabelPoint(from, to);
    edge.labelX = label.x;
    edge.labelY = label.y;
  }
}

/** Per-edge trunk spacing from confirmed hop metadata — frozen at guess time. */
export function trunkEdgeSpacingsFromPath(confirmedEdges: ConfirmedEdge[]): number[] {
  return confirmedEdges.map((edge) => edgeSpacing(edge.hopsToEnd, edge.proximity));
}

/**
 * Edge spacings for a linear route from root. Each route scales by its own hop count
 * and step count (edges.length); overflow compresses only when that route exceeds the panel.
 */
export function computeLinearEdgeSpacings(
  chainWords: string[],
  chainEdges: ConfirmedEdge[],
  panelTreeBudget: number,
  initialHops: number,
  won: boolean,
  isActiveTip: boolean,
  forkVariant: PathNodeVariant = "start",
  scrollMode = false
): number[] {
  if (chainWords.length <= 1 || chainEdges.length === 0) {
    return [];
  }

  const edgesForSpacing =
    won && chainEdges.length > 1 ? chainEdges.slice(0, -1) : chainEdges;
  if (edgesForSpacing.length === 0) {
    return [];
  }

  const routeMaxHops = globalMaxHopsForPath(initialHops, edgesForSpacing);
  const nodeHeights = estimateChainNodeHeights(chainWords, won, isActiveTip, forkVariant);
  const startBottom = nodeHeights[0] ?? visualHeightForVariant(forkVariant);
  const maxTipBottom = maxTipBottomForPanel(panelTreeBudget);
  const stubIndices = new Set<number>();
  const fittedTops: number[] = [];
  let parentWordBottom = startBottom;

  for (let edgeIndex = 0; edgeIndex < edgesForSpacing.length; edgeIndex++) {
    const edge = edgesForSpacing[edgeIndex]!;
    const childHops = edge.hopsToEnd ?? initialHops;
    const childHeight = nodeHeights[edgeIndex + 1] ?? visualHeightForVariant("confirmed");
    const isLastEdge = edgeIndex === edgesForSpacing.length - 1;

    if (edge.proximity === "farther" || edge.proximity === "same") {
      stubIndices.add(edgeIndex);
    }

    const cappedTarget = targetWordTopForPathEdge(
      childHops,
      routeMaxHops,
      panelTreeBudget,
      startBottom,
      childHeight,
      isLastEdge
    );

    let actualTop: number;
    if (edge.proximity === "farther" || edge.proximity === "same") {
      if (cappedTarget >= parentWordBottom) {
        actualTop = cappedTarget;
      } else {
        actualTop = parentWordBottom + STUB_EDGE;
      }
    } else {
      actualTop = Math.max(cappedTarget, parentWordBottom + MIN_TRUNK_FILL);
    }

    fittedTops.push(actualTop);
    parentWordBottom = actualTop + childHeight;
  }

  const lastChildHops =
    edgesForSpacing[edgesForSpacing.length - 1]?.hopsToEnd ?? initialHops;
  const compressedTops = scrollMode
    ? enforceMonotonicTops(fittedTops, nodeHeights, startBottom, stubIndices)
    : compressIfOverflow(
        fittedTops,
        nodeHeights,
        startBottom,
        maxTipBottom,
        stubIndices,
        lastChildHops
      );

  const spacings: number[] = [];
  parentWordBottom = startBottom;
  for (let edgeIndex = 0; edgeIndex < edgesForSpacing.length; edgeIndex++) {
    const edge = edgesForSpacing[edgeIndex]!;
    const childHeight = nodeHeights[edgeIndex + 1] ?? visualHeightForVariant("confirmed");
    const top = compressedTops[edgeIndex] ?? parentWordBottom + MIN_TRUNK_FILL;
    const step = top - parentWordBottom;
    spacings.push(step);
    parentWordBottom = top + childHeight;
  }

  return spacings;
}

export function computeTrunkEdgeSpacings(
  path: string[],
  confirmedEdges: ConfirmedEdge[],
  panelTreeBudget: number,
  _hopsToEnd: number,
  initialHops: number,
  won: boolean,
  activeBranchId?: string,
  scrollMode = false
): number[] {
  return computeLinearEdgeSpacings(
    path,
    confirmedEdges,
    panelTreeBudget,
    initialHops,
    won,
    !activeBranchId,
    "start",
    scrollMode
  );
}

export function computeBranchEdgeSpacings(
  branch: ConfirmedBranch,
  panelTreeBudget: number,
  initialHops: number,
  won: boolean,
  isActiveTip: boolean,
  scrollMode = false
): number[] {
  const forkVariant = branch.fromTrunkIndex === 0 ? "start" : "confirmed";
  return computeLinearEdgeSpacings(
    branchChainWords(branch),
    branchChainEdges(branch),
    panelTreeBudget,
    initialHops,
    won,
    isActiveTip,
    forkVariant,
    scrollMode
  );
}

export function computeTreeLayout(
  root: RenderNode,
  options?: {
    stripGoal?: boolean;
    end?: string;
    trunkEdgeSpacings?: number[];
    branchEdgeSpacings?: Record<string, number[]>;
  }
): TreeLayout {
  const layoutRoot = layoutFromRenderNode(root);
  const nodes: PositionedNode[] = [];
  const edges: PositionedEdge[] = [];
  const layoutSpacing: LayoutSpacing = {
    trunkEdgeSpacings: options?.trunkEdgeSpacings,
    branchEdgeSpacings: options?.branchEdgeSpacings,
  };
  const totalWidth = assign(layoutRoot, 0, 0, undefined, nodes, edges, layoutSpacing, { value: 0 });
  fixEdgeLabels(nodes, edges);

  let layout: TreeLayout = {
    nodes,
    edges,
    width: totalWidth,
    height: layoutContentBottom(nodes),
  };

  if (options?.stripGoal && options.end) {
    layout = stripGoalFromLayout(layout, options.end);
  }

  return layout;
}

/** On win, remove the final goal word node — the goal bar is the only goal UI. */
function stripGoalFromLayout(layout: TreeLayout, end: string): TreeLayout {
  const goalIds = new Set(
    layout.nodes
      .filter((node) => node.word === end && node.variant !== "rejected")
      .map((node) => node.id)
  );
  if (goalIds.size === 0) return layout;

  const parentIds = new Set(
    layout.edges.filter((edge) => goalIds.has(edge.toId)).map((edge) => edge.fromId)
  );

  const nodes = layout.nodes
    .filter((node) => !goalIds.has(node.id))
    .map((node) =>
      parentIds.has(node.id) ? { ...node, variant: "win-tip" as PathNodeVariant } : node
    );

  const edges = layout.edges.filter((edge) => !goalIds.has(edge.toId));

  return {
    nodes,
    edges,
    width: layout.width,
    height: layoutContentBottom(nodes),
  };
}

export function findTipNode(
  nodes: PositionedNode[],
  currentWord: string
): PositionedNode | undefined {
  const matches = nodes.filter((node) => node.word === currentWord);
  if (matches.length === 0) return undefined;
  return matches.reduce((deepest, node) => (node.y > deepest.y ? node : deepest));
}

/** Place the goal marker below the current tip — no connector; path is built only by guesses. */
export function appendGoalMarker(
  layout: TreeLayout,
  currentWord: string,
  end: string,
  hopsToEnd: number
): TreeLayout {
  const tip = findTipNode(layout.nodes, currentWord);
  if (!tip || hopsToEnd < 0) return layout;

  const goalId = "goal-ghost";
  if (layout.nodes.some((node) => node.id === goalId)) return layout;

  const goalY = tip.y + visualHeightForVariant(tip.variant) + edgeSpacing(hopsToEnd);
  const goalNode: PositionedNode = {
    id: goalId,
    word: end,
    variant: "target-ghost",
    x: tip.x,
    y: goalY,
  };

  return {
    nodes: [...layout.nodes, goalNode],
    edges: layout.edges,
    width: layout.width,
    height: layoutContentBottom([...layout.nodes, goalNode]),
  };
}
