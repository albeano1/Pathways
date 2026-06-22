import { formatRelation } from "./formatRelation";
import {
  LEGEND_RELATIONS,
  LEGEND_STROKE_COLOR,
  PATHWAY_STYLES,
  type PathwayLineStyle,
} from "./edgeStyles";

const LEGEND_LINE_WIDTH = 30;

function LineSample({ style }: { style: PathwayLineStyle }) {
  const dasharray = style.legendDasharray ?? style.dasharray;
  const sampleWidth = style.legendDasharray ? LEGEND_LINE_WIDTH : 24;
  const strokeWidth = style.width ?? 2.5;

  return (
    <svg
      className="relation-legend__line"
      width={sampleWidth}
      height="8"
      viewBox={`0 0 ${sampleWidth} 8`}
      aria-hidden="true"
    >
      <line
        x1="1"
        y1="4"
        x2={sampleWidth - 1}
        y2="4"
        stroke={LEGEND_STROKE_COLOR}
        strokeWidth={strokeWidth}
        strokeLinecap={style.linecap}
        strokeDasharray={dasharray}
      />
    </svg>
  );
}

interface RelationLegendProps {
  layout?: "inline" | "modal";
}

export function RelationLegend({ layout = "inline" }: RelationLegendProps) {
  return (
    <div
      className={[
        "relation-legend",
        layout === "modal" ? "relation-legend--modal" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label="Pathway types"
    >
      {layout === "inline" && <p className="relation-legend__title">Pathways</p>}
      <ul className="relation-legend__list">
        {LEGEND_RELATIONS.map((relation) => (
          <li key={relation} className="relation-legend__item">
            <LineSample style={PATHWAY_STYLES[relation]!} />
            <span className="relation-legend__label">{formatRelation(relation)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
