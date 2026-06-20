import fs from "node:fs";
import path from "node:path";

/** Resolve graph.db without import.meta.url (breaks under Netlify esbuild bundles). */
function resolveDbPath(): string {
  if (process.env.GRAPH_DB_PATH) {
    const configured = process.env.GRAPH_DB_PATH;
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(process.cwd(), configured);
  }

  const candidates = [
    path.join(process.cwd(), "data", "graph.db"),
    path.join(process.cwd(), "..", "data", "graph.db"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return path.join(process.cwd(), "data", "graph.db");
}

export const DB_PATH = resolveDbPath();
export const ROOT = path.dirname(path.dirname(DB_PATH));
export const DATA_DIR = path.join(ROOT, "data");
export const CLIENT_DIST = path.join(ROOT, "client/dist");
