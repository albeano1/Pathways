import { useEffect, useState, type RefObject } from "react";

export interface TreeContentSize {
  width: number;
  height: number;
}

interface TreeScaleOptions {
  /** Fit width only and allow vertical scrolling (mobile). */
  widthOnly?: boolean;
}

const PAD_X = 48;
const PAD_Y = 32;

/** Scale tree canvas to fit the viewport (anchored at top center). */
export function useTreeScale(
  viewportRef: RefObject<HTMLElement | null>,
  treeSize: TreeContentSize,
  options: TreeScaleOptions = {}
): number {
  const { widthOnly = false } = options;
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const update = () => {
      const isMobile = viewport.clientWidth <= 720;
      const margin = isMobile ? 6 : 16;
      const availableWidth = viewport.clientWidth - margin * 2;
      const availableHeight = viewport.clientHeight - margin;
      const contentWidth = treeSize.width + PAD_X * 0.5;
      const contentHeight = treeSize.height + PAD_Y * 0.5;

      if (contentWidth <= 0 || contentHeight <= 0 || availableWidth <= 0 || availableHeight <= 0) {
        setScale(1);
        return;
      }

      const widthScale = availableWidth / contentWidth;
      let raw: number;

      if (widthOnly) {
        raw = Math.min(1, widthScale);
      } else {
        raw = Math.min(1, widthScale, availableHeight / contentHeight);
      }

      const minScale = widthOnly ? 0.72 : 0.32;
      const clamped = Math.max(minScale, raw);

      setScale((prev) => {
        if (Math.abs(clamped - prev) < 0.01) return prev;
        return clamped;
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    window.addEventListener("resize", update);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [viewportRef, treeSize.width, treeSize.height, widthOnly]);

  return scale;
}
