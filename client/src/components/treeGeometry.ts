import type { PathNodeVariant } from "./PathNode";

interface GeometryNode {
  y: number;
  variant: PathNodeVariant;
}

/** Matches .path-node__word padding, border, and text box from CSS. */
const WORD_PILL_H = 56;
/** Start / goal pills with an inline label. */
const LABELED_PILL_H = 68;
/** Extra clearance for .path-node--current / --win-tip box-shadow glow. */
const ACTIVE_GLOW_H = 27;

function wordHeight(variant: PathNodeVariant): number {
  if (variant === "rejected") return 44;
  if (variant === "current" || variant === "win-tip") return WORD_PILL_H + ACTIVE_GLOW_H;
  if (variant === "start" || variant === "target" || variant === "target-ghost") {
    return LABELED_PILL_H;
  }
  return WORD_PILL_H;
}

export function visualHeightForVariant(variant: PathNodeVariant): number {
  return wordHeight(variant);
}

/** Y offset from node top to the bottom of the word pill (edge leaves here). */
export function nodeBottomY(node: GeometryNode): number {
  return node.y + wordHeight(node.variant);
}

/** Y offset from node top to the top of the word pill (edge arrives here). */
export function nodeWordTopY(node: GeometryNode): number {
  return node.y;
}

export interface EdgeAnchors {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function edgeAnchors(
  from: GeometryNode & { x: number },
  to: GeometryNode & { x: number }
): EdgeAnchors {
  return {
    x1: from.x,
    y1: nodeBottomY(from),
    x2: to.x,
    y2: nodeWordTopY(to),
  };
}

/** Place label midway along the visible connector, between node boxes. */
export function edgeLabelPoint(
  from: GeometryNode & { x: number },
  to: GeometryNode & { x: number }
): { x: number; y: number } {
  const { x1, y1, x2, y2 } = edgeAnchors(from, to);
  const t = 0.5;
  return {
    x: x1 + (x2 - x1) * t,
    y: y1 + (y2 - y1) * t,
  };
}

export function nodeVisualHeight(node: GeometryNode): number {
  return visualHeightForVariant(node.variant);
}
