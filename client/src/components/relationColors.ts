export const RELATION_COLORS: Record<string, string> = {
  IsA: "#2563eb",
  PartOf: "#7c3aed",
  HasA: "#4f46e5",
  RelatedTo: "#475569",
  Synonym: "#0d9488",
  SimilarTo: "#0891b2",
  UsedFor: "#ea580c",
  AtLocation: "#ca8a04",
  CapableOf: "#db2777",
  HasProperty: "#9333ea",
};

export function relationColor(relation: string): string {
  return RELATION_COLORS[relation] ?? "#334155";
}
