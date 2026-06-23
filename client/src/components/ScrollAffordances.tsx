import { useLayoutEffect, useState, type RefObject } from "react";

interface ScrollAffordancesProps {
  containerRef: RefObject<HTMLElement | null>;
}

export function ScrollAffordances({ containerRef }: ScrollAffordancesProps) {
  const [edges, setEdges] = useState({ left: false, right: false });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const update = () => {
      const maxScroll = container.scrollWidth - container.clientWidth;
      if (maxScroll <= 4) {
        setEdges({ left: false, right: false });
        return;
      }
      setEdges({
        left: container.scrollLeft > 4,
        right: container.scrollLeft < maxScroll - 4,
      });
    };

    update();
    container.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(container);

    return () => {
      container.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [containerRef]);

  if (!edges.left && !edges.right) return null;

  return (
    <>
      {edges.left && <div className="scroll-affordance scroll-affordance--left" aria-hidden="true" />}
      {edges.right && (
        <div className="scroll-affordance scroll-affordance--right" aria-hidden="true" />
      )}
    </>
  );
}
