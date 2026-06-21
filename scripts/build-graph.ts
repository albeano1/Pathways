import Database from "better-sqlite3";
import { createGunzip } from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const CSV_PATH = path.join(DATA_DIR, "assertions.csv.gz");
const DB_PATH = path.join(DATA_DIR, "graph.db");

const CONCEPTNET_URL =
  "https://s3.amazonaws.com/conceptnet/downloads/2019/edges/conceptnet-assertions-5.7.0.csv.gz";

const ALLOWED_RELATIONS = new Set([
  "/r/RelatedTo",
  "/r/IsA",
  "/r/PartOf",
  "/r/HasA",
  "/r/Synonym",
  "/r/SimilarTo",
  "/r/UsedFor",
  "/r/AtLocation",
  "/r/CapableOf",
  "/r/HasProperty",
]);

const MAX_WORDS = 20_000;
const MIN_WEIGHT = 1.0;

interface ParsedEdge {
  relation: string;
  start: string;
  end: string;
  weight: number;
}

function parseConceptUri(uri: string): string | null {
  if (!uri.startsWith("/c/en/")) return null;
  const body = uri.slice("/c/en/".length);
  const slashIndex = body.indexOf("/");
  const lemma = slashIndex === -1 ? body : body.slice(0, slashIndex);
  if (!lemma || lemma.includes("_") || lemma.includes(" ")) return null;
  if (!/^[a-z0-9-]+$/i.test(lemma)) return null;
  return lemma.toLowerCase();
}

function parseLine(line: string): ParsedEdge | null {
  const parts = line.split("\t");
  if (parts.length < 5) return null;

  const relation = parts[1]!;
  if (!ALLOWED_RELATIONS.has(relation)) return null;

  const start = parseConceptUri(parts[2]!);
  const end = parseConceptUri(parts[3]!);
  if (!start || !end || start === end) return null;

  let weight = 1.0;
  try {
    const meta = JSON.parse(parts[4]!) as { weight?: number };
    weight = meta.weight ?? 1.0;
  } catch {
    return null;
  }

  if (weight < MIN_WEIGHT) return null;

  return { relation, start, end, weight };
}

