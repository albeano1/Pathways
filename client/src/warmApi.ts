/** Wake the API and precompute hop distances to the goal word. */
let warmPromise: Promise<void> | null = null;
let warmedEnd: string | null = null;

export function warmApi(end?: string): Promise<void> {
  const goal = end?.trim().toLowerCase() || null;
  if (goal && warmedEnd === goal) return Promise.resolve();
  if (goal && warmPromise) return warmPromise;

  const query = goal ? `?end=${encodeURIComponent(goal)}` : "";
  warmPromise = fetch(`/api/health${query}`, { cache: "no-store" })
    .then(() => {
      if (goal) warmedEnd = goal;
    })
    .catch(() => undefined)
    .finally(() => {
      warmPromise = null;
    });

  return warmPromise;
}
