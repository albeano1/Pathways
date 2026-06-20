import Database from "better-sqlite3";
import type { Proximity, ScoreRequest, ValidateStepResponse } from "../../shared/types.js";
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

  /** Pick a random lemma with at least `minDegree` graph connections. */
  getRandomLemma(minDegree = 2): string | null {
    const row = this.db
      .prepare(
        `SELECT w.lemma
         FROM words w
         WHERE (
           SELECT COUNT(*) FROM edges e
           WHERE e.from_id = w.id OR e.to_id = w.id
         ) >= ?
         ORDER BY RANDOM()
         LIMIT 1`
      )
      .get(minDegree) as { lemma: string } | undefined;

    return row?.lemma ?? null;
  }

  /** Pick two distinct random lemmas suitable for puzzle generation. */
  getRandomLemmaPair(minDegree = 2): [string, string] | null {
    const row = this.db
      .prepare(
        `SELECT w1.lemma AS start, w2.lemma AS end
         FROM words w1
         JOIN words w2 ON w2.id != w1.id
         WHERE (
           SELECT COUNT(*) FROM edges e
           WHERE e.from_id = w1.id OR e.to_id = w1.id
         ) >= ?
         AND (
           SELECT COUNT(*) FROM edges e
           WHERE e.from_id = w2.id OR e.to_id = w2.id
         ) >= ?
         ORDER BY RANDOM()
         LIMIT 1`
      )
      .get(minDegree, minDegree) as { start: string; end: string } | undefined;

    if (!row) return null;
    return [row.start, row.end];
  }

  /** Count lemmas with at least `minDegree` connections (stable ordering by lemma). */
  getEligibleLemmaCount(minDegree = 2): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM words w
         WHERE (
           SELECT COUNT(*) FROM edges e
           WHERE e.from_id = w.id OR e.to_id = w.id
         ) >= ?`
      )
      .get(minDegree) as { count: number };
    return row.count;
  }

  /** Nth eligible lemma in stable lemma order. */
  getEligibleLemmaAt(minDegree: number, offset: number): string | null {
    const row = this.db
      .prepare(
        `SELECT w.lemma
         FROM words w
         WHERE (
           SELECT COUNT(*) FROM edges e
           WHERE e.from_id = w.id OR e.to_id = w.id
         ) >= ?
         ORDER BY w.lemma
         LIMIT 1 OFFSET ?`
      )
      .get(minDegree, offset) as { lemma: string } | undefined;
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
