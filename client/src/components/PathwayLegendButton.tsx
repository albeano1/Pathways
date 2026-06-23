import { useState } from "react";
import { createPortal } from "react-dom";
import { GearIcon } from "../icons/GearIcon";
import { RelationLegend } from "./RelationLegend";

interface PathwayLegendButtonProps {
  /** Opens above the mobile dock without a dimmed backdrop. */
  dockPlacement?: boolean;
}

export function PathwayLegendButton({ dockPlacement = false }: PathwayLegendButtonProps) {
  const [open, setOpen] = useState(false);

  const sheet = (
    <article
      className={[
        "pathway-legend-sheet",
        dockPlacement ? "pathway-legend-sheet--dock" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="dialog"
      aria-label="Pathway types"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="pathway-legend-sheet__close"
        onClick={() => setOpen(false)}
        aria-label="Close pathways"
      >
        ×
      </button>
      <p className="pathway-legend-sheet__title">Pathways</p>
      <RelationLegend layout="modal" />
    </article>
  );

  return (
    <>
      <button
        type="button"
        className="pathway-legend-btn"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Pathways"
      >
        <GearIcon className="pathway-legend-btn__icon" />
      </button>

      {open &&
        dockPlacement &&
        createPortal(
          <>
            <button
              type="button"
              className="pathway-legend-dismiss"
              aria-label="Close pathways"
              onClick={() => setOpen(false)}
            />
            {sheet}
          </>,
          document.body
        )}

      {open &&
        !dockPlacement &&
        createPortal(
          <div className="pathway-legend-backdrop" onClick={() => setOpen(false)}>
            {sheet}
          </div>,
          document.body
        )}
    </>
  );
}
