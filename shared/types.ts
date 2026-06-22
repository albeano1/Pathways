export type Difficulty = "easy" | "medium" | "hard";

export type FailureType = "not_in_graph" | "no_edge" | "duplicate";

export type Proximity = "closer" | "farther" | "same";

export interface PathConnection {
  word: string;
  relation: string;
}

export interface Puzzle {
  id: string;
  start: string;
  end: string;
  optimalHops: number;
  difficulty: Difficulty;
  samplePath?: string[];
  /** YYYY-MM-DD in America/Los_Angeles */
  puzzleDate: string;
  /** ISO timestamp when the next daily puzzle unlocks */
  nextPuzzleAt: string;
}

export interface ValidateStepRequest {
  from: string;
  to: string;
  end: string;
  path?: string[];
}

/** One parent anchor the guess connects from on the explore path. */
export interface StepConnection {
  connectFromIndex: number;
  connectedFrom: string;
  relation: string;
  hopsToEnd: number;
  previousHopsToEnd: number;
  proximity: Proximity;
}

export interface ValidateStepResponse {
  valid: boolean;
  relation?: string;
  canonicalWord?: string;
  failureType?: FailureType;
  connectsTo?: PathConnection[];
  /** All path nodes the guess connects from (web semantics). */
  connections?: StepConnection[];
  hopsToEnd?: number;
  previousHopsToEnd?: number;
  proximity?: Proximity;
  connectedFrom?: string;
  connectFromIndex?: number;
  error?: string;
}

export interface GraphNode {
  id: string;
  word: string;
  hopsToEnd: number;
  createdAt: number;
  /** Persisted layout position (layout coordinate space). */
  layoutX?: number;
  layoutY?: number;
}

export interface GraphEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relation: string;
  proximity?: Proximity;
  hopsToEnd: number;
  rejected?: boolean;
}

/** Precomputed valid guesses for the current explore path. */
export interface StepContextResponse {
  end: string;
  path: string[];
  lookups: Record<string, ValidateStepResponse>;
}

export interface ConfirmedEdge {
  from: string;
  to: string;
  relation: string;
  proximity?: Proximity;
  hopsToEnd: number;
}

export interface ConfirmedBranch {
  id: string;
  from: string;
  fromTrunkIndex: number;
  /**
   * Node key this branch forks from. May reference a trunk node (`T<index>`) or
   * a node inside another branch (`<branchId>#<position>`), enabling forks off
   * any existing node. Optional for back-compat with legacy saved games.
   */
  fromKey?: string;
  to: string;
  relation: string;
  hopsToEnd?: number;
  proximity?: Proximity;
  continuation: ConfirmedEdge[];
}

export interface RejectedBranch {
  id: string;
  from: string;
  attempted: string;
  failureType: FailureType;
  connectsTo?: PathConnection[];
}

export interface ScoreRequest {
  start: string;
  end: string;
  path: string[];
  totalGuesses?: number;
  wrongGuesses?: number;
  solveTimeMs?: number;
}

export interface ScoreResponse {
  valid: boolean;
  playerHops: number;
  optimalHops: number;
  totalGuesses?: number;
  wrongGuesses?: number;
  correctGuesses?: number;
  solveTimeMs?: number;
  optimalPath?: string[];
  error?: string;
}

export interface HintResponse {
  hint?: string;
  optimalPath?: string[];
  optimalHops?: number;
  error?: string;
}

export interface WordSense {
  partOfSpeech?: string;
  definition: string;
}

export interface WordInfoResponse {
  lemma: string;
  inGraph: boolean;
  senses?: WordSense[];
  error?: string;
}
