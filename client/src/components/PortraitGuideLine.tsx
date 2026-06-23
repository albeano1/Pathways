import { useLayoutEffect, useState, type RefObject } from "react";
import type { GraphLayout } from "./graphLayout";

interface PortraitGuideLineProps {
  containerRef: RefObject<HTMLElement | null>;
  goalBarRef: RefObject<HTMLElement | null>;
  layout: GraphLayout;
  panelWidth: number;
  panelHeight: number;
  centerGraphHorizontally: boolean;
  enabled: boolean;
}

interface GuideLine {
  x: number;
  y1: number;
  y2: number;
}

export function PortraitGuideLine({
  containerRef,
  goalBarRef,
  layout,
  panelWidth,
  panelHeight,
  centerGraphHorizontally,
  enabled,
}: PortraitGuideLineProps) {
  const [line, setLine] = useState<GuideLine | null>(null);

  useLayoutEffect(() => {
    if (!enabled) {
      setLine(null);
      return;
    }

    let frame = 0;

    const measure = () => {
      const container = containerRef.current;
      const goalBar = goalBarRef.current;
      const startNode = container?.querySelector(".path-node--start");
      const goalWord = goalBar?.querySelector(".goal-bar__word");
      if (!container || !startNode || !goalWord) {
        setLine(null);
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const startRect = startNode.getBoundingClientRect();
      const goalRect = goalWord.getBoundingClientRect();

      setLine({
        x: startRect.left + startRect.width / 2 - containerRect.left,
        y1: startRect.bottom - containerRect.top,
        y2: goalRect.top - containerRect.top,
      });
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    schedule();
    const observer = new ResizeObserver(schedule);
    if (containerRef.current) observer.observe(containerRef.current);
    if (goalBarRef.current) observer.observe(goalBarRef.current);
    window.addEventListener("resize", schedule);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [
    enabled,
    containerRef,
    goalBarRef,
    layout,
    panelWidth,
    panelHeight,
    centerGraphHorizontally,
  ]);

  if (!line || line.y2 <= line.y1) return null;

  return (
    <svg
      className="portrait-guide-line"
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      <line
        x1={line.x}
        y1={line.y1}
        x2={line.x}
        y2={line.y2}
        stroke="rgba(148, 163, 184, 0.35)"
        strokeWidth={2}
        strokeDasharray="6 8"
        strokeLinecap="round"
      />
    </svg>
  );
}
