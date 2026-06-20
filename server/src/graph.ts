import Database from "better-sqlite3";
import type { Proximity, ScoreRequest, ValidateStepResponse } from "../../shared/types.js";
import {
  BLOCKED_PUZZLE_LEMMAS,
  isEligiblePuzzleLemma,
  MAX_LEMMA_LENGTH,
  MAX_WORD_DEGREE,
  MIN_LEMMA_LENGTH,
  MIN_WORD_DEGREE,
} from "../../shared/puzzleRules.js";
import { DB_PATH } from "./paths.js";
import {
  buildPluralAliasMap,
  resolveLemmaWithAliases,
} from "./wordForms.js";

export class GraphService {
  private db: Database.Database;
  private wordIdCache = new Map<string, number>();
  private aliasMap!: Map<string, string>;
  private lemmaSet!: Set<string>;
  private hasDegreeColumn = false;

  constructor(dbPath: string = DB_PATH) {
    this.db = new Database(dbPath, { readonly: true });
    this.initCaches();
  }

  /** @internal Test hook — supply an open in-memory database. */
  static fromDatabase(db: Database.Database): GraphService {
    const service = Object.create(GraphService.prototype) as GraphService;
    service.db = db;
    service.wordIdCache = new Map();
    service.initCaches();
    return service;
  }

  private initCaches(): void {
    const lemmas = this.db
      .prepare("SELECT lemma FROM words")
      .all()
      .map((row) => (row as { lemma: string }).lemma);
    this.lemmaSet = new Set(lemmas);
    this.aliasMap = buildPluralAliasMap(lemmas);
    this.hasDegreeColumn =
      ((this.db
        .prepare("SELECT COUNT(*) AS count FROM pragma_table_info('words') WHERE name = 'degree'")
        .get() as { count: number }).count ?? 0) > 0;
  }

