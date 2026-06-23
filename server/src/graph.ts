import Database from "better-sqlite3";
import fs from "node:fs";
import type { Proximity, ScoreRequest, ValidateStepResponse } from "../../shared/types.js";
import {
  BLOCKED_PUZZLE_LEMMAS,
  isEligiblePuzzleLemma,
  MAX_LEMMA_LENGTH,
  MAX_WORD_DEGREE,
  MIN_LEMMA_LENGTH,
  MIN_WORD_DEGREE,
} from "../../shared/puzzleRules.js";
import { getDbPath } from "./bootstrapGraphDb.js";
import {
  buildPluralAliasMap,
  inputSurfaceForms,
  morphologicalVariants,
  resolveLemmaWithAliases,
} from "./wordForms.js";

export class GraphService {
  private db: Database.Database;
  private wordIdCache = new Map<string, number>();
  private lemmaByIdCache = new Map<number, string>();
  private resolveLemmaCache = new Map<string, string | null>();
  private neighborIdsCache = new Map<number, number[]>();
  private neighborsCache = new Map<number, Array<{ word: string; relation: string }>>();
  private morphVariantsCache = new Map<string, string[]>();
  private edgeCache = new Map<string, { valid: boolean; relation?: string }>();
  private hopCache = new Map<string, number | null>();
  /** Hop distance to a puzzle end, keyed by resolved end lemma. */
  private endDistanceMaps = new Map<string, Map<number, number>>();
  private aliasMap!: Map<string, string>;
  private lemmaSet!: Set<string>;
  private hasDegreeColumn = false;
  private neighborIdStmt!: Database.Statement;
  private lemmaByIdStmt!: Database.Statement;
  private wordIdByLemmaStmt!: Database.Statement;
  private edgeBetweenStmt!: Database.Statement;
  private degreeByIdStmt!: Database.Statement;

