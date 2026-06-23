import { useCallback, useEffect, useMemo, useState } from "react";
import type { GraphEdge, GraphNode } from "../../../shared/types";
import {
  buildActivePath,
  buildPathFromForkChoices,
  buildPathGraphContext,
  defaultForkChoices,
  forkNextOptions,
  pathPrefixKey,
} from "../api/activePath";
import { PathNode, type PathNodeVariant } from "./PathNode";

interface PathViewProps {
  start: string;
  end: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  currentNodeId: string;
  complete?: boolean;
  onWordSelect?: (word: string) => void;
}

export function PathView({
  start,
  end,
  nodes,
  edges,
  currentNodeId,
  complete,
  onWordSelect,
}: PathViewProps) {
  const won = complete === true || nodes.some((node) => node.word === end);
  const pathContext = useMemo(
    () => buildPathGraphContext(nodes, edges, start),
    [nodes, edges, start]
  );
  const [forkChoices, setForkChoices] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!pathContext) return;
    const defaultPath = buildActivePath(nodes, edges, start, currentNodeId);
    setForkChoices(defaultForkChoices(pathContext, currentNodeId, defaultPath));
  }, [currentNodeId, nodes, edges, start, pathContext]);

  const path = useMemo(() => {
    if (!pathContext) return [start];
    return buildPathFromForkChoices(pathContext, start, currentNodeId, forkChoices);
  }, [pathContext, forkChoices, start, currentNodeId]);

  const handleForkChange = useCallback((prefix: string[], optionIndex: number) => {
    const key = pathPrefixKey(prefix);
    setForkChoices((previous) => {
      const next = { ...previous, [key]: optionIndex };
      for (const forkKey of Object.keys(next)) {
        if (forkKey !== key && forkKey.startsWith(`${key}\0`)) {
          delete next[forkKey];
        }
      }
      return next;
    });
  }, []);

  if (!pathContext) {
    return (
      <div className="path-view">
        <div className="path-view__chain">
          <PathNode word={start} variant="start" onSelect={onWordSelect} />
        </div>
      </div>
    );
  }

  return (
    <div className="path-view">
      <div className="path-view__chain">
        {path.map((word, index) => {
          const prefix = path.slice(0, index + 1);
          const branchOptions = forkNextOptions(pathContext, currentNodeId, prefix);
          const hasBranch = branchOptions.length > 1;
          const forkKey = pathPrefixKey(prefix);
          const selectedBranch = forkChoices[forkKey] ?? 0;

          let variant: PathNodeVariant = "confirmed";
          if (word === start) variant = "start";
          else if (won && word === end) variant = "win-tip";
          else if (
            !won &&
            pathContext.index.nodeIdByWord.get(word) === currentNodeId
          ) {
            variant = "current";
          }

          return (
            <div key={`${forkKey}-${word}`} className="path-view__step">
              {index > 0 && <div className="path-view__connector" aria-hidden="true" />}
              <div
                className={[
                  "path-view__branch-node",
                  hasBranch ? `path-view__branch-node--${variant}` : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <PathNode word={word} variant={variant} onSelect={onWordSelect} />
                {hasBranch && (
                  <label className="path-view__branch-route">
                    <span className="path-view__branch-route-label">then</span>
                    <select
                      className="path-view__branch-route-select"
                      value={selectedBranch}
                      onChange={(event) =>
                        handleForkChange(prefix, Number(event.target.value))
                      }
                      aria-label={`Choose next step after ${word}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {branchOptions.map((option, optionIndex) => (
                        <option key={option} value={optionIndex}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