  getLemmaDegree(lemma: string): number {
    const id = this.getWordId(lemma);
    if (id === null) return 0;

    if (this.hasDegreeColumn) {
      const row = this.db
        .prepare("SELECT degree FROM words WHERE id = ?")
        .get(id) as { degree: number } | undefined;
      return row?.degree ?? 0;
    }

    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS degree FROM edges
         WHERE from_id = ? OR to_id = ?`
      )
      .get(id, id) as { degree: number };
    return row.degree;
  }

  isEligiblePuzzleEndpoint(lemma: string): boolean {
    return isEligiblePuzzleLemma(lemma, this.getLemmaDegree(lemma));
  }

  private eligibleWordSql(alias = "w"): string {
    if (this.hasDegreeColumn) {
      return `
        ${alias}.degree BETWEEN ? AND ?
        AND length(${alias}.lemma) BETWEEN ? AND ?
        AND ${alias}.lemma GLOB '[a-z]*'
        AND ${alias}.lemma NOT GLOB '*[^a-z]*'
      `;
    }

    return `
      (
        SELECT COUNT(*) FROM edges e
        WHERE e.from_id = ${alias}.id OR e.to_id = ${alias}.id
      ) BETWEEN ? AND ?
      AND length(${alias}.lemma) BETWEEN ? AND ?
      AND ${alias}.lemma GLOB '[a-z]*'
      AND ${alias}.lemma NOT GLOB '*[^a-z]*'
    `;
  }

  private eligibleBindParams(): [number, number, number, number] {
    return [MIN_WORD_DEGREE, MAX_WORD_DEGREE, MIN_LEMMA_LENGTH, MAX_LEMMA_LENGTH];
  }

  private blockedLemmaClause(alias = "w"): { sql: string; params: string[] } {
    const blocked = [...BLOCKED_PUZZLE_LEMMAS];
    if (blocked.length === 0) {
      return { sql: "", params: [] };
    }
    return {
      sql: `AND ${alias}.lemma NOT IN (${blocked.map(() => "?").join(", ")})`,
      params: blocked,
    };
  }

  private getNeighborIds(wordId: number): number[] {
    const rows = this.db
      .prepare(
        `SELECT CASE WHEN from_id = ? THEN to_id ELSE from_id END AS neighbor_id
         FROM edges WHERE from_id = ? OR to_id = ?`
      )
      .all(wordId, wordId, wordId) as Array<{ neighbor_id: number }>;
    return rows.map((row) => row.neighbor_id);
  }

  /** Lemmas exactly `hops` steps from `start` along shortest-path layers. */
  getReachableLemmasAtHopDistance(start: string, hops: number): string[] {
    const startId = this.getWordId(start);
    if (startId === null || hops < 1) return [];

    let currentLayer = new Set([startId]);
    const visited = new Set([startId]);

    for (let depth = 0; depth < hops; depth++) {
      const nextLayer = new Set<number>();
      for (const nodeId of currentLayer) {
        for (const neighborId of this.getNeighborIds(nodeId)) {
          if (visited.has(neighborId)) continue;
          visited.add(neighborId);
          nextLayer.add(neighborId);
        }
      }
      currentLayer = nextLayer;
      if (currentLayer.size === 0) return [];
    }

    const lookup = this.db.prepare("SELECT lemma FROM words WHERE id = ?");
    const lemmas: string[] = [];
    for (const id of currentLayer) {
      const row = lookup.get(id) as { lemma: string } | undefined;
      if (row && this.isEligiblePuzzleEndpoint(row.lemma)) {
        lemmas.push(row.lemma);
      }
    }

    return lemmas.sort();
  }

  normalize(word: string): string {
    return word.trim().toLowerCase();
  }

  private lookupLemma(lemma: string): number | null {
    const row = this.db
      .prepare("SELECT id FROM words WHERE lemma = ?")
      .get(lemma) as { id: number } | undefined;
    return row?.id ?? null;
  }

  resolveLemma(word: string): string | null {
    return resolveLemmaWithAliases(
      word,
      this.lemmaSet,
      this.aliasMap,
      (lemma) => this.lookupLemma(lemma) !== null
    );
  }

  getWordId(lemma: string): number | null {
    const resolved = this.resolveLemma(lemma);
    if (!resolved) return null;

    const cached = this.wordIdCache.get(resolved);
    if (cached !== undefined) return cached;

    const id = this.lookupLemma(resolved);
    if (id === null) return null;

    this.wordIdCache.set(resolved, id);
    return id;
  }

  wordExists(lemma: string): boolean {
    return this.getWordId(lemma) !== null;
  }

  getNeighbors(lemma: string): Array<{ word: string; relation: string }> {
    const id = this.getWordId(lemma);
    if (id === null) return [];

    const rows = this.db
      .prepare(
        `SELECT w.lemma, e.relation
         FROM edges e
         JOIN words w ON w.id = CASE WHEN e.from_id = ? THEN e.to_id ELSE e.from_id END
         WHERE e.from_id = ? OR e.to_id = ?
         GROUP BY w.lemma
         ORDER BY w.lemma`
      )
      .all(id, id, id) as Array<{ lemma: string; relation: string }>;

    return rows.map((row) => ({ word: row.lemma, relation: row.relation }));
  }

  hasEdge(from: string, to: string): { valid: boolean; relation?: string } {
    const fromId = this.getWordId(from);
    const toId = this.getWordId(to);
    if (fromId === null || toId === null) return { valid: false };

    const row = this.db
      .prepare(
        `SELECT relation FROM edges
         WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)
         ORDER BY weight DESC
         LIMIT 1`
      )
      .get(fromId, toId, toId, fromId) as { relation: string } | undefined;

    if (!row) return { valid: false };
    return { valid: true, relation: row.relation };
  }

  shortestPath(start: string, end: string): string[] | null {
    const startId = this.getWordId(start);
    const endId = this.getWordId(end);
    if (startId === null || endId === null) return null;
    if (startId === endId) return [this.normalize(start)];

    const queue: number[] = [startId];
    const visited = new Set<number>([startId]);
    const parent = new Map<number, number>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === endId) break;

      const neighbors = this.db
        .prepare(
          `SELECT CASE WHEN from_id = ? THEN to_id ELSE from_id END AS neighbor_id
           FROM edges WHERE from_id = ? OR to_id = ?`
        )
        .all(current, current, current) as Array<{ neighbor_id: number }>;

      for (const { neighbor_id } of neighbors) {
        if (visited.has(neighbor_id)) continue;
        visited.add(neighbor_id);
        parent.set(neighbor_id, current);
        queue.push(neighbor_id);
      }
    }

    if (!visited.has(endId)) return null;

    const ids: number[] = [];
    let current: number | undefined = endId;
    while (current !== undefined) {
      ids.unshift(current);
      current = parent.get(current);
    }

    const lemmas = this.db
      .prepare(`SELECT lemma FROM words WHERE id = ?`)
      .pluck();

    return ids.map((id) => lemmas.get(id) as string);
  }

  shortestPathHops(start: string, end: string): number | null {
    const path = this.shortestPath(start, end);
    if (!path) return null;
    return path.length - 1;
  }

  /** Count lemmas that qualify as puzzle endpoints (stable ordering by lemma). */
  getEligibleLemmaCount(): number {
    const blocked = this.blockedLemmaClause();
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM words w
         WHERE ${this.eligibleWordSql("w")}
         ${blocked.sql}`
      )
      .get(...this.eligibleBindParams(), ...blocked.params) as { count: number };
    return row.count;
  }

  /** Nth eligible lemma in stable lemma order. */
  getEligibleLemmaAt(offset: number): string | null {
    const blocked = this.blockedLemmaClause();
    const row = this.db
      .prepare(
        `SELECT w.lemma
         FROM words w
         WHERE ${this.eligibleWordSql("w")}
         ${blocked.sql}
         ORDER BY w.lemma
         LIMIT 1 OFFSET ?`
      )
      .get(...this.eligibleBindParams(), ...blocked.params, offset) as
      | { lemma: string }
      | undefined;
    return row?.lemma ?? null;
  }

  getWordCount(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM words").get() as {
      count: number;
    };
    return row.count;
  }

  isValidPath(start: string, end: string, path: string[]): boolean {
    if (path.length < 2) return false;

    const resolvedStart = this.resolveLemma(start);
    const resolvedEnd = this.resolveLemma(end);
    const resolvedPath = path.map((word) => this.resolveLemma(word));

    if (!resolvedStart || !resolvedEnd || resolvedPath.some((word) => !word)) return false;
    if (resolvedPath[0] !== resolvedStart) return false;
    if (resolvedPath[resolvedPath.length - 1] !== resolvedEnd) return false;

    const seen = new Set<string>();
    for (const word of resolvedPath) {
      if (seen.has(word!)) return false;
      seen.add(word!);
    }

    for (let i = 0; i < resolvedPath.length - 1; i++) {
      if (!this.hasEdge(resolvedPath[i]!, resolvedPath[i + 1]!).valid) return false;
    }

    return true;
  }

  analyzeStep(
    from: string,
    to: string,
    end: string,
    path: string[] = []
  ): ValidateStepResponse {
    const normalizedTo = this.normalize(to);
    const resolvedFrom = this.resolveLemma(from);
    const resolvedTo = this.resolveLemma(to);
    const resolvedEnd = this.resolveLemma(end);
    const resolvedPath = path.map((word) => this.resolveLemma(word)).filter(Boolean) as string[];

    if (!resolvedFrom || !resolvedEnd) {
      return {
        valid: false,
        failureType: "not_in_graph",
        error: `"${from}" or "${end}" is not in the word graph`,
      };
    }

    if (!resolvedTo) {
      return {
        valid: false,
        failureType: "not_in_graph",
        error: `"${to}" is not in the word graph`,
      };
    }

    if (resolvedPath.includes(resolvedTo)) {
      return {
        valid: false,
        failureType: "duplicate",
        error:
          resolvedTo !== normalizedTo
            ? `"${to}" matches "${resolvedTo}", which is already in your path`
            : `"${to}" is already in your path`,
      };
    }

    let connectFromIndex = -1;
    let connectRelation: string | undefined;
    for (let i = resolvedPath.length - 1; i >= 0; i--) {
      const candidate = resolvedPath[i]!;
      const candidateEdge = this.hasEdge(candidate, resolvedTo);
      if (candidateEdge.valid) {
        connectFromIndex = i;
        connectRelation = candidateEdge.relation;
        break;
      }
    }

    if (connectFromIndex >= 0 && connectRelation) {
      const resolvedFromNode = resolvedPath[connectFromIndex]!;
      const previousHopsToEnd = this.shortestPathHops(resolvedFromNode, resolvedEnd);
      const hopsToEnd = this.shortestPathHops(resolvedTo, resolvedEnd);
      const canonicalWord = resolvedTo !== normalizedTo ? resolvedTo : undefined;
      let proximity: Proximity | undefined;

      if (
        previousHopsToEnd !== null &&
        hopsToEnd !== null &&
        resolvedTo !== resolvedEnd
      ) {
        if (hopsToEnd < previousHopsToEnd) proximity = "closer";
        else if (hopsToEnd > previousHopsToEnd) proximity = "farther";
        else proximity = "same";
      }

      return {
        valid: true,
        relation: connectRelation,
        canonicalWord,
        connectedFrom: resolvedFromNode,
        connectFromIndex,
        hopsToEnd: hopsToEnd ?? undefined,
        previousHopsToEnd: previousHopsToEnd ?? undefined,
        proximity,
      };
    }

    const canonicalWord = resolvedTo !== normalizedTo ? resolvedTo : undefined;
    const connectsTo = resolvedPath
      .filter((word) => word !== resolvedFrom)
      .map((word) => {
        const connection = this.hasEdge(word, resolvedTo);
        return connection.valid
          ? { word, relation: connection.relation! }
          : null;
      })
      .filter((item): item is { word: string; relation: string } => item !== null);

    return {
      valid: false,
      failureType: "no_edge",
      canonicalWord,
      connectsTo: connectsTo.length > 0 ? connectsTo : undefined,
      error:
        canonicalWord !== undefined
          ? `"${to}" matches "${resolvedTo}", but it is not connected to "${from}"`
          : `"${to}" is not connected to "${from}"`,
    };
  }

  scorePath(
    start: string,
    end: string,
    path: string[],
    stats?: Pick<ScoreRequest, "totalGuesses" | "wrongGuesses" | "solveTimeMs">
  ) {
    const normalizedPath = path.map((word) => this.resolveLemma(word) ?? this.normalize(word));
    const valid = this.isValidPath(start, end, normalizedPath);
    const optimalHops = this.shortestPathHops(start, end);
    const playerHops = normalizedPath.length - 1;
    const totalGuesses = stats?.totalGuesses;
    const wrongGuesses = stats?.wrongGuesses ?? 0;
    const solveTimeMs = stats?.solveTimeMs;
    const correctGuesses =
      totalGuesses !== undefined ? Math.max(0, totalGuesses - wrongGuesses) : undefined;

    if (!valid || optimalHops === null) {
      return {
        valid: false,
        playerHops,
        optimalHops: optimalHops ?? 0,
        totalGuesses,
        wrongGuesses,
        correctGuesses,
        solveTimeMs,
        error: "Invalid path",
      };
    }

    const optimalPath = this.shortestPath(start, end) ?? undefined;

    return {
      valid: true,
      playerHops,
      optimalHops,
      totalGuesses,
      wrongGuesses,
      correctGuesses,
      solveTimeMs,
      optimalPath,
    };
  }
}
