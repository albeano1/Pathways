import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveRepoRoot(): string {
  const candidates = [
    path.resolve(__dirname, "../.."),
    path.resolve(__dirname, "../../.."),
    process.cwd(),
    path.resolve(process.cwd(), ".."),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "data", "graph.db"))) {
      return candidate;
    }
  }

  return path.resolve(__dirname, "../..");
}

export const ROOT = resolveRepoRoot();
export const DATA_DIR = path.join(ROOT, "data");
export const DB_PATH = path.join(DATA_DIR, "graph.db");
export const CLIENT_DIST = path.join(ROOT, "client/dist");
