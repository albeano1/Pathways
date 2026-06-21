import type { StepContextResponse, ValidateStepResponse } from "../../shared/types";
import { generatePlurals, singularizeCandidates } from "../../shared/wordForms";

const API_BASE = "";

declare global {
  interface Window {
    __pathwaysStepContextBoot?: Promise<StepContextResponse | null>;
  }
}

export function stepContextKey(end: string, path: string[], from?: string): string {
  const activeFrom =
    from?.trim().toLowerCase() ??
    path[path.length - 1]?.trim().toLowerCase() ??
    "";
  return `${end.trim().toLowerCase()}|${path.map((word) => word.trim().toLowerCase()).join(",")}|${activeFrom}`;
}

let cachedKey = "";
let cachedContext: StepContextResponse | null = null;
let inflightKey = "";
let inflight: Promise<StepContextResponse | null> | null = null;

export function getCachedStepLookup(
  end: string,
  path: string[],
  word: string,
  from?: string
): ValidateStepResponse | null {
  const key = stepContextKey(end, path, from);
  if (key !== cachedKey || !cachedContext) return null;
  return cachedContext.lookups[word.trim().toLowerCase()] ?? null;
}

/** True when the authoritative lookup table for this exact path is loaded. */
export function hasStepContext(end: string, path: string[], from?: string): boolean {
  return stepContextKey(end, path, from) === cachedKey && cachedContext !== null;
}

/**
 * Resolve a guess entirely from the prefetched lookup table, expanding the
 * typed word through singular/plural surface forms so input like "lines"
 * matches the "line" key. Returns null when the context is not loaded or the
 * word genuinely does not connect.
 */
export function resolveCachedStep(
  end: string,
  path: string[],
  word: string,
  from?: string
): ValidateStepResponse | null {
  const key = stepContextKey(end, path, from);
  if (key !== cachedKey || !cachedContext) return null;

  const lookups = cachedContext.lookups;
  const normalized = word.trim().toLowerCase();
  if (!normalized) return null;

  const direct = lookups[normalized];
  if (direct) return direct;

  const probes = new Set<string>([
    ...singularizeCandidates(normalized),
    ...generatePlurals(normalized),
  ]);

  for (const candidate of probes) {
    const hit = lookups[candidate];
    if (hit) {
      return { ...hit, canonicalWord: hit.canonicalWord ?? candidate };
    }
  }

  return null;
}

/** Words with precomputed valid guesses for the current explore path. */
export function getCachedLookupWords(end: string, path: string[], from?: string): string[] {
  const key = stepContextKey(end, path, from);
  if (key !== cachedKey || !cachedContext) return [];
  return Object.keys(cachedContext.lookups);
}

export async function prefetchStepContext(
  end: string,
  path: string[],
  from?: string
): Promise<void> {
  const key = stepContextKey(end, path, from);
  if (key === cachedKey && cachedContext) return;
  if (key === inflightKey && inflight) {
    await inflight;
    return;
  }

  inflightKey = key;
  inflight = loadStepContext(end, path, from)
    .then((context) => {
      if (context) {
        cachedKey = key;
        cachedContext = context;
      }
      return context;
    })
    .finally(() => {
      if (inflightKey === key) {
        inflightKey = "";
        inflight = null;
      }
    });

  await inflight;
}

async function loadStepContext(
  end: string,
  path: string[],
  from?: string
): Promise<StepContextResponse | null> {
  const key = stepContextKey(end, path, from);
  const boot = typeof window !== "undefined" ? window.__pathwaysStepContextBoot : undefined;
  if (boot && path.length === 1) {
    const bootContext = await boot;
    if (
      bootContext &&
      stepContextKey(bootContext.end, bootContext.path, bootContext.path[0]) === key
    ) {
      return bootContext;
    }
  }

  return fetchStepContext(end, path, from);
}

async function fetchStepContext(
  end: string,
  path: string[],
  from?: string
): Promise<StepContextResponse | null> {
  const params = new URLSearchParams({
    end: end.trim().toLowerCase(),
    path: path.map((word) => word.trim().toLowerCase()).join(","),
  });
  const activeFrom = from ?? path[path.length - 1];
  if (activeFrom) {
    params.set("from", activeFrom.trim().toLowerCase());
  }

  try {
    const response = await fetch(`${API_BASE}/api/step-context?${params.toString()}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as StepContextResponse;
  } catch {
    return null;
  }
}

export function clearStepContextCache(): void {
  cachedKey = "";
  cachedContext = null;
  inflightKey = "";
  inflight = null;
}
