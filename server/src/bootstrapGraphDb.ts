import fs from "node:fs";
import path from "node:path";

let cachedDbPath: string | null = null;

function bundledCandidates(): string[] {
  return [
    path.join(process.cwd(), "data", "graph.db"),
    path.join(process.cwd(), "netlify", "functions", "data", "graph.db"),
    path.join(process.cwd(), "..", "data", "graph.db"),
  ];
}

/** Locate graph.db and, on Lambda, copy it to /tmp for SQLite. */
export function bootstrapGraphDbPath(): string {
  if (cachedDbPath) return cachedDbPath;

  if (process.env.GRAPH_DB_PATH) {
    const configured = process.env.GRAPH_DB_PATH;
    const resolved = path.isAbsolute(configured)
      ? configured
      : path.resolve(process.cwd(), configured);
    if (fs.existsSync(resolved)) {
      cachedDbPath = resolved;
      return resolved;
    }
  }

  let source: string | null = null;
  for (const candidate of bundledCandidates()) {
    if (fs.existsSync(candidate)) {
      source = candidate;
      break;
    }
  }

  if (!source) {
    throw new Error(
      `Graph database not found (cwd=${process.cwd()}, checked ${bundledCandidates().join(", ")})`
    );
  }

  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const tmpPath = path.join("/tmp", "graph.db");
    const needsCopy =
      !fs.existsSync(tmpPath) ||
      fs.statSync(tmpPath).size !== fs.statSync(source).size;
    if (needsCopy) {
      fs.copyFileSync(source, tmpPath);
    }
    cachedDbPath = tmpPath;
    return tmpPath;
  }

  cachedDbPath = source;
  return source;
}

export function getDbPath(): string {
  return bootstrapGraphDbPath();
}
