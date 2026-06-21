/** Wake the API and precompute hop distances to the goal word. */
export function warmApi(end?: string): Promise<void> {
  const goal = end?.trim().toLowerCase();
  const query = goal ? `?end=${encodeURIComponent(goal)}` : "";
  return fetch(`/api/health${query}`, { cache: "no-store" })
    .then(() => undefined)
    .catch(() => undefined);
}
