import cors from "cors";
import express from "express";
import path from "node:path";
import { getPuzzleDateKey } from "../../shared/dailyPuzzle.js";
import { isValidPuzzleHops, hopRangeLabel } from "../../shared/puzzleRules.js";
import type {
  HintResponse,
  ScoreRequest,
  ScoreResponse,
  ValidateStepRequest,
  ValidateStepResponse,
} from "../../shared/types.js";
import { GraphService } from "./graph.js";
import { CLIENT_DIST, DB_PATH } from "./paths.js";
import { PuzzleService } from "./puzzles.js";

function createServices() {
  let graph: GraphService | undefined;
  let puzzles: PuzzleService | undefined;

  const get = () => {
    if (!graph) {
      graph = new GraphService();
      puzzles = new PuzzleService(graph);
    }
    return { graph, puzzles: puzzles! };
  };

  return {
    get,
    getWordCount: () => get().graph.getWordCount(),
  };
}

export function createApp(options: { serveClient?: boolean } = {}) {
  const services = createServices();
  const { get: getServices } = services;

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "32kb" }));

  app.get("/api/health", (_req, res) => {
    try {
      res.json({ ok: true, words: services.getWordCount(), dbPath: DB_PATH });
    } catch (error) {
      res.status(503).json({ ok: false, error: (error as Error).message, dbPath: DB_PATH });
    }
  });

  app.get("/api/puzzle", (req, res) => {
    try {
      const { graph, puzzles } = getServices();
      const start = String(req.query.start ?? "").trim().toLowerCase();
      const end = String(req.query.end ?? "").trim().toLowerCase();

      if (start && end) {
        const samplePath = graph.shortestPath(start, end);
        if (!samplePath) {
          res.status(400).json({ error: `No path between "${start}" and "${end}"` });
          return;
        }

        const optimalHops = samplePath.length - 1;
        if (!isValidPuzzleHops(optimalHops)) {
          res.status(400).json({
            error: `Path length must be ${hopRangeLabel()} hops (got ${optimalHops})`,
          });
          return;
        }

        const puzzle = puzzles.fromPair(start, end, graph);
        if (!puzzle) {
          res.status(400).json({ error: "Invalid puzzle pair" });
          return;
        }

        res.json({
          id: `debug-${start}-${end}`,
          start: puzzle.start,
          end: puzzle.end,
          optimalHops: puzzle.optimalHops,
          difficulty: puzzle.difficulty,
          puzzleDate: puzzle.puzzleDate,
          nextPuzzleAt: puzzle.nextPuzzleAt,
        });
        return;
      }

      const dateParam = String(req.query.date ?? "").trim();
      const puzzleDate =
        /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : getPuzzleDateKey();
      const puzzle = puzzles.getDaily(puzzleDate);

      res.json({
        id: puzzle.id,
        start: puzzle.start,
        end: puzzle.end,
        optimalHops: puzzle.optimalHops,
        difficulty: puzzle.difficulty,
        puzzleDate: puzzle.puzzleDate,
        nextPuzzleAt: puzzle.nextPuzzleAt,
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/api/validate-step", (req, res) => {
    try {
      const { from, to, end, path: explorePath } = req.body as ValidateStepRequest;
      if (!from || !to || !end) {
        res.status(400).json({ valid: false, error: "Missing from, to, or end word" });
        return;
      }

      const { graph } = getServices();
      const response: ValidateStepResponse = graph.analyzeStep(from, to, end, explorePath ?? []);
      res.json(response);
    } catch (error) {
      res.status(503).json({
        valid: false,
        failureType: "not_in_graph",
        error: (error as Error).message,
      });
    }
  });

  app.post("/api/score", (req, res) => {
    try {
      const { start, end, path: playerPath, totalGuesses, wrongGuesses, solveTimeMs } =
        req.body as ScoreRequest;
      if (!start || !end || !Array.isArray(playerPath)) {
        res.status(400).json({ valid: false, error: "Invalid score request" });
        return;
      }

      const { graph } = getServices();
      const result = graph.scorePath(start, end, playerPath, {
        totalGuesses,
        wrongGuesses,
        solveTimeMs,
      });
      const response: ScoreResponse = result;
      res.json(response);
    } catch (error) {
      res.status(503).json({
        valid: false,
        playerHops: Array.isArray(req.body?.path) ? req.body.path.length - 1 : 0,
        optimalHops: 0,
        error: (error as Error).message,
      });
    }
  });

  app.get("/api/hint", (req, res) => {
    try {
      const { graph } = getServices();
      const start = String(req.query.start ?? "");
    const end = String(req.query.end ?? "");
    if (!start || !end) {
      res.status(400).json({ error: "Missing start or end" });
      return;
    }

    const optimalPath = graph.shortestPath(start, end);
    if (!optimalPath || optimalPath.length < 3) {
      const response: HintResponse = { error: "No hint available" };
      res.json(response);
      return;
    }

    const hintIndex = Math.max(1, Math.floor(optimalPath.length / 2));
    const response: HintResponse = {
      hint: optimalPath[hintIndex],
      optimalPath,
      optimalHops: optimalPath.length - 1,
    };
    res.json(response);
    } catch (error) {
      res.status(503).json({ error: (error as Error).message });
    }
  });

  if (options.serveClient) {
    app.use(express.static(CLIENT_DIST));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(CLIENT_DIST, "index.html"), (err) => {
        if (err) res.status(404).json({ error: "Not found" });
      });
    });
  }

  return { app, getWordCount: services.getWordCount };
}
