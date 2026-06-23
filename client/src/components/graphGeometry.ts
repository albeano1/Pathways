import type { PositionedNode } from "./graphLayout";
import { isCompactLayout } from "./graphLayout";
import { visualHeightForVariant, visualWidthForWord } from "./treeGeometry";

function nodeCenter(node: PositionedNode, compact: boolean): { x: number; y: number } {
  const height = visualHeightForVariant(node.variant, compact);
  return { x: node.x, y: node.y + height / 2 };
}

function nodeHalfExtents(node: PositionedNode, compact: boolean): { hw: number; hh: number } {
  return {
    hw: visualWidthForWord(node.word, node.variant, compact) / 2,
    hh: visualHeightForVariant(node.variant, compact) / 2,
  };
}

/** Ray from node center toward `target`, stopped at the pill border. */
function anchorOnBorder(
  node: PositionedNode,
  target: { x: number; y: number },
  compact: boolean
): { x: number; y: number } {
  const center = nodeCenter(node, compact);
  const { hw, hh } = nodeHalfExtents(node, compact);
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) {
    return { x: center.x, y: center.y + hh };
  }

  const ux = dx / dist;
  const uy = dy / dist;
  const tX = ux !== 0 ? hw / Math.abs(ux) : Number.POSITIVE_INFINITY;
  const tY = uy !== 0 ? hh / Math.abs(uy) : Number.POSITIVE_INFINITY;
  const t = Math.min(tX, tY);

  return {
    x: center.x + ux * t,
    y: center.y + uy * t,
  };
}

export interface EdgeAnchors {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Anchor on each node border facing the other node. */
export function graphEdgeAnchors(
  from: PositionedNode,
  to: PositionedNode,
  compact = false
): EdgeAnchors {
  const toCenter = nodeCenter(to, compact);
  const fromCenter = nodeCenter(from, compact);
  const start = anchorOnBorder(from, toCenter, compact);
  const end = anchorOnBorder(to, fromCenter, compact);
  return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
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
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

function nodeCollisionRadius(node: PositionedNode, compact: boolean, padding = 10): number {
  const { hw, hh } = nodeHalfExtents(node, compact);
  return Math.max(hw, hh) + padding;
}

function segmentHitsNode(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  node: PositionedNode,
  compact: boolean,
  padding = 10
): boolean {
  const center = nodeCenter(node, compact);
  return (
    pointToSegmentDistance(center.x, center.y, x1, y1, x2, y2) <
    nodeCollisionRadius(node, compact, padding)
  );
}

function sampleQuadratic(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  t: number
): { x: number; y: number } {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

function curveHitsNodes(
  anchors: EdgeAnchors,
  control: { x: number; y: number },
  nodes: PositionedNode[],
  fromId: string,
  toId: string,
  compact: boolean
): number {
  let hits = 0;
  const p0 = { x: anchors.x1, y: anchors.y1 };
  const p2 = { x: anchors.x2, y: anchors.y2 };

  for (let step = 1; step < 10; step++) {
    const t = step / 10;
    const point = sampleQuadratic(p0, control, p2, t);
    const prev = sampleQuadratic(p0, control, p2, t - 0.1);

    for (const node of nodes) {
      if (node.id === fromId || node.id === toId) continue;
      if (segmentHitsNode(prev.x, prev.y, point.x, point.y, node, compact, 6)) {
        hits += 1;
      }
    }
  }

  return hits;
}

function pickControlPoint(
  anchors: EdgeAnchors,
  nodes: PositionedNode[],
  fromId: string,
  toId: string,
  compact: boolean
): { x: number; y: number } | null {
  const dx = anchors.x2 - anchors.x1;
  const dy = anchors.y2 - anchors.y1;
  const length = Math.hypot(dx, dy);
  if (length < 1) return null;

  const mx = (anchors.x1 + anchors.x2) / 2;
  const my = (anchors.y1 + anchors.y2) / 2;
  const straightHits = nodes.filter(
    (node) =>
      node.id !== fromId &&
      node.id !== toId &&
      segmentHitsNode(anchors.x1, anchors.y1, anchors.x2, anchors.y2, node, compact, 4)
  ).length;

  if (straightHits === 0 && Math.abs(dy) < 24) {
    return null;
  }

  const bulge = Math.min(72, Math.max(32, length * 0.28));
  const px = (-dy / length) * bulge;
  const py = (dx / length) * bulge;

  const options = [
    { x: mx + px, y: my + py },
    { x: mx - px, y: my - py },
  ];

  let best = options[0]!;
  let bestHits = curveHitsNodes(anchors, best, nodes, fromId, toId, compact);

  for (const option of options.slice(1)) {
    const hits = curveHitsNodes(anchors, option, nodes, fromId, toId, compact);
    if (hits < bestHits) {
      best = option;
      bestHits = hits;
    }
  }

  if (straightHits > 0) {
    return best;
  }

  return null;
}

export interface RoutedEdge {
  d: string;
}

export function routeGraphEdge(
  from: PositionedNode,
  to: PositionedNode,
  nodes: PositionedNode[],
  fromId: string,
  toId: string,
  panelWidth = Number.POSITIVE_INFINITY,
  panelHeight = 0
): RoutedEdge {
  const compact = isCompactLayout(panelWidth, panelHeight);
  const anchors = graphEdgeAnchors(from, to, compact);
  const control = pickControlPoint(anchors, nodes, fromId, toId, compact);

  if (control) {
    return {
      d: `M ${anchors.x1} ${anchors.y1} Q ${control.x} ${control.y} ${anchors.x2} ${anchors.y2}`,
    };
  }

  return {
    d: `M ${anchors.x1} ${anchors.y1} L ${anchors.x2} ${anchors.y2}`,
  };
}
