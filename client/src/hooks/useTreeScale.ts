import { useEffect, useState, type RefObject } from "react";

export interface TreeContentSize {
  width: number;
  height: number;
}

const MIN_SCALE = 0.06;
const MAX_UPSCALE = 2.35;
/** Use slightly less than 100% of content bounds so scale can be a touch larger without clipping. */
const PHONE_CONTENT_INSET = 0.98;
const DESKTOP_CONTENT_INSET = 0.98;

/**
 * Uniform scale so the full graph fits in the play area.
 * Layout keeps natural spacing; we shrink/grow via transform only.
 */
export function useTreeScale(
  viewportRef: RefObject<HTMLElement | null>,
  treeSize: TreeContentSize
): number {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const update = () => {
      const isPhone = viewport.clientWidth <= 720;
      const margin = isPhone ? 2 : 8;
      const availableWidth = viewport.clientWidth - margin * 2;
      const availableHeight = viewport.clientHeight - margin * 2;
      const contentInset = isPhone ? PHONE_CONTENT_INSET : DESKTOP_CONTENT_INSET;
      const contentWidth = treeSize.width * contentInset;
      const contentHeight = treeSize.height * contentInset;

      if (contentWidth <= 0 || contentHeight <= 0 || availableWidth <= 0 || availableHeight <= 0) {
        setScale(1);
        return;
      }

      const scaleW = availableWidth / contentWidth;
      const scaleH = availableHeight / contentHeight;
      const fitScale = Math.min(scaleW, scaleH);

      const isUltraWide =
        availableWidth >= 960 && availableWidth > availableHeight * 1.45;
      const maxScale = isUltraWide ? MAX_UPSCALE : isPhone ? 1 : 1.35;

      const clamped = Math.max(MIN_SCALE, Math.min(maxScale, fitScale));

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
  }, [viewportRef, treeSize.width, treeSize.height]);

  return scale;
}
