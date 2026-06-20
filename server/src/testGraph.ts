import Database from "better-sqlite3";
import { GraphService } from "./graph.js";

/** In-memory graph with a chain backbone and leaf nodes for endpoint degree. */
export function createPuzzleTestGraph(): GraphService {
  const db = new Database(":memory:");
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
    CREATE INDEX idx_words_degree ON words(degree);
  `);

  const insertWord = db.prepare("INSERT INTO words (lemma, label) VALUES (?, ?)");
  const insertEdge = db.prepare(
    "INSERT INTO edges (from_id, to_id, relation, weight) VALUES (?, ?, ?, ?)"
  );
  const idFor = db.prepare("SELECT id FROM words WHERE lemma = ?").pluck();

  const backbone = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india"];
  for (const word of backbone) {
    insertWord.run(word, word);
  }

  for (let index = 0; index < backbone.length; index++) {
    for (let leaf = 0; leaf < 7; leaf++) {
      const lemma = `leaf${index}_${leaf}`;
      insertWord.run(lemma, lemma);
    }
  }

  const connect = (from: string, to: string) => {
    const fromId = idFor.get(from) as number;
    const toId = idFor.get(to) as number;
    insertEdge.run(fromId, toId, "RelatedTo", 2);
    insertEdge.run(toId, fromId, "RelatedTo", 2);
  };

  for (let index = 0; index < backbone.length - 1; index++) {
    connect(backbone[index]!, backbone[index + 1]!);
  }

  for (let index = 0; index < backbone.length; index++) {
    for (let leaf = 0; leaf < 7; leaf++) {
      connect(backbone[index]!, `leaf${index}_${leaf}`);
    }
  }

  db.exec(`
    UPDATE words SET degree = (
      SELECT COUNT(*) FROM edges e
      WHERE e.from_id = words.id OR e.to_id = words.id
    )
  `);

  return GraphService.fromDatabase(db);
}
