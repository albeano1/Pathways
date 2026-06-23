import { useEffect, useRef, useState, type RefObject } from "react";
import { layoutNodeWidth } from "../components/treeGeometry";

export interface TreeContentSize {
  width: number;
  height: number;
}

const MIN_SCALE = 0.06;
const MAX_UPSCALE = 2.35;
const PHONE_CONTENT_INSET = 0.97;
const DESKTOP_CONTENT_INSET = 0.98;
const COMPACT_REF_COLUMNS = 2;

/**
 * Uniform scale so the full graph fits in the play area.
 * Fixed-scale mode locks pill size; fitOverflow caps scale when content exceeds the viewport.
 */
export function useTreeScale(
  viewportRef: RefObject<HTMLElement | null>,
  treeSize: TreeContentSize,
  fixedScaleMode = false,
  compactNodes = false,
  fitOverflow = false,
  fillVertical = false
): number {
  const [scale, setScale] = useState(1);
  const lockedScaleRef = useRef<number | null>(null);
  const lockedViewportWidthRef = useRef(0);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const update = () => {
      if (!fixedScaleMode) {
        lockedScaleRef.current = null;
        lockedViewportWidthRef.current = 0;
      }

      const margin = fixedScaleMode ? 0 : 8;
      const availableWidth = viewport.clientWidth - margin * 2;
      const availableHeight = viewport.clientHeight - margin * 2;
      const contentInset = fixedScaleMode ? PHONE_CONTENT_INSET : DESKTOP_CONTENT_INSET;
      const contentWidth = treeSize.width * contentInset;
      const contentHeight = treeSize.height * contentInset;

      if (contentWidth <= 0 || contentHeight <= 0 || availableWidth <= 0 || availableHeight <= 0) {
        setScale(1);
        return;
      }

      const scaleW = availableWidth / contentWidth;
      const scaleH = availableHeight / contentHeight;

      let clamped: number;

      if (fixedScaleMode) {
        if (
          lockedScaleRef.current === null ||
          Math.abs(availableWidth - lockedViewportWidthRef.current) > 12
        ) {
          const refWidth =
            (compactNodes ? layoutNodeWidth(true) : layoutNodeWidth(false)) *
            COMPACT_REF_COLUMNS *
            contentInset;
          lockedScaleRef.current = Math.min(1, availableWidth / refWidth);
          lockedViewportWidthRef.current = availableWidth;
        }
        clamped = lockedScaleRef.current;
        if (fitOverflow) {
          const fitScale = Math.min(scaleW, scaleH);
          clamped = Math.max(MIN_SCALE, Math.min(clamped, fitScale));
        } else if (fillVertical) {
          const scaledHeight = contentHeight * clamped;
          const targetHeight = availableHeight * 0.92;
          if (scaledHeight < targetHeight) {
            const fillScale = targetHeight / contentHeight;
            clamped = Math.min(fillScale, 1.35);
          }
        }
      } else {
        const fitScale = Math.min(scaleW, scaleH);
        const isUltraWide =
          availableWidth >= 960 && availableWidth > availableHeight * 1.45;
        const maxScale = isUltraWide ? MAX_UPSCALE : 1.35;
        clamped = Math.max(MIN_SCALE, Math.min(maxScale, fitScale));
      }

      setScale((prev) => (Math.abs(clamped - prev) < 0.01 ? prev : clamped));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    window.addEventListener("resize", update);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [
    viewportRef,
    treeSize.width,
    treeSize.height,
    fixedScaleMode,
    compactNodes,
    fitOverflow,
    fillVertical,
  ]);

  return scale;
}
