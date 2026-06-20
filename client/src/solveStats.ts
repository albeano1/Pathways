import { isNextPuzzleDate } from "../../shared/dailyPuzzle";
import { formatSolveTime } from "./components/formatSolveTime";
import type { ScoreResponse } from "../../shared/types";
import { APP_NAME } from "../../shared/appName";

const STATS_KEY = "connections-solve-stats";
const STREAK_KEY = "pathways-win-streak";

interface SolveStatsRecord {
  totalSolves: number;
  totalTimeMs: number;
}

interface WinStreakRecord {
  streak: number;
  lastWinDate: string | null;
}

function loadSolveStats(): SolveStatsRecord {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return { totalSolves: 0, totalTimeMs: 0 };
    return JSON.parse(raw) as SolveStatsRecord;
  } catch {
    return { totalSolves: 0, totalTimeMs: 0 };
  }
}

function saveSolveStats(stats: SolveStatsRecord): void {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // Ignore storage errors.
  }
}

function loadWinStreak(): WinStreakRecord {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (!raw) return { streak: 0, lastWinDate: null };
    return JSON.parse(raw) as WinStreakRecord;
  } catch {
    return { streak: 0, lastWinDate: null };
  }
}

function saveWinStreak(record: WinStreakRecord): void {
  try {
    localStorage.setItem(STREAK_KEY, JSON.stringify(record));
  } catch {
    // Ignore storage errors.
  }
}

export function recordSolve(solveTimeMs: number): void {
  const stats = loadSolveStats();
  stats.totalSolves += 1;
  stats.totalTimeMs += Math.max(0, solveTimeMs);
  saveSolveStats(stats);
}

/** Update daily win streak for a Pacific calendar puzzle date. Returns the new streak. */
export function recordWinStreak(puzzleDate: string): number {
  const record = loadWinStreak();

  if (record.lastWinDate === puzzleDate) {
    return record.streak;
  }

  if (
    record.lastWinDate === null ||
    !isNextPuzzleDate(record.lastWinDate, puzzleDate)
  ) {
    record.streak = 1;
  } else {
    record.streak += 1;
  }

  record.lastWinDate = puzzleDate;
  saveWinStreak(record);
  return record.streak;
}

export function getWinStreak(): number {
  return loadWinStreak().streak;
}

export function getAverageSolveTimeMs(): number | null {
  const stats = loadSolveStats();
  if (stats.totalSolves === 0) return null;
  return stats.totalTimeMs / stats.totalSolves;
}

/** Path nodes including the goal word. */
export function scoredPathNodes(hops: number): number {
  return hops + 1;
}

export function formatHopDuration(ms: number): string {
  const seconds = Math.max(0, ms / 1000);
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  return formatSolveTime(ms);
}

/** Interleave hop durations with path emojis: 🟩 1.3s 🟩 1.0s 🟩 */
export function buildHopTrailLine(
  score: ScoreResponse,
  hopDurationsMs: number[]
): string {
  const pathNodes = scoredPathNodes(score.playerHops);
  const optimalPathNodes = scoredPathNodes(score.optimalHops);
  const parts: string[] = [];

  for (let index = 0; index < pathNodes; index++) {
    parts.push(index < optimalPathNodes ? "🟩" : "🟨");
    if (index < hopDurationsMs.length) {
      parts.push(formatHopDuration(hopDurationsMs[index]!));
    }
  }

  return parts.join(" ");
}

export function formatHopTimes(durationsMs: number[]): string {
  if (durationsMs.length === 0) return "0s";
  return durationsMs.map(formatHopDuration).join(" · ");
}

/** Spoiler-free emoji row: one symbol per path node (including goal). */
export function buildShareEmojiLine(score: ScoreResponse): string {
  const pathNodes = scoredPathNodes(score.playerHops);
  const optimalPathNodes = scoredPathNodes(score.optimalHops);

  let line = "";
  for (let i = 0; i < pathNodes; i++) {
    line += i < optimalPathNodes ? "🟩" : "🟨";
  }
  return line;
}

export function buildShareText(options: {
  puzzleDateLabel: string;
  score: ScoreResponse;
  streak: number;
  hopDurationsMs: number[];
  averageTimeMs: number | null;
}): string {
  const { puzzleDateLabel, score, streak, hopDurationsMs, averageTimeMs } = options;
  const perfectPath = score.playerHops === score.optimalHops;

  const lines = [
    APP_NAME,
    puzzleDateLabel,
    buildHopTrailLine(score, hopDurationsMs),
    `${streak} day streak`,
  ];

  if (averageTimeMs !== null) {
    lines.push(`Avg: ${formatSolveTime(averageTimeMs)}`);
  }

  if (perfectPath) {
    lines.push("Perfect path!");
  }

  return lines.join("\n");
}
