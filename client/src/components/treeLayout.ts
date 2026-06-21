import type { ConfirmedBranch, ConfirmedEdge, Proximity } from "../../../shared/types";
import type { PathNodeVariant } from "./PathNode";
import { edgeLabelPoint, nodeVisualHeight, visualHeightForVariant } from "./treeGeometry";
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

/**
 * Ease-out exponent for proximity-driven spacing. Remaining distance to the
 * goal scales as (hopsToEnd / maxHops) ^ GAMMA, so the final approach collapses
 * sharply: 1 hop away renders very short, 2 hops moderate, early hops longer.
 * Higher values exaggerate the late compression.
 */
export const PROXIMITY_GAMMA = 2;

/** Connector length as a function of remaining hops, used for fallback spacing and the goal marker. */
export function edgeLengthForHops(hopsToEnd: number): number {
  if (hopsToEnd <= 1) return STUB_EDGE;
  return Math.round(STUB_EDGE + (CLOSER_EDGE - STUB_EDGE) * Math.min(1, (hopsToEnd - 1) / 3));
}

export function edgeSpacing(
  hopsToEnd?: number,
  proximity?: Proximity,
  _parentHopsToEnd?: number
): number {
  if (hopsToEnd === undefined) return REJECTED_EDGE;
  if (proximity === "farther" || proximity === "same") return STUB_EDGE;
  if (proximity === "closer") return edgeLengthForHops(hopsToEnd);
  return STUB_EDGE;
}

/** Space reserved between the current tip and the goal bar. */
export function goalLinkSpacing(hopsToEnd: number): number {
  return edgeLengthForHops(hopsToEnd);
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
  const remaining = Math.pow(Math.max(0, hopsToEnd) / maxHops, PROXIMITY_GAMMA);
  return goalAnchor - remaining * trunkRange;
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

/**
 * Minimum length for a labeled connector so the relation pill (centered on the
 * connector) does not overlap the node boxes. Applied to target placement; hard
 * overflow compression may still fall back to MIN_TRUNK_FILL to fit deep paths.
 */
export const LABEL_MIN_GAP = 26;

/** Extra space between the current tip glow and the goal bar. */
const GOAL_TIP_CLEARANCE = 20;
/** box-shadow on .path-node--current extends past layout height estimates. */
const SHADOW_BLEED = 8;

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

/** Span of extra length (px) added to the longest progress hop in scroll mode. */
const SCROLL_EASE_SPAN = 86;

/**
 * Eased weight for a progress edge: grows with the child's remaining hops, so
 * far-from-goal hops absorb more length and near-goal hops stay short. Range (0, 1].
 */
function progressWeight(childHops: number, routeMaxHops: number): number {
  if (routeMaxHops <= 0) return 1;
  const ratio = Math.min(1, Math.max(0, childHops) / routeMaxHops);
  return Math.pow(ratio, PROXIMITY_GAMMA);
}

/**
 * Edge spacings for a linear route from root.
 *
 * The connector length encodes proximity to the goal: the gap shrinks sharply as
 * the player nears the answer. The tip is anchored by its own remaining hops so
 * the gap to the goal bar reflects closeness (1 hop away sits right above it,
 * more hops float higher). The in-between gaps are distributed by an eased weight
 * so early hops render long and near-goal hops short. On desktop the route fills
 * the panel without overflowing; in scroll mode it keeps natural, graduated
 * lengths and may extend past the panel.
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
  const edgeCount = edgesForSpacing.length;

  const isStub = edgesForSpacing.map(
    (edge) => edge.proximity === "farther" || edge.proximity === "same"
  );
  const minGap = (index: number): number => (isStub[index] ? STUB_EDGE : LABEL_MIN_GAP);
  const weights = edgesForSpacing.map((edge, index) =>
    isStub[index] ? 0 : progressWeight(edge.hopsToEnd ?? initialHops, routeMaxHops)
  );
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  // Scroll mode: graduated lengths at a fixed scale, free to exceed the panel.
  if (scrollMode) {
    const maxWeight = Math.max(...weights, 1e-6);
    return edgesForSpacing.map((_, index) =>
      isStub[index] ? STUB_EDGE : LABEL_MIN_GAP + SCROLL_EASE_SPAN * (weights[index]! / maxWeight)
    );
  }

  // Anchor the tip by its own remaining hops so the gap to the goal reads as closeness.
  const goalAnchor = panelTreeBudget - BOTTOM_MARGIN - goalLinkSpacing(1);
  const trunkRange = Math.max(0, goalAnchor - startBottom);
  const maxTipBottom = maxTipBottomForPanel(panelTreeBudget);
  const tipHops = edgesForSpacing[edgeCount - 1]?.hopsToEnd ?? initialHops;
  const tipHeight = nodeHeights[edgeCount] ?? visualHeightForVariant("confirmed");
  const tipGapToGoal = progressWeight(tipHops, routeMaxHops) * trunkRange;
  const tipBottom = Math.min(goalAnchor - tipGapToGoal, maxTipBottom);
  const tipTop = tipBottom - tipHeight;

  // Total vertical space shared by all gaps once intermediate node heights are removed.
  let intermediateHeights = 0;
  for (let index = 1; index < edgeCount; index++) {
    intermediateHeights += nodeHeights[index] ?? visualHeightForVariant("confirmed");
  }
  const available = tipTop - startBottom - intermediateHeights;

  const baseTotal = edgesForSpacing.reduce((sum, _, index) => sum + minGap(index), 0);

  // Overflow: not enough room even for the minimum gaps — scale them down to fit.
  if (available <= baseTotal) {
    const scale = baseTotal > 0 ? Math.max(0, available) / baseTotal : 0;
    return edgesForSpacing.map((_, index) =>
      Math.max(MIN_TRUNK_FILL, minGap(index) * scale)
    );
  }

  // Distribute the surplus by eased weight: far hops grow, near-goal hops stay short.
  const surplus = available - baseTotal;
  return edgesForSpacing.map((_, index) => {
    if (isStub[index]) return STUB_EDGE;
    const share =
      totalWeight > 0 ? weights[index]! / totalWeight : 1 / Math.max(1, edgeCount);
    return LABEL_MIN_GAP + surplus * share;
  });
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

  const goalY = tip.y + visualHeightForVariant(tip.variant) + edgeLengthForHops(hopsToEnd);
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
