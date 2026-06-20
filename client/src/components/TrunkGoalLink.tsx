import { useLayoutEffect, useState } from "react";

interface TrunkGoalLinkProps {
  containerRef: React.RefObject<HTMLElement | null>;
  goalBarRef: React.RefObject<HTMLElement | null>;
  canvasRef: React.RefObject<HTMLElement | null>;
  active: boolean;
  won: boolean;
}

interface LinkLine {
  x: number;
  y1: number;
  y2: number;
}

/** Connect the path tip (current or win-tip) to the goal bar through the goal gap. */
export function TrunkGoalLink({
  containerRef,
  goalBarRef,
  canvasRef,
  active,
  won,
}: TrunkGoalLinkProps) {
  const [line, setLine] = useState<LinkLine | null>(null);

  useLayoutEffect(() => {
    if (!active) {
      setLine(null);
      return;
    }

    const measure = () => {
      const container = containerRef.current;
      const goalBar = goalBarRef.current;
      const tipSelector = won ? ".path-node--win-tip" : ".path-node--current";
      const tipNode = container?.querySelector(tipSelector);
      if (!container || !goalBar || !tipNode) {
        setLine(null);
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const tipRect = tipNode.getBoundingClientRect();
      const goalRect = goalBar.getBoundingClientRect();

      setLine({
        x: tipRect.left + tipRect.width / 2 - containerRect.left,
        y1: tipRect.bottom - containerRect.top,
        y2: goalRect.top - containerRect.top,
      });
    };

    measure();
    requestAnimationFrame(measure);

    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    if (goalBarRef.current) observer.observe(goalBarRef.current);
    if (canvasRef.current) observer.observe(canvasRef.current);

    const canvas = canvasRef.current;
    canvas?.addEventListener("scroll", measure);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      canvas?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [active, won, containerRef, goalBarRef, canvasRef]);

  if (!active || !line || line.y2 <= line.y1) return null;

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
        stroke="#64748b"
        strokeWidth={4}
        strokeLinecap="round"
      />
    </svg>
  );
}
