import { useEffect, useState } from "react";
import { msUntilNextPuzzle } from "../../../shared/dailyPuzzle";

/** Live countdown to a target instant (defaults to next midnight Pacific). */
export function useCountdown(targetIso?: string): number {
  const targetMs = targetIso ? Date.parse(targetIso) : Date.now() + msUntilNextPuzzle();

  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, targetMs - Date.now())
  );

  useEffect(() => {
    const tick = () => setRemainingMs(Math.max(0, targetMs - Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [targetMs]);

  return remainingMs;
}
