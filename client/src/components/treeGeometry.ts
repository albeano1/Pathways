import type { PathNodeVariant } from "./PathNode";

interface GeometryNode {
  y: number;
  variant: PathNodeVariant;
}

/** Matches .path-node__word padding, border, and text box from CSS. */
const WORD_PILL_H = 56;
const LABELED_PILL_H = 68;
const REJECTED_PILL_H = 44;
/** Extra clearance for .path-node--current / --win-tip box-shadow glow. */
const ACTIVE_GLOW_H = 27;

const COMPACT_WORD_PILL_H = 72;
const COMPACT_LABELED_PILL_H = 84;
const COMPACT_REJECTED_PILL_H = 56;
const COMPACT_ACTIVE_GLOW_H = 28;

export const LAYOUT_NODE_W = 124;
export const LAYOUT_NODE_W_COMPACT = 152;

export function layoutNodeWidth(compact = false): number {
  return compact ? LAYOUT_NODE_W_COMPACT : LAYOUT_NODE_W;
}

/** Approximate rendered pill width from CSS (min-width, padding, border, bold text). */
export function visualWidthForWord(
  word: string,
  variant: PathNodeVariant,
  compact = false
): number {
  const border = 6;
  const charWidth = compact ? 11 : 10.5;
  const paddingX = compact ? 40 : 40;
  const minWidth =
    variant === "rejected"
      ? compact
        ? 104
        : 80
      : variant === "start" || variant === "target" || variant === "target-ghost"
        ? compact
          ? 120
          : 96
        : compact
          ? 120
          : 96;

  return Math.max(minWidth, word.length * charWidth + paddingX + border);
}

function wordHeight(variant: PathNodeVariant, compact: boolean): number {
  if (variant === "rejected") return compact ? COMPACT_REJECTED_PILL_H : REJECTED_PILL_H;
  if (variant === "current" || variant === "win-tip") {
    return (compact ? COMPACT_WORD_PILL_H : WORD_PILL_H) + (compact ? COMPACT_ACTIVE_GLOW_H : ACTIVE_GLOW_H);
  }
  if (variant === "start" || variant === "target" || variant === "target-ghost") {
    return compact ? COMPACT_LABELED_PILL_H : LABELED_PILL_H;
  }
  return compact ? COMPACT_WORD_PILL_H : WORD_PILL_H;
}

export function visualHeightForVariant(variant: PathNodeVariant, compact = false): number {
  return wordHeight(variant, compact);
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
