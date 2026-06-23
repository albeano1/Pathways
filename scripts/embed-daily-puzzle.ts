import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPuzzleDateKey, nextPuzzleDateKey } from "../shared/dailyPuzzle.js";
import type { StepContextResponse } from "../shared/types.js";
import { GraphService } from "../server/src/graph.js";
import { PuzzleService } from "../server/src/puzzles.js";
import { getDbPath } from "../server/src/bootstrapGraphDb.js";
import { assertPlayablePuzzleEndpoints } from "../server/src/playableEndpoints.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "client/public");
const DAILY_DIR = path.join(OUTPUT_DIR, "daily");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "daily-puzzle.json");
const STEP_CONTEXT_PATH = path.join(OUTPUT_DIR, "daily-step-context.json");
const EMBED_MAP_PATH = path.join(OUTPUT_DIR, "daily-embed.json");

/** How many days of per-date static files to precompute (CDN fallback window). */
const STATIC_WINDOW_DAYS = 60;
/** How many days to inline into index.html for zero-network paint after deploy. */
const EMBED_WINDOW_DAYS = 14;

interface PublicPuzzle {
  id: string;
  start: string;
  end: string;
  optimalHops: number;
  difficulty: string;
  puzzleDate: string;
  nextPuzzleAt: string;
}

function toPublicPuzzle(puzzle: Awaited<ReturnType<PuzzleService["getDaily"]>>): PublicPuzzle {
  return {
    id: puzzle.id,
    start: puzzle.start,
    end: puzzle.end,
    optimalHops: puzzle.optimalHops,
    difficulty: puzzle.difficulty,
    puzzleDate: puzzle.puzzleDate,
    nextPuzzleAt: puzzle.nextPuzzleAt,
  };
}

async function main(): Promise<void> {
  if (!fs.existsSync(getDbPath())) {
    console.warn("Skipping daily puzzle embed — data/graph.db not found.");
    return;
  }

  const graph = new GraphService();
  const puzzles = new PuzzleService(graph);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(DAILY_DIR, { recursive: true });

  const embedMap: Record<string, PublicPuzzle> = {};
  let dateKey = getPuzzleDateKey();
  let firstStepLookups = 0;

  for (let dayIndex = 0; dayIndex < STATIC_WINDOW_DAYS; dayIndex++) {
    const puzzle = await puzzles.getDaily(dateKey);
    await assertPlayablePuzzleEndpoints(puzzle.start, puzzle.end, graph, dateKey);
    const publicPuzzle = toPublicPuzzle(puzzle);

    const stepContext: StepContextResponse = {
      end: puzzle.end,
      path: [puzzle.start],
      lookups: graph.buildStepLookups(puzzle.end, [puzzle.start], puzzle.start),
    };

    fs.writeFileSync(
      path.join(DAILY_DIR, `${dateKey}.json`),
      `${JSON.stringify(publicPuzzle)}\n`
    );
    fs.writeFileSync(
      path.join(DAILY_DIR, `${dateKey}.step.json`),
      `${JSON.stringify(stepContext)}\n`
    );

    if (dayIndex < EMBED_WINDOW_DAYS) {
      embedMap[dateKey] = publicPuzzle;
    }

    if (dayIndex === 0) {
      firstStepLookups = Object.keys(stepContext.lookups).length;
      fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(publicPuzzle)}\n`);
      fs.writeFileSync(STEP_CONTEXT_PATH, `${JSON.stringify(stepContext)}\n`);
    }

    dateKey = nextPuzzleDateKey(dateKey);
  }

  fs.writeFileSync(EMBED_MAP_PATH, `${JSON.stringify(embedMap)}\n`);

  const todayKey = getPuzzleDateKey();
  const today = embedMap[todayKey]!;
  console.log(
    `Precomputed ${STATIC_WINDOW_DAYS} daily puzzles (embed ${EMBED_WINDOW_DAYS}). ` +
      `Today ${todayKey}: ${today.start} → ${today.end} (${today.optimalHops} hops, ${firstStepLookups} first-step lookups)`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
