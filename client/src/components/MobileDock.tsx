import type { ReactNode, Ref } from "react";
import { GoalBar } from "./GoalBar";
import { PathwayLegendButton } from "./PathwayLegendButton";

export type MobileGraphView = "map" | "path";

interface MobileDockProps {
  end: string;
  complete?: boolean;
  closeCount?: number;
  mobileView: MobileGraphView;
  rejectedCount: number;
  showRejected: boolean;
  onToggleRejected: () => void;
  onViewChange: (view: MobileGraphView) => void;
  onWordSelect?: (word: string) => void;
  children: ReactNode;
  goalBarRef?: Ref<HTMLDivElement>;
  showLegend?: boolean;
}

export function MobileDock({
  end,
  complete,
  closeCount,
  mobileView,
  rejectedCount,
  showRejected,
  onToggleRejected,
  onViewChange,
  onWordSelect,
  children,
  goalBarRef,
  showLegend = false,
}: MobileDockProps) {
  return (
    <div className="mobile-dock">
      <div className="mobile-dock__toolbar">
        <div className="mobile-dock__toolbar-start">
          <div className="mobile-dock__view-toggle" role="tablist" aria-label="Graph view">
            <button
              type="button"
              role="tab"
              aria-selected={mobileView === "path"}
              className={[
                "mobile-dock__view-btn",
                mobileView === "path" ? "mobile-dock__view-btn--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onViewChange("path")}
            >
              Path
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mobileView === "map"}
              className={[
                "mobile-dock__view-btn",
                mobileView === "map" ? "mobile-dock__view-btn--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onViewChange("map")}
            >
              Map
            </button>
          </div>
          {rejectedCount > 0 && (
            <button
              type="button"
              className="mobile-dock__rejected-toggle"
              onClick={onToggleRejected}
              aria-pressed={showRejected}
            >
              {showRejected
                ? `Hide ${rejectedCount} wrong ${rejectedCount === 1 ? "try" : "tries"}`
                : `${rejectedCount} wrong ${rejectedCount === 1 ? "try" : "tries"}`}
            </button>
          )}
        </div>
        {showLegend && (
          <div className="mobile-dock__toolbar-end">
            <PathwayLegendButton dockPlacement />
          </div>
        )}
      </div>

      <GoalBar
        ref={goalBarRef}
        word={end}
        complete={complete}
        closeCount={closeCount}
        onWordSelect={onWordSelect}
      />

      <div className="mobile-dock__input">{children}</div>
    </div>
  );
}
