import type { Puzzle, ScoreResponse, ValidateStepResponse } from "../../../shared/types";
import { getDebugPuzzleFromUrl } from "../debugPuzzle";

const API_BASE = "";

const SERVER_ERROR =
  "Could not reach the server. Check your connection and try again.";

async function readApiError(response: Response, fallback: string): Promise<string> {
  const text = await response.text();
  try {
    const body = JSON.parse(text) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // Ignore HTML or other non-JSON error bodies from the platform.
  }
  return fallback;
}

export async function fetchPuzzle(options?: {
  start?: string;
  end?: string;
  date?: string;
}): Promise<Puzzle> {
  const params = new URLSearchParams();

  if (options?.start && options?.end) {
    params.set("start", options.start);
    params.set("end", options.end);
  } else if (options?.date) {
    params.set("date", options.date);
  } else {
    const debug = getDebugPuzzleFromUrl();
    if (debug?.start && debug?.end) {
      params.set("start", debug.start);
      params.set("end", debug.end);
    }
  }

  const query = params.toString();
  const response = await fetch(`${API_BASE}/api/puzzle${query ? `?${query}` : ""}`, {
    cache: "no-store",
  });
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
): Promise<ValidateStepResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/validate-step`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, end, path }),
    });
  } catch {
    return {
      valid: false,
      failureType: "not_in_graph",
      error: SERVER_ERROR,
    };
  }

  if (!response.ok) {
    return {
      valid: false,
      failureType: "not_in_graph",
      error: await readApiError(response, SERVER_ERROR),
    };
  }

  try {
    const result = (await response.json()) as ValidateStepResponse;
    if (result.valid !== true) {
      return {
        valid: false,
        failureType: result.failureType ?? "no_edge",
        error: result.error ?? "That word does not connect.",
        connectsTo: result.connectsTo,
        canonicalWord: result.canonicalWord,
      };
    }
    return result;
  } catch {
    return {
      valid: false,
      failureType: "not_in_graph",
      error: SERVER_ERROR,
    };
  }
}

export async function scorePath(
  start: string,
  end: string,
  path: string[],
  stats?: { totalGuesses?: number; wrongGuesses?: number; solveTimeMs?: number }
): Promise<ScoreResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start, end, path, ...stats }),
    });
  } catch {
    return { valid: false, playerHops: path.length - 1, optimalHops: 0, error: SERVER_ERROR };
  }

  if (!response.ok) {
    return {
      valid: false,
      playerHops: path.length - 1,
      optimalHops: 0,
      error: await readApiError(response, SERVER_ERROR),
    };
  }

  return response.json() as Promise<ScoreResponse>;
}

export type {
  ConfirmedBranch,
  ConfirmedEdge,
  Puzzle,
  RejectedBranch,
  ScoreResponse,
} from "../../../shared/types";

export { buildPathFromEdges, branchTip, buildExplorePath, buildWinPathFromBranch } from "./pathUtils";
