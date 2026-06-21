import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = path.join(ROOT, "data/graph.db");

if (fs.existsSync(DB_PATH)) {
  const sizeMb = (fs.statSync(DB_PATH).size / (1024 * 1024)).toFixed(1);
  console.log(`Using existing graph database (${sizeMb} MB): ${DB_PATH}`);
  process.exit(0);
}

console.log("No graph database found — building from ConceptNet…");
const result = spawnSync("npm", ["run", "build:graph"], {
  cwd: ROOT,
  stdio: "inherit",
  shell: true,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