async function downloadCsv(): Promise<void> {
  if (fs.existsSync(CSV_PATH)) {
    console.log("Using existing assertions file:", CSV_PATH);
    return;
  }

  console.log("Downloading ConceptNet assertions...");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const response = await fetch(CONCEPTNET_URL);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ConceptNet data: ${response.status}`);
  }

  const fileStream = fs.createWriteStream(CSV_PATH);
  const reader = response.body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    fileStream.write(Buffer.from(value));
  }

  await new Promise<void>((resolve, reject) => {
    fileStream.end(() => resolve());
    fileStream.on("error", reject);
  });

  console.log("Download complete.");
}

async function collectDegrees(): Promise<Map<string, number>> {
  const degrees = new Map<string, number>();

  const input = fs.createReadStream(CSV_PATH).pipe(createGunzip());
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  let lines = 0;
  for await (const line of rl) {
    lines++;
    if (lines % 500_000 === 0) console.log(`Pass 1: scanned ${lines.toLocaleString()} lines`);

    const edge = parseLine(line);
    if (!edge) continue;

    degrees.set(edge.start, (degrees.get(edge.start) ?? 0) + 1);
    degrees.set(edge.end, (degrees.get(edge.end) ?? 0) + 1);
  }

  console.log(`Pass 1 complete. Found ${degrees.size.toLocaleString()} English words.`);
  return degrees;
}

function selectTopWords(degrees: Map<string, number>): Set<string> {
  const sorted = [...degrees.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_WORDS)
    .map(([word]) => word);

  console.log(`Selected top ${sorted.length.toLocaleString()} words by connectivity.`);
  return new Set(sorted);
}

async function buildDatabase(selectedWords: Set<string>): Promise<void> {
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE words (
      id INTEGER PRIMARY KEY,
      lemma TEXT UNIQUE NOT NULL,
      label TEXT NOT NULL,
      degree INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE edges (
      from_id INTEGER NOT NULL,
      to_id INTEGER NOT NULL,
      relation TEXT NOT NULL,
      weight REAL NOT NULL
    );
    CREATE INDEX idx_edges_from ON edges(from_id);
    CREATE INDEX idx_edges_to ON edges(to_id);
    CREATE INDEX idx_edges_from_to ON edges(from_id, to_id);
    CREATE INDEX idx_words_lemma ON words(lemma);
    CREATE INDEX idx_words_degree ON words(degree);
  `);

  const insertWord = db.prepare(
    "INSERT OR IGNORE INTO words (lemma, label) VALUES (?, ?)"
  );
  const getWordId = db.prepare("SELECT id FROM words WHERE lemma = ?");
  const insertEdge = db.prepare(
    "INSERT INTO edges (from_id, to_id, relation, weight) VALUES (?, ?, ?, ?)"
  );

  const ensureWord = db.transaction((lemma: string) => {
    insertWord.run(lemma, lemma);
    return (getWordId.get(lemma) as { id: number }).id;
  });

  const input = fs.createReadStream(CSV_PATH).pipe(createGunzip());
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  let lines = 0;
  let edgeCount = 0;
  const seenPairs = new Set<string>();

  const insertBatch = db.transaction((edges: ParsedEdge[]) => {
    for (const edge of edges) {
      const fromId = ensureWord(edge.start);
      const toId = ensureWord(edge.end);
      insertEdge.run(fromId, toId, edge.relation.replace("/r/", ""), edge.weight);
      insertEdge.run(toId, fromId, edge.relation.replace("/r/", ""), edge.weight);
      edgeCount += 2;
    }
  });

  let batch: ParsedEdge[] = [];

  for await (const line of rl) {
    lines++;
    if (lines % 500_000 === 0) console.log(`Pass 2: scanned ${lines.toLocaleString()} lines`);

    const edge = parseLine(line);
    if (!edge) continue;
    if (!selectedWords.has(edge.start) || !selectedWords.has(edge.end)) continue;

    const pairKey = edge.start < edge.end ? `${edge.start}|${edge.end}|${edge.relation}` : `${edge.end}|${edge.start}|${edge.relation}`;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);

    batch.push(edge);
    if (batch.length >= 5000) {
      insertBatch(batch);
      batch = [];
    }
  }

  if (batch.length > 0) insertBatch(batch);

  const wordCount = (db.prepare("SELECT COUNT(*) AS count FROM words").get() as { count: number }).count;
  console.log(`Database built: ${wordCount.toLocaleString()} words, ${edgeCount.toLocaleString()} directed edges.`);

  db.exec(`
    UPDATE words SET degree = (
      SELECT COUNT(*) FROM edges e
      WHERE e.from_id = words.id OR e.to_id = words.id
    )
  `);

  const { mergeMorphologicalDuplicates } = await import("../server/src/lemmaMerge.js");
  mergeMorphologicalDuplicates(db);

  db.exec("ANALYZE");
  db.close();

  const optimized = new Database(DB_PATH);
  optimized.exec("VACUUM");
  optimized.close();

  const sizeMb = (fs.statSync(DB_PATH).size / (1024 * 1024)).toFixed(1);
  console.log(`Optimized database size: ${sizeMb} MB`);
}

