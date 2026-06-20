const PST = "America/Los_Angeles";

/** YYYY-MM-DD calendar date in Pacific time (handles PST/PDT). */
export function getPuzzleDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function anchorTimestampOnDateKey(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  const start = Date.UTC(y, m - 1, d - 1);
  const end = Date.UTC(y, m - 1, d + 2);
  for (let t = start; t <= end; t += 60 * 60 * 1000) {
    if (getPuzzleDateKey(new Date(t)) === dateKey) return t;
  }
  throw new Error(`Could not anchor date key: ${dateKey}`);
}

/** Next calendar date key after `dateKey` in Pacific time. */
export function nextPuzzleDateKey(dateKey: string): string {
  const anchor = anchorTimestampOnDateKey(dateKey);
  for (let t = anchor + 60 * 60 * 1000; t < anchor + 48 * 60 * 60 * 1000; t += 60 * 60 * 1000) {
    const key = getPuzzleDateKey(new Date(t));
    if (key !== dateKey) return key;
  }
  throw new Error(`Could not find next date after ${dateKey}`);
}

/** Instant when the next daily puzzle becomes available (midnight Pacific). */
export function getNextPuzzleAt(now = new Date()): Date {
  const tomorrowKey = nextPuzzleDateKey(getPuzzleDateKey(now));
  let low = now.getTime() + 1;
  let high = now.getTime() + 48 * 60 * 60 * 1000;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (getPuzzleDateKey(new Date(mid)) < tomorrowKey) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return new Date(low);
}

export function msUntilNextPuzzle(now = new Date()): number {
  return Math.max(0, getNextPuzzleAt(now).getTime() - now.getTime());
}

/** Next unlock instant after the given Pacific calendar date. */
export function getNextPuzzleAtForDateKey(dateKey: string): Date {
  return getNextPuzzleAt(new Date(anchorTimestampOnDateKey(dateKey)));
}

/** True when `currentDateKey` is the Pacific calendar day after `previousDateKey`. */
export function isNextPuzzleDate(previousDateKey: string, currentDateKey: string): boolean {
  return nextPuzzleDateKey(previousDateKey) === currentDateKey;
}

/** Deterministic 32-bit hash for seeding daily puzzle selection. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mulberry32 PRNG — deterministic from a numeric seed. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
