import { useState } from "react";
import { GearIcon } from "../icons/GearIcon";
import { RelationLegend } from "./RelationLegend";

export function PathwayLegendButton() {
  const [open, setOpen] = useState(false);

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

      {open && (
        <div className="pathway-legend-backdrop" onClick={() => setOpen(false)}>
          <article
            className="pathway-legend-sheet"
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
        </div>
      )}
    </>
  );
}
