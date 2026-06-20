/** Format ConceptNet relation for display (e.g. IsA -> Is a). */
export function formatRelation(relation: string): string {
  const spaced = relation.replace(/([A-Z])/g, " $1").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}
