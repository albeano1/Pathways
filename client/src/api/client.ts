import type { Puzzle } from "../../../shared/types";
import { getDebugPuzzleFromUrl } from "../debugPuzzle";

const API_BASE = "";

export async function fetchPuzzle(options?: {
  start?: string;
  end?: string;
}): Promise<Puzzle> {
  const debug = options?.start && options?.end
    ? { start: options.start, end: options.end }
    : getDebugPuzzleFromUrl();

  const params = new URLSearchParams();
  if (debug?.start && debug?.end) {
    params.set("start", debug.start);
    params.set("end", debug.end);
  }

  const query = params.toString();
  const response = await fetch(`${API_BASE}/api/puzzle${query ? `?${query}` : ""}`);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Failed to load puzzle");
  }
  return response.json() as Promise<Puzzle>;
}

export async function validateStep(
  from: string,
  to: string,
  end: string,
  path: string[]
) {
  const response = await fetch(`${API_BASE}/api/validate-step`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, end, path }),
  });
  return response.json();
}

export async function scorePath(
  start: string,
  end: string,
  path: string[],
  stats?: { totalGuesses?: number; wrongGuesses?: number; solveTimeMs?: number }
) {
  const response = await fetch(`${API_BASE}/api/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ start, end, path, ...stats }),
  });
  return response.json();
}

export type {
  ConfirmedBranch,
  ConfirmedEdge,
  Puzzle,
  RejectedBranch,
  ScoreResponse,
} from "../../../shared/types";

export { buildPathFromEdges, branchTip, buildExplorePath, buildWinPathFromBranch } from "./pathUtils";
