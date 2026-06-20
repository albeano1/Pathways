import type { PathNodeVariant } from "./PathNode";
import type { PositionedNode } from "./treeLayout";

const HINT_H = 18;
const NODE_GAP = 5;
/** Matches .path-node__word padding, border, and text box from CSS. */
const WORD_PILL_H = 56;
/** Extra clearance for .path-node--current / --win-tip box-shadow glow. */
const ACTIVE_GLOW_H = 27;

function wordHeight(variant: PathNodeVariant): number {
  if (variant === "rejected") return 44;
  if (variant === "current" || variant === "win-tip") return WORD_PILL_H + ACTIVE_GLOW_H;
  return WORD_PILL_H;
}

function hasHint(variant: PathNodeVariant): boolean {
  return variant === "start" || variant === "target" || variant === "target-ghost";
}

export function visualHeightForVariant(variant: PathNodeVariant): number {
  const hint = hasHint(variant) ? HINT_H + NODE_GAP : 0;
  return hint + wordHeight(variant);
}

/** Y offset from node top to the bottom of the word pill (edge leaves here). */
export function nodeBottomY(node: PositionedNode): number {
  const hint = hasHint(node.variant) ? HINT_H + NODE_GAP : 0;
  return node.y + hint + wordHeight(node.variant);
}

/** Y offset from node top to the top of the word pill (edge arrives here). */
export function nodeWordTopY(node: PositionedNode): number {
  return node.y + (hasHint(node.variant) ? HINT_H + NODE_GAP : 0);
}

export interface EdgeAnchors {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function edgeAnchors(from: PositionedNode, to: PositionedNode): EdgeAnchors {
  return {
    x1: from.x,
    y1: nodeBottomY(from),
    x2: to.x,
    y2: nodeWordTopY(to),
  };
}

/** Place label midway along the visible connector, between node boxes. */
export function edgeLabelPoint(from: PositionedNode, to: PositionedNode): { x: number; y: number } {
  const { x1, y1, x2, y2 } = edgeAnchors(from, to);
  const t = 0.5;
  return {
    x: x1 + (x2 - x1) * t,
    y: y1 + (y2 - y1) * t,
  };
}

export function nodeVisualHeight(node: PositionedNode): number {
  return visualHeightForVariant(node.variant);
}
