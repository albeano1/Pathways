import type Database from "better-sqlite3";
import { generatePlurals, morphologicalVariants, singularizeCandidates } from "./wordForms.js";

interface WordRow {
  id: number;
  lemma: string;
  degree: number;
}

const MIN_JACCARD = 0.15;
const MAX_DEGREE_RATIO = 0.2;

function neighborSet(db: Database.Database, wordId: number): Set<number> {
  const rows = db
    .prepare(
      `SELECT CASE WHEN from_id = ? THEN to_id ELSE from_id END AS neighbor_id
       FROM edges WHERE from_id = ? OR to_id = ?`
    )
    .all(wordId, wordId, wordId) as Array<{ neighbor_id: number }>;
  return new Set(rows.map((row) => row.neighbor_id));
}

function neighborJaccard(db: Database.Database, leftId: number, rightId: number): number {
  const left = neighborSet(db, leftId);
  const right = neighborSet(db, rightId);
  if (left.size === 0 && right.size === 0) return 1;

  let intersection = 0;
  for (const id of left) {
    if (right.has(id)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function areMorphologicalPair(a: string, b: string, lemmaSet: Set<string>): boolean {
  if (a === b) return false;
  const exists = (lemma: string) => lemmaSet.has(lemma);
  return morphologicalVariants(a, exists).includes(b);
}

/** True when duplicate should collapse into canonical at build time. */
export function shouldMergeLemmaPair(
  canonical: WordRow,
  duplicate: WordRow,
  jaccard: number
): boolean {
  if (canonical.id === duplicate.id) return false;

  const degreeRatio = duplicate.degree / Math.max(canonical.degree, 1);
  if (degreeRatio <= MAX_DEGREE_RATIO) return true;
  if (jaccard >= MIN_JACCARD) return true;

  return false;
}

function pickCanonicalPair(
  a: WordRow,
  b: WordRow,
  lemmaSet: Set<string>
): [WordRow, WordRow] | null {
  if (!areMorphologicalPair(a.lemma, b.lemma, lemmaSet)) return null;

  if (singularizeCandidates(a.lemma).includes(b.lemma)) {
    return [b, a];
  }
  if (singularizeCandidates(b.lemma).includes(a.lemma)) {
    return [a, b];
  }

  if (generatePlurals(a.lemma).includes(b.lemma)) {
    return [a, b];
  }
  if (generatePlurals(b.lemma).includes(a.lemma)) {
    return [b, a];
  }

  return a.degree >= b.degree ? [a, b] : [b, a];
}

function resolveRedirect(redirects: Map<number, number>, id: number): number {
  let current = id;
  const seen = new Set<number>();
  while (redirects.has(current)) {
    if (seen.has(current)) break;
    seen.add(current);
    current = redirects.get(current)!;
  }
  return current;
}

function dedupeEdges(db: Database.Database): void {
  db.exec(`
    CREATE TABLE edges_dedup AS
    SELECT from_id, to_id, relation, MAX(weight) AS weight
    FROM edges
    GROUP BY from_id, to_id, relation;

    DROP TABLE edges;
    CREATE TABLE edges (
      from_id INTEGER NOT NULL,
      to_id INTEGER NOT NULL,
      relation TEXT NOT NULL,
      weight REAL NOT NULL
    );
    INSERT INTO edges SELECT * FROM edges_dedup;
    DROP TABLE edges_dedup;

    CREATE INDEX idx_edges_from ON edges(from_id);
    CREATE INDEX idx_edges_to ON edges(to_id);
    CREATE INDEX idx_edges_from_to ON edges(from_id, to_id);
  `);
}

function applyRedirects(db: Database.Database, redirects: Map<number, number>): number {
  if (redirects.size === 0) return 0;

  const words = db.prepare("SELECT id FROM words").all() as Array<{ id: number }>;
  const canonicalById = new Map<number, number>();
  for (const { id } of words) {
    canonicalById.set(id, resolveRedirect(redirects, id));
  }

  db.exec("CREATE TEMP TABLE id_map (id INTEGER PRIMARY KEY, canonical_id INTEGER NOT NULL)");
  const insertMap = db.prepare("INSERT INTO id_map (id, canonical_id) VALUES (?, ?)");
  const writeMap = db.transaction(() => {
    for (const [id, canonicalId] of canonicalById) {
      insertMap.run(id, canonicalId);
    }
  });
  writeMap();

  db.exec(`
    UPDATE edges SET from_id = (SELECT canonical_id FROM id_map WHERE id_map.id = edges.from_id);
    UPDATE edges SET to_id = (SELECT canonical_id FROM id_map WHERE id_map.id = edges.to_id);
    DELETE FROM edges WHERE from_id = to_id;
  `);

  dedupeEdges(db);

  const deleteMerged = db.prepare(
    "DELETE FROM words WHERE id IN (SELECT id FROM id_map WHERE id != canonical_id)"
  );
  const result = deleteMerged.run();

  db.exec("DROP TABLE id_map");
  db.exec(`
    UPDATE words SET degree = (
      SELECT COUNT(*) FROM edges e
      WHERE e.from_id = words.id OR e.to_id = words.id
    )
  `);

  return result.changes;
}

/** Collapse morphological duplicate lemmas into a canonical node. */
export function mergeMorphologicalDuplicates(db: Database.Database): number {
  const words = db.prepare("SELECT id, lemma, degree FROM words ORDER BY degree ASC").all() as WordRow[];
  const byLemma = new Map(words.map((word) => [word.lemma, word]));
  const lemmaSet = new Set(words.map((word) => word.lemma));
  const redirects = new Map<number, number>();
  const mergedPairs: Array<[string, string]> = [];

  for (const duplicate of words) {
    if (redirects.has(duplicate.id)) continue;

    const candidates = singularizeCandidates(duplicate.lemma);
    for (const candidateLemma of candidates) {
      const canonical = byLemma.get(candidateLemma);
      if (!canonical) continue;

      const pair = pickCanonicalPair(canonical, duplicate, lemmaSet);
      if (!pair) continue;

      const [keep, drop] = pair;
      if (drop.id === keep.id) continue;

      const resolvedKeep = resolveRedirect(redirects, keep.id);
      const resolvedDrop = resolveRedirect(redirects, drop.id);
      if (resolvedKeep === resolvedDrop) continue;

      const keepRow = words.find((word) => word.id === resolvedKeep);
      const dropRow = words.find((word) => word.id === resolvedDrop);
      if (!keepRow || !dropRow) continue;

      const degreeRatio = dropRow.degree / Math.max(keepRow.degree, 1);
      const jaccard =
        degreeRatio <= MAX_DEGREE_RATIO ? 0 : neighborJaccard(db, keepRow.id, dropRow.id);

      if (!shouldMergeLemmaPair(keepRow, dropRow, jaccard)) continue;

      redirects.set(dropRow.id, keepRow.id);
      mergedPairs.push([dropRow.lemma, keepRow.lemma]);
      break;
    }
  }

  const mergedCount = applyRedirects(db, redirects);

  if (mergedPairs.length > 0) {
    const preview = mergedPairs
      .slice(0, 8)
      .map(([from, to]) => `${from}→${to}`)
      .join(", ");
    console.log(
      `Merged ${mergedCount} morphological duplicate lemmas (${mergedPairs.length} pairs). Sample: ${preview}`
    );
  }

  return mergedCount;
}
