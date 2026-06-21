import { useLayoutEffect, useState } from "react";

interface TrunkGoalLinkProps {
  containerRef: React.RefObject<HTMLElement | null>;
  goalBarRef: React.RefObject<HTMLElement | null>;
  layoutHeight: number;
}

interface LinkLine {
  x: number;
  y1: number;
  y2: number;
}

function sameLine(a: LinkLine | null, b: LinkLine | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y1 - b.y1) < 0.5 &&
    Math.abs(a.y2 - b.y2) < 0.5
  );
}

/** Connect the win-tip node to the goal bar after the player types the goal word. */
export function TrunkGoalLink({
  containerRef,
  goalBarRef,
  layoutHeight,
}: TrunkGoalLinkProps) {
  const [line, setLine] = useState<LinkLine | null>(null);

  useLayoutEffect(() => {
    let frame = 0;

    const measure = () => {
      const container = containerRef.current;
      const goalBar = goalBarRef.current;
      const tipNode = container?.querySelector(".path-node--win-tip");
      const goalWord = goalBar?.querySelector(".goal-bar__word");
      if (!container || !goalWord || !tipNode) {
        setLine((prev) => (prev === null ? prev : null));
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const tipRect = tipNode.getBoundingClientRect();
      const goalRect = goalWord.getBoundingClientRect();

      const next: LinkLine = {
        x: tipRect.left + tipRect.width / 2 - containerRect.left,
        y1: tipRect.bottom - containerRect.top,
        y2: goalRect.top - containerRect.top,
      };

      setLine((prev) => (sameLine(prev, next) ? prev : next));
    };

    const scheduleMeasure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    scheduleMeasure();

    const observer = new ResizeObserver(scheduleMeasure);
    if (containerRef.current) observer.observe(containerRef.current);
    if (goalBarRef.current) observer.observe(goalBarRef.current);

    window.addEventListener("resize", scheduleMeasure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [containerRef, goalBarRef, layoutHeight]);

  if (!line || line.y2 <= line.y1) return null;

  return (
    <svg
      className="path-tree__trunk-goal-link"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        overflow: "visible",
      }}
      aria-hidden="true"
    >
      <line
        x1={line.x}
        y1={line.y1}
        x2={line.x}
        y2={line.y2}
        stroke="#16a34a"
        strokeWidth={4}
        strokeLinecap="round"
      />
    </svg>
  );
}