  constructor(dbPath: string = getDbPath()) {
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Graph database not found at ${dbPath}`);
    }
    this.db = new Database(dbPath, { readonly: true, fileMustExist: true });
    this.db.pragma("journal_mode = OFF");
    this.db.pragma("mmap_size = 30000000000");
    this.db.pragma("cache_size = -64000");
    this.initStatements();
    this.initCaches();
  }

  /** @internal Test hook — supply an open in-memory database. */
  static fromDatabase(db: Database.Database): GraphService {
    const service = Object.create(GraphService.prototype) as GraphService;
    service.db = db;
    service.wordIdCache = new Map();
    service.lemmaByIdCache = new Map();
    service.resolveLemmaCache = new Map();
    service.neighborIdsCache = new Map();
    service.neighborsCache = new Map();
    service.morphVariantsCache = new Map();
    service.edgeCache = new Map();
    service.hopCache = new Map();
    service.endDistanceMaps = new Map();
    service.initStatements();
    service.initCaches();
    return service;
  }

  private initStatements(): void {
    this.neighborIdStmt = this.db.prepare(
      `SELECT CASE WHEN from_id = ? THEN to_id ELSE from_id END AS neighbor_id
       FROM edges WHERE from_id = ? OR to_id = ?`
    );
    this.lemmaByIdStmt = this.db.prepare("SELECT lemma FROM words WHERE id = ?");
    this.wordIdByLemmaStmt = this.db.prepare("SELECT id FROM words WHERE lemma = ?");
    this.edgeBetweenStmt = this.db.prepare(
      `SELECT relation FROM edges
       WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)
       ORDER BY weight DESC
       LIMIT 1`
    );
    this.degreeByIdStmt = this.db.prepare("SELECT degree FROM words WHERE id = ?");
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
      const row = this.degreeByIdStmt.get(id) as { degree: number } | undefined;
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
    const cached = this.neighborIdsCache.get(wordId);
    if (cached !== undefined) return cached;

    const rows = this.neighborIdStmt.all(wordId, wordId, wordId) as Array<{
      neighbor_id: number;
    }>;
    const neighborIds = rows.map((row) => row.neighbor_id);
    this.neighborIdsCache.set(wordId, neighborIds);
    return neighborIds;
  }

  private lemmaForId(wordId: number): string | null {
    const cached = this.lemmaByIdCache.get(wordId);
    if (cached !== undefined) return cached;

    const row = this.lemmaByIdStmt.get(wordId) as { lemma: string } | undefined;
    const lemma = row?.lemma ?? null;
    if (lemma !== null) {
      this.lemmaByIdCache.set(wordId, lemma);
      this.wordIdCache.set(lemma, wordId);
    }
    return lemma;
  }

  private edgeCacheKey(fromId: number, toId: number): string {
    return fromId < toId ? `${fromId}|${toId}` : `${toId}|${fromId}`;
  }

  private bfsHopCount(startLemma: string, endLemma: string): number | null {
    const startId = this.getWordId(startLemma);
    const endId = this.getWordId(endLemma);
    if (startId === null || endId === null) return null;
    if (startId === endId) return 0;

    const queue: number[] = [startId];
    let head = 0;
    const depthById = new Map<number, number>([[startId, 0]]);

    while (head < queue.length) {
      const current = queue[head++]!;
      const depth = depthById.get(current)!;
      if (current === endId) return depth;

      for (const neighborId of this.getNeighborIds(current)) {
        if (depthById.has(neighborId)) continue;
        depthById.set(neighborId, depth + 1);
        queue.push(neighborId);
      }
    }

    return null;
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

    const lookup = this.lemmaByIdStmt;
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
    const row = this.wordIdByLemmaStmt.get(lemma) as { id: number } | undefined;
    return row?.id ?? null;
  }

  /** Precompute hop distances from every reachable node to `end`. */
  warmEndDistances(end: string): void {
    const resolvedEnd = this.resolveLemma(end);
    if (!resolvedEnd) return;
    this.getDistanceFromEndMap(resolvedEnd);
  }

  private getDistanceFromEndMap(resolvedEnd: string): Map<number, number> {
    const cached = this.endDistanceMaps.get(resolvedEnd);
    if (cached) return cached;

    const endId = this.getWordId(resolvedEnd);
    const distMap = new Map<number, number>();
    if (endId === null) {
      this.endDistanceMaps.set(resolvedEnd, distMap);
      return distMap;
    }

    const queue: number[] = [endId];
    let head = 0;
    distMap.set(endId, 0);

    while (head < queue.length) {
      const current = queue[head++]!;
      const depth = distMap.get(current)!;
      for (const neighborId of this.getNeighborIds(current)) {
        if (distMap.has(neighborId)) continue;
        distMap.set(neighborId, depth + 1);
        queue.push(neighborId);
      }
    }

    this.endDistanceMaps.set(resolvedEnd, distMap);
    return distMap;
  }

  private distanceFromEnd(end: string, word: string): number | null {
    const resolvedEnd = this.resolveLemma(end);
    const resolvedWord = this.resolveLemma(word);
    if (!resolvedEnd || !resolvedWord) return null;
    if (resolvedEnd === resolvedWord) return 0;

    const wordId = this.getWordId(resolvedWord);
    if (wordId === null) return null;

    const hops = this.getDistanceFromEndMap(resolvedEnd).get(wordId);
    return hops ?? null;
  }

  resolveLemma(word: string): string | null {
    const normalized = this.normalize(word);
    const cached = this.resolveLemmaCache.get(normalized);
    if (cached !== undefined) return cached;

    const resolved = resolveLemmaWithAliases(
      word,
      this.lemmaSet,
      this.aliasMap,
      (lemma) => this.lookupLemma(lemma) !== null
    );
    this.resolveLemmaCache.set(normalized, resolved);
    return resolved;
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

    const cached = this.neighborsCache.get(id);
    if (cached !== undefined) return cached;

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

    const neighbors = rows.map((row) => ({ word: row.lemma, relation: row.relation }));
    this.neighborsCache.set(id, neighbors);
    return neighbors;
  }

  hasEdge(from: string, to: string): { valid: boolean; relation?: string } {
    const fromId = this.getWordId(from);
    const toId = this.getWordId(to);
    if (fromId === null || toId === null) return { valid: false };

    const cacheKey = this.edgeCacheKey(fromId, toId);
    const cached = this.edgeCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const row = this.edgeBetweenStmt.get(fromId, toId, toId, fromId) as
      | { relation: string }
      | undefined;

    const result = row ? { valid: true as const, relation: row.relation } : { valid: false as const };
    this.edgeCache.set(cacheKey, result);
    return result;
  }

  /** Match edges allowing singular/plural surface forms on either endpoint. */
  private hasMorphEdge(
    from: string,
    to: string
  ): { valid: boolean; relation?: string; fromLemma?: string; toLemma?: string } {
    for (const fromLemma of this.morphVariants(from)) {
      for (const toLemma of this.morphVariants(to)) {
        const edge = this.hasEdge(fromLemma, toLemma);
        if (edge.valid) {
          return { valid: true, relation: edge.relation, fromLemma, toLemma };
        }
      }
    }
    return { valid: false };
  }

  shortestPath(start: string, end: string): string[] | null {
    const startId = this.getWordId(start);
    const endId = this.getWordId(end);
    if (startId === null || endId === null) return null;
    if (startId === endId) return [this.normalize(start)];

    const queue: number[] = [startId];
    let head = 0;
    const visited = new Set<number>([startId]);
    const parent = new Map<number, number>();

    while (head < queue.length) {
      const current = queue[head++]!;
      if (current === endId) break;

      for (const neighborId of this.getNeighborIds(current)) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        parent.set(neighborId, current);
        queue.push(neighborId);
      }
    }

    if (!visited.has(endId)) return null;

    const ids: number[] = [];
    let current: number | undefined = endId;
    while (current !== undefined) {
      ids.unshift(current);
      current = parent.get(current);
    }

    return ids
      .map((id) => this.lemmaForId(id))
      .filter((lemma): lemma is string => lemma !== null);
  }

  shortestPathHops(start: string, end: string): number | null {
    const resolvedStart = this.resolveLemma(start);
    const resolvedEnd = this.resolveLemma(end);
    if (!resolvedStart || !resolvedEnd) return null;
    if (resolvedStart === resolvedEnd) return 0;

    const key = `${resolvedStart}|${resolvedEnd}`;
    if (this.hopCache.has(key)) {
      return this.hopCache.get(key)!;
    }

    const startId = this.getWordId(resolvedStart);
    if (startId !== null) {
      const fromEnd = this.getDistanceFromEndMap(resolvedEnd).get(startId);
      if (fromEnd !== undefined) {
        this.hopCache.set(key, fromEnd);
        return fromEnd;
      }
    }

    const hops = this.bfsHopCount(resolvedStart, resolvedEnd);
    this.hopCache.set(key, hops);
    return hops;
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

  private morphVariants(lemma: string): string[] {
    const cached = this.morphVariantsCache.get(lemma);
    if (cached !== undefined) return cached;

    const variants = morphologicalVariants(lemma, (candidate) => this.lookupLemma(candidate) !== null);
    this.morphVariantsCache.set(lemma, variants);
    return variants;
  }

  /**
   * Find every path node the guess connects to (web semantics — all parents).
   */
  private findPathConnections(
    resolvedPath: string[],
    toVariants: string[]
  ): Array<{ index: number; relation: string; connectedTo: string }> {
    const matches: Array<{ index: number; relation: string; connectedTo: string }> = [];

    for (let i = 0; i < resolvedPath.length; i++) {
      const candidate = resolvedPath[i]!;
      for (const variant of toVariants) {
        const candidateEdge = this.hasMorphEdge(candidate, variant);
        if (candidateEdge.valid) {
          matches.push({
            index: i,
            relation: candidateEdge.relation!,
            connectedTo: candidateEdge.toLemma ?? variant,
          });
          break;
        }
      }
    }

    return matches;
  }

  private buildStepConnection(
    resolvedPath: string[],
    resolvedEnd: string,
    match: { index: number; relation: string; connectedTo: string },
    childHopsToEnd: number | null
  ) {
    const resolvedFromNode = resolvedPath[match.index]!;
    const previousHopsToEnd = this.distanceFromEnd(resolvedEnd, resolvedFromNode);
    let proximity: Proximity = "same";

    if (
      previousHopsToEnd !== null &&
      childHopsToEnd !== null &&
      match.connectedTo !== resolvedEnd
    ) {
      if (childHopsToEnd < previousHopsToEnd) proximity = "closer";
      else if (childHopsToEnd > previousHopsToEnd) proximity = "farther";
    }

    return {
      connectFromIndex: match.index,
      connectedFrom: resolvedFromNode,
      relation: match.relation,
      hopsToEnd: childHopsToEnd ?? 0,
      previousHopsToEnd: previousHopsToEnd ?? 0,
      proximity,
    };
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

    const toVariants = this.morphVariants(resolvedTo);
    const duplicateVariant = toVariants.find((variant) => resolvedPath.includes(variant));
    const matches = this.findPathConnections(resolvedPath, toVariants);

    if (matches.length > 0) {
      const connectedTo = matches[0]!.connectedTo;
      const reachedGoal = connectedTo === resolvedEnd;
      const hopsToEnd = reachedGoal ? 0 : this.distanceFromEnd(resolvedEnd, connectedTo);
      const canonicalWord = connectedTo !== normalizedTo ? connectedTo : undefined;
      const connections = matches.map((match) =>
        this.buildStepConnection(resolvedPath, resolvedEnd, match, hopsToEnd)
      );
      const first = connections[0]!;

      return {
        valid: true,
        relation: first.relation,
        canonicalWord,
        connectedFrom: first.connectedFrom,
        connectFromIndex: first.connectFromIndex,
        connections,
        hopsToEnd: hopsToEnd ?? undefined,
        previousHopsToEnd: first.previousHopsToEnd,
        proximity: first.proximity,
      };
    }

    if (duplicateVariant) {
      return {
        valid: false,
        failureType: "duplicate",
        error:
          duplicateVariant !== normalizedTo
            ? `"${to}" matches "${duplicateVariant}", which is already in your path`
            : `"${to}" is already in your path`,
      };
    }

    const canonicalWord = resolvedTo !== normalizedTo ? resolvedTo : undefined;
    const connectsTo = resolvedPath
      .flatMap((word) =>
        toVariants
          .map((variant) => {
            const connection = this.hasMorphEdge(word, variant);
            return connection.valid
              ? {
                  word,
                  relation: connection.relation!,
                  variant: connection.toLemma ?? variant,
                }
              : null;
          })
          .filter((item): item is { word: string; relation: string; variant: string } => item !== null)
      )
      .filter(
        (item, index, list) =>
          list.findIndex((other) => other.word === item.word && other.variant === item.variant) ===
          index
      )
      .map(({ word, relation }) => ({ word, relation }));

    return {
      valid: false,
      failureType: "no_edge",
      canonicalWord,
      connectsTo: connectsTo.length > 0 ? connectsTo : undefined,
      error: "That word does not connect to your path.",
    };
  }

  /** Precompute valid guesses for every surface form that connects from the explore path. */
  buildStepLookups(
    end: string,
    path: string[] = [],
    from?: string
  ): Record<string, ValidateStepResponse> {
    this.warmEndDistances(end);
    const resolvedEnd = this.resolveLemma(end);
    const resolvedPath = path
      .map((word) => this.resolveLemma(word))
      .filter(Boolean) as string[];
    if (!resolvedEnd || resolvedPath.length === 0) return {};

    const activeFrom = this.resolveLemma(from ?? "") ?? resolvedPath[resolvedPath.length - 1] ?? "";
    const candidates = new Set<string>();

    for (const word of resolvedPath) {
      for (const { word: neighbor } of this.getNeighbors(word)) {
        for (const variant of this.morphVariants(neighbor)) {
          candidates.add(this.normalize(variant));
        }
      }
    }

    for (const variant of this.morphVariants(resolvedEnd)) {
      candidates.add(this.normalize(variant));
    }

    const lookups: Record<string, ValidateStepResponse> = {};
    for (const candidate of candidates) {
      const response = this.analyzeStep(activeFrom, candidate, end, path);
      if (response.valid !== true) continue;

      lookups[candidate] = response;
      const resolvedTo = this.resolveLemma(candidate) ?? candidate;
      const exists = (lemma: string) => this.lookupLemma(lemma) !== null;
      for (const variant of inputSurfaceForms(resolvedTo, exists)) {
        const key = this.normalize(variant);
        lookups[key] = {
          ...response,
          canonicalWord: resolvedTo !== key ? resolvedTo : response.canonicalWord,
        };
      }
    }

    return lookups;
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

    return {
      valid: true,
      playerHops,
      optimalHops,
      totalGuesses,
      wrongGuesses,
      correctGuesses,
      solveTimeMs,
    };
  }
}
