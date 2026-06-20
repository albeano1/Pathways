import { useEffect, useState } from "react";
import { fetchWordInfo } from "../wordInfo";

interface WordInfoSheetProps {
  word: string | null;
  onClose: () => void;
}

export function WordInfoSheet({ word, onClose }: WordInfoSheetProps) {
  const [loading, setLoading] = useState(false);
  const [lemma, setLemma] = useState("");
  const [definition, setDefinition] = useState<string | null>(null);
  const [partOfSpeech, setPartOfSpeech] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!word) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setLemma(word);
    setDefinition(null);
    setPartOfSpeech(null);

    void fetchWordInfo(word).then((info) => {
      if (cancelled) return;
      setLemma(info.lemma);
      setDefinition(info.definition ?? null);
      setPartOfSpeech(info.partOfSpeech ?? null);
      setError(info.error ?? null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [word]);

  if (!word) return null;

  return (
    <div className="word-info-backdrop" onClick={onClose}>
      <div
        className="word-info-sheet"
        role="dialog"
        aria-label={`Definition for ${lemma}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="word-info-sheet__header">
          <h2 className="word-info-sheet__title">{lemma}</h2>
          <button type="button" className="word-info-sheet__close" onClick={onClose}>
            Close
          </button>
        </div>

        {loading ? (
          <p className="word-info-sheet__loading">Loading...</p>
        ) : definition ? (
          <div className="word-info-sheet__section">
            {partOfSpeech && <span className="word-info-sheet__pos">{partOfSpeech}</span>}
            <p className="word-info-sheet__definition">{definition}</p>
          </div>
        ) : (
          <p className="word-info-sheet__note">
            {error ?? "No dictionary entry found for this word."}
          </p>
        )}
      </div>
    </div>
  );
}
