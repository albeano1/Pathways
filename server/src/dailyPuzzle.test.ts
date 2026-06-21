import { describe, expect, it } from "vitest";
import {
  clampPuzzleDateKey,
  getNextPuzzleAt,
  getPuzzleDateKey,
  hashString,
  isNextPuzzleDate,
  mulberry32,
  nextPuzzleDateKey,
} from "../../shared/dailyPuzzle.js";

describe("dailyPuzzle", () => {
  it("formats Pacific date keys", () => {
    const key = getPuzzleDateKey(new Date("2026-06-19T07:00:00Z"));
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("finds the next Pacific calendar day", () => {
    expect(nextPuzzleDateKey("2026-06-18")).toBe("2026-06-19");
  });

  it("detects consecutive puzzle dates", () => {
    expect(isNextPuzzleDate("2026-06-18", "2026-06-19")).toBe(true);
    expect(isNextPuzzleDate("2026-06-18", "2026-06-20")).toBe(false);
  });

  it("returns a future next-puzzle instant", () => {
    const now = new Date("2026-06-18T15:30:00Z");
    const next = getNextPuzzleAt(now);
    expect(next.getTime()).toBeGreaterThan(now.getTime());
    expect(getPuzzleDateKey(next)).toBe(nextPuzzleDateKey(getPuzzleDateKey(now)));
  });

  it("clamps future date keys to today in Pacific time", () => {
    const now = new Date("2026-06-20T06:59:00Z"); // still 2026-06-19 in Pacific
    expect(getPuzzleDateKey(now)).toBe("2026-06-19");
    expect(clampPuzzleDateKey("2026-06-20", now)).toBe("2026-06-19");
    expect(clampPuzzleDateKey("2026-06-19", now)).toBe("2026-06-19");
  });

  it("seeded RNG is deterministic", () => {
    const seed = hashString("2026-06-18");
    const a = mulberry32(seed);
    const b = mulberry32(seed);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
