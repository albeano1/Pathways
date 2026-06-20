import { getPuzzleDateKey } from "../../shared/dailyPuzzle";
import { readPuzzleCache } from "./puzzleCache";

/** Wake the Netlify function, load the graph, and precompute distances to today's goal. */
export function warmApi(end?: string): void {
  const goal =
    end?.trim().toLowerCase() ?? readPuzzleCache(getPuzzleDateKey())?.end;
  const query = goal ? `?end=${encodeURIComponent(goal)}` : "";
  void fetch(`/api/health${query}`).catch(() => {
    // Ignore warmup failures; validation will retry on submit.
  });
}
