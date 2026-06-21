import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPuzzleDateKey } from "../shared/dailyPuzzle.js";
import type { StepContextResponse } from "../shared/types.js";
import { GraphService } from "../server/src/graph.js";
import { PuzzleService } from "../server/src/puzzles.js";
import { getDbPath } from "../server/src/bootstrapGraphDb.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "client/public");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "daily-puzzle.json");
const STEP_CONTEXT_PATH = path.join(OUTPUT_DIR, "daily-step-context.json");

async function main(): Promise<void> {
  if (!fs.existsSync(getDbPath())) {
    console.warn("Skipping daily puzzle embed — data/graph.db not found.");
    return;
  }

  const puzzleDate = getPuzzleDateKey();
  const graph = new GraphService();
  const puzzles = new PuzzleService(graph);
  const puzzle = puzzles.getDaily(puzzleDate);
  const publicPuzzle = {
    id: puzzle.id,
    start: puzzle.start,
    end: puzzle.end,
    optimalHops: puzzle.optimalHops,
    difficulty: puzzle.difficulty,
    puzzleDate: puzzle.puzzleDate,
    nextPuzzleAt: puzzle.nextPuzzleAt,
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(publicPuzzle)}\n`);

  const stepContext: StepContextResponse = {
    end: puzzle.end,
    path: [puzzle.start],
    lookups: graph.buildStepLookups(puzzle.end, [puzzle.start], puzzle.start),
  };
  fs.writeFileSync(STEP_CONTEXT_PATH, `${JSON.stringify(stepContext)}\n`);

  console.log(
    `Embedded daily puzzle for ${puzzleDate}: ${puzzle.start} → ${puzzle.end} (${puzzle.optimalHops} hops, ${
      Object.keys(stepContext.lookups).length
    } first-step lookups)`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
