/** Read debug puzzle from URL: ?puzzle=apple,dark or ?debug=apple,dark */
export function getDebugPuzzleFromUrl(): { start: string; end: string } | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const raw = params.get("puzzle") ?? params.get("debug");
  if (!raw) return null;

  const [start, end] = raw.split(",").map((part) => part.trim().toLowerCase());
  if (!start || !end) return null;

  return { start, end };
}
