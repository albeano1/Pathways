import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "data/graph.db");
const DEST_DIR = path.join(ROOT, "netlify/functions/data");
const DEST = path.join(DEST_DIR, "graph.db");

if (!fs.existsSync(SOURCE)) {
  console.error("Missing data/graph.db — run npm run build:graph first.");
  process.exit(1);
}

const sizeMb = (fs.statSync(SOURCE).size / (1024 * 1024)).toFixed(1);
fs.mkdirSync(DEST_DIR, { recursive: true });
fs.copyFileSync(SOURCE, DEST);
console.log(`Prepared Netlify function data (${sizeMb} MB): ${DEST}`);
