/** Distinct hues so each edge is easy to trace node-to-node. */
const TRACE_PALETTE = [
  "#e11d48",
  "#2563eb",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
  "#ea580c",
  "#4f46e5",
  "#0f766e",
  "#b45309",
  "#be123c",
  "#1d4ed8",
  "#047857",
];

export type PathwayLineStyle = {
  /** SVG stroke-dasharray; omit for solid. */
  dasharray?: string;
  linecap: CanvasLineCap;
  width?: number;
  /** Scaled dash cycle so the full motif fits in the legend swatch. */
  legendDasharray?: string;
};

/**
 * One visual family per pathway type — no dash-dot mashups.
 * Dashes use flat caps; dot patterns use round caps with zero-length dashes.
 */
export const PATHWAY_STYLES: Record<string, PathwayLineStyle> = {
  IsA: { linecap: "round" },
  Synonym: { dasharray: "14 8", linecap: "butt" },
  RelatedTo: { dasharray: "0 7", linecap: "round", width: 3.5 },
  PartOf: { dasharray: "22 7", linecap: "butt" },
  HasA: { dasharray: "9 10", linecap: "butt" },
  SimilarTo: { dasharray: "5 7", linecap: "butt" },
  UsedFor: {
    dasharray: "10 3 2 3 2 10",
    linecap: "butt",
    legendDasharray: "7 2 1.5 2 1.5 7",
  },
  AtLocation: { dasharray: "7 18", linecap: "butt" },
  CapableOf: { dasharray: "4 4", linecap: "square" },
  HasProperty: {
    dasharray: "3 8",
    linecap: "butt",
    width: 1.25,
    legendDasharray: "2.5 6",
  },
};

const DEFAULT_PATHWAY_STYLE: PathwayLineStyle = { dasharray: "8 8", linecap: "butt" };

/** Display order for the pathway legend. */
export const LEGEND_RELATIONS = [
  "IsA",
  "Synonym",
  "RelatedTo",
  "PartOf",
  "HasA",
  "SimilarTo",
  "UsedFor",
  "AtLocation",
  "CapableOf",
  "HasProperty",
] as const;

/** Wrong guesses: always solid red (not a ConceptNet pathway — omitted from legend). */
export const REJECTED_TRACE_COLOR = "#ef4444";
export const REJECTED_PATHWAY_STYLE: PathwayLineStyle = { linecap: "round" };

export const LEGEND_STROKE_COLOR = "#94a3b8";
export const DEFAULT_EDGE_WIDTH = 3;

export function traceColorForEdge(edgeId: string, index: number): string {
  let hash = index;
  for (let i = 0; i < edgeId.length; i++) {
    hash = (hash * 31 + edgeId.charCodeAt(i)) >>> 0;
  }
  return TRACE_PALETTE[hash % TRACE_PALETTE.length]!;
}

export function pathwayStyle(relation: string | undefined): PathwayLineStyle {
  if (!relation) return DEFAULT_PATHWAY_STYLE;
  return PATHWAY_STYLES[relation] ?? DEFAULT_PATHWAY_STYLE;
}
