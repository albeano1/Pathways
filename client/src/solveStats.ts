import {
  DAILY_LAUNCH_DATE,
  getPuzzleDateKey,
  isNextPuzzleDate,
  maxPossibleWinStreak,
  previousPuzzleDateKey,
} from "../../shared/dailyPuzzle";
import { formatSolveTime } from "./components/formatSolveTime";
import type { ScoreResponse } from "../../shared/types";
import { APP_NAME, APP_URL } from "../../shared/appName";

const STATS_KEY = "connections-solve-stats";
const STREAK_KEY = "pathways-win-streak";

interface SolveStatsRecord {
  totalSolves: number;
  totalTimeMs: number;
}

interface WinStreakRecord {
  wonDates: string[];
}

interface LegacyWinStreakRecord {
  streak?: number;
  lastWinDate?: string | null;
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
    if (!raw) return { wonDates: [] };

    const parsed = JSON.parse(raw) as WinStreakRecord | LegacyWinStreakRecord;
    if (Array.isArray(parsed.wonDates)) {
      return { wonDates: [...new Set(parsed.wonDates)].sort() };
    }

    // Older counter-only format — keep at most the last recorded win as a single day.
    const legacy = parsed as LegacyWinStreakRecord;
    if (legacy.lastWinDate && (legacy.streak ?? 0) > 0) {
      return { wonDates: [legacy.lastWinDate] };
    }

    return { wonDates: [] };
  } catch {
    return { wonDates: [] };
  }
}

function saveWinStreak(record: WinStreakRecord): void {
  try {
    localStorage.setItem(STREAK_KEY, JSON.stringify(record));
  } catch {
    // Ignore storage errors.
  }
}

/** Consecutive completed daily wins ending at the latest win on or before `asOfDate`. */
export function computeWinStreak(wonDates: string[], asOfDate: string): number {
  const wins = [...new Set(wonDates.filter((date) => date >= DAILY_LAUNCH_DATE))].sort();
  if (wins.length === 0) return 0;

  const wonSet = new Set(wins);
  let endDate = asOfDate;

  while (endDate >= DAILY_LAUNCH_DATE && !wonSet.has(endDate)) {
    endDate = previousPuzzleDateKey(endDate);
  }

  if (!wonSet.has(endDate)) return 0;

  // Streak is broken once a calendar day is missed.
  if (endDate !== asOfDate && !isNextPuzzleDate(endDate, asOfDate)) {
    return 0;
  }

  let streak = 0;
  let dateKey = endDate;
  while (dateKey >= DAILY_LAUNCH_DATE && wonSet.has(dateKey)) {
    streak += 1;
    if (dateKey === DAILY_LAUNCH_DATE) break;
    dateKey = previousPuzzleDateKey(dateKey);
  }

  return Math.min(streak, maxPossibleWinStreak(asOfDate));
}

/** True for generated daily puzzles (not custom ?puzzle= links). */
export function isDailyPuzzle(puzzle: { id: string }): boolean {
  return puzzle.id.startsWith("gen-");
}

export function recordSolve(solveTimeMs: number): void {
  const stats = loadSolveStats();
  stats.totalSolves += 1;
  stats.totalTimeMs += Math.max(0, solveTimeMs);
  saveSolveStats(stats);
}

/** Record a completed daily win. Returns the new win streak. */
export function recordWinStreak(puzzleDate: string): number {
  const record = loadWinStreak();
  if (!record.wonDates.includes(puzzleDate)) {
    record.wonDates = [...record.wonDates, puzzleDate].sort();
    saveWinStreak(record);
  }
  return computeWinStreak(record.wonDates, puzzleDate);
}

export function getWinStreak(now = new Date()): number {
  const record = loadWinStreak();
  return computeWinStreak(record.wonDates, getPuzzleDateKey(now));
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

  const lines = [APP_NAME, puzzleDateLabel, buildHopTrailLine(score, hopDurationsMs)];

  if (streak > 0) {
    lines.push(`${streak} day streak`);
  }

  if (averageTimeMs !== null) {
    lines.push(`Avg: ${formatSolveTime(averageTimeMs)}`);
  }

  if (perfectPath) {
    lines.push("Perfect path!");
  }

  lines.push(APP_URL);

  return lines.join("\n");
}
