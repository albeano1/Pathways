import {
  isEligiblePuzzleLemma,
  isScientificPuzzleLemma,
} from "../../shared/puzzleRules.js";
import { lemmaIsGeneralAudienceEndpoint } from "./dictionary.js";
import type { GraphService } from "./graph.js";

export interface PlayableEndpointIssue {
  lemma: string;
  reason: string;
}

export async function getPlayableEndpointIssues(
  lemma: string,
  graph: GraphService
): Promise<PlayableEndpointIssue[]> {
  const key = lemma.trim().toLowerCase();
  const issues: PlayableEndpointIssue[] = [];

  if (!isEligiblePuzzleLemma(key, graph.getLemmaDegree(key))) {
    issues.push({ lemma: key, reason: "ineligible lemma" });
  }
  if (isScientificPuzzleLemma(key)) {
    issues.push({ lemma: key, reason: "technical lemma" });
  }
  if (!(await lemmaIsGeneralAudienceEndpoint(key))) {
    issues.push({ lemma: key, reason: "non-general audience definition" });
  }

  return issues;
}

/** Fail fast when a generated puzzle has technical or inaccessible endpoints. */
export async function assertPlayablePuzzleEndpoints(
  start: string,
  end: string,
  graph: GraphService,
  context?: string
): Promise<void> {
  for (const lemma of [start, end]) {
    const issues = await getPlayableEndpointIssues(lemma, graph);
    if (issues.length === 0) continue;

    const label = context ? ` for ${context}` : "";
    const detail = issues.map((issue) => issue.reason).join(", ");
    throw new Error(`Unplayable endpoint "${lemma}"${label}: ${detail}`);
  }
}

/** Sync guard for committed static daily files (no graph/db lookup). */
export function assertSyncPlayableEndpointLemma(lemma: string, context?: string): void {
  const key = lemma.trim().toLowerCase();
  if (isScientificPuzzleLemma(key)) {
    const label = context ? ` (${context})` : "";
    throw new Error(`Technical endpoint "${key}"${label}`);
  }
}
