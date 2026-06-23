import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertSyncPlayableEndpointLemma } from "../server/src/playableEndpoints.js";
import { lemmaIsGeneralAudienceEndpoint } from "../server/src/dictionary.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DAILY_DIR = path.resolve(__dirname, "../client/public/daily");
const EMBED_MAP_PATH = path.resolve(__dirname, "../client/public/daily-embed.json");

interface PublicPuzzle {
  start: string;
  end: string;
  puzzleDate: string;
}

function listDailyPuzzles(): PublicPuzzle[] {
  if (!fs.existsSync(DAILY_DIR)) {
    throw new Error(`Missing daily embed directory: ${DAILY_DIR}`);
  }

  const puzzles = fs
    .readdirSync(DAILY_DIR)
    .filter((name) => name.endsWith(".json") && !name.endsWith(".step.json"))
    .map((name) => JSON.parse(fs.readFileSync(path.join(DAILY_DIR, name), "utf8")) as PublicPuzzle);

  if (puzzles.length === 0) {
    throw new Error("No daily puzzle files found to validate.");
  }

  return puzzles.sort((left, right) => left.puzzleDate.localeCompare(right.puzzleDate));
}

async function main(): Promise<void> {
  const fullCheck = process.argv.includes("--full");
  const puzzles = listDailyPuzzles();

  for (const puzzle of puzzles) {
    const context = puzzle.puzzleDate;
    assertSyncPlayableEndpointLemma(puzzle.start, context);
    assertSyncPlayableEndpointLemma(puzzle.end, context);

    if (fullCheck) {
      for (const lemma of [puzzle.start, puzzle.end]) {
        if (!(await lemmaIsGeneralAudienceEndpoint(lemma))) {
          throw new Error(
            `Non-general audience endpoint "${lemma}" for ${context}`
          );
        }
      }
    }
  }

  if (fs.existsSync(EMBED_MAP_PATH)) {
    const embedMap = JSON.parse(fs.readFileSync(EMBED_MAP_PATH, "utf8")) as Record<
      string,
      PublicPuzzle
    >;
    for (const [dateKey, puzzle] of Object.entries(embedMap)) {
      assertSyncPlayableEndpointLemma(puzzle.start, `embed ${dateKey}`);
      assertSyncPlayableEndpointLemma(puzzle.end, `embed ${dateKey}`);
    }
  }

  console.log(
    `Validated ${puzzles.length} cached daily puzzles` +
      (fullCheck ? " (full dictionary check)" : " (sync technical-lemma check)")
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