async function main(): Promise<void> {
  const mini = process.argv.includes("--mini");

  if (mini) {
    console.log("Building mini seed graph for development...");
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

    const db = new Database(DB_PATH);
    db.exec(`
      CREATE TABLE words (id INTEGER PRIMARY KEY, lemma TEXT UNIQUE NOT NULL, label TEXT NOT NULL, degree INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE edges (from_id INTEGER NOT NULL, to_id INTEGER NOT NULL, relation TEXT NOT NULL, weight REAL NOT NULL);
      CREATE INDEX idx_edges_from ON edges(from_id);
      CREATE INDEX idx_edges_to ON edges(to_id);
      CREATE INDEX idx_edges_from_to ON edges(from_id, to_id);
      CREATE INDEX idx_words_lemma ON words(lemma);
      CREATE INDEX idx_words_degree ON words(degree);
    `);

    const insertWord = db.prepare("INSERT INTO words (lemma, label) VALUES (?, ?)");
    const insertEdge = db.prepare(
      "INSERT INTO edges (from_id, to_id, relation, weight) VALUES (?, ?, ?, ?)"
    );

    const seedEdges: Array<[string, string, string]> = [
      ["dog", "animal", "IsA"],
      ["cat", "animal", "IsA"],
      ["animal", "mammal", "IsA"],
      ["dog", "pet", "RelatedTo"],
      ["cat", "pet", "RelatedTo"],
      ["pet", "home", "AtLocation"],
      ["home", "house", "Synonym"],
      ["house", "building", "IsA"],
      ["building", "structure", "IsA"],
      ["water", "liquid", "IsA"],
      ["liquid", "fluid", "Synonym"],
      ["fluid", "substance", "IsA"],
      ["fire", "heat", "HasProperty"],
      ["heat", "energy", "RelatedTo"],
      ["energy", "power", "RelatedTo"],
      ["power", "electricity", "RelatedTo"],
      ["electricity", "light", "UsedFor"],
      ["light", "sun", "RelatedTo"],
      ["sun", "star", "IsA"],
      ["star", "space", "AtLocation"],
      ["space", "universe", "PartOf"],
      ["book", "story", "RelatedTo"],
      ["story", "narrative", "Synonym"],
      ["narrative", "text", "RelatedTo"],
      ["text", "word", "PartOf"],
      ["word", "language", "PartOf"],
      ["language", "communication", "UsedFor"],
      ["music", "sound", "RelatedTo"],
      ["sound", "wave", "RelatedTo"],
      ["wave", "ocean", "AtLocation"],
      ["ocean", "water", "RelatedTo"],
      ["tree", "plant", "IsA"],
      ["plant", "life", "RelatedTo"],
      ["life", "biology", "RelatedTo"],
      ["biology", "science", "PartOf"],
      ["science", "knowledge", "RelatedTo"],
      ["knowledge", "learning", "RelatedTo"],
      ["learning", "school", "AtLocation"],
      ["school", "education", "RelatedTo"],
      ["car", "vehicle", "IsA"],
      ["vehicle", "transport", "UsedFor"],
      ["transport", "travel", "RelatedTo"],
      ["travel", "journey", "Synonym"],
      ["journey", "road", "RelatedTo"],
      ["road", "path", "Synonym"],
      ["path", "trail", "Synonym"],
      ["food", "meal", "RelatedTo"],
      ["meal", "dinner", "RelatedTo"],
      ["dinner", "evening", "AtLocation"],
      ["evening", "night", "RelatedTo"],
      ["night", "dark", "HasProperty"],
      ["dark", "black", "RelatedTo"],
      ["black", "color", "IsA"],
      ["color", "red", "RelatedTo"],
      ["red", "apple", "HasProperty"],
      ["apple", "fruit", "IsA"],
      ["fruit", "food", "IsA"],
    ];

    const wordIds = new Map<string, number>();
    const ensureWord = (lemma: string) => {
      if (wordIds.has(lemma)) return wordIds.get(lemma)!;
      const result = insertWord.run(lemma, lemma);
      const id = Number(result.lastInsertRowid);
      wordIds.set(lemma, id);
      return id;
    };

    for (const [from, to, relation] of seedEdges) {
      const fromId = ensureWord(from);
      const toId = ensureWord(to);
      insertEdge.run(fromId, toId, relation, 2.0);
      insertEdge.run(toId, fromId, relation, 2.0);
    }

    const lemmas = [...wordIds.keys()].sort();
    for (let index = 0; index < lemmas.length; index++) {
      for (let step = 1; step <= 8; step++) {
        const from = lemmas[index]!;
        const to = lemmas[(index + step) % lemmas.length]!;
        if (from === to) continue;
        const fromId = wordIds.get(from)!;
        const toId = wordIds.get(to)!;
        insertEdge.run(fromId, toId, "RelatedTo", 1.0);
        insertEdge.run(toId, fromId, "RelatedTo", 1.0);
      }
    }

    db.exec(`
      UPDATE words SET degree = (
        SELECT COUNT(*) FROM edges e
        WHERE e.from_id = words.id OR e.to_id = words.id
      )
    `);

    const { mergeMorphologicalDuplicates } = await import("../server/src/lemmaMerge.js");
    mergeMorphologicalDuplicates(db);

    db.close();
    console.log("Mini graph written.");
    return;
  }

  await downloadCsv();
  const degrees = await collectDegrees();
  const selectedWords = selectTopWords(degrees);
  await buildDatabase(selectedWords);
  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
