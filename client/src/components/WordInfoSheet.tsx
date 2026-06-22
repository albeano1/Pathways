import { useEffect, useState } from "react";
import type { WordSense } from "../../../shared/types";
import { fetchWordInfo, getCachedWordInfo } from "../wordInfo";

interface WordInfoSheetProps {
  word: string | null;
  onClose: () => void;
}

function partOfSpeechAbbrev(partOfSpeech: string): string {
  const key = partOfSpeech.toLowerCase().trim().split(/\s+/)[0] ?? "";
  const map: Record<string, string> = {
    noun: "n.",
    verb: "v.",
    adjective: "adj.",
    adverb: "adv.",
    pronoun: "pron.",
    preposition: "prep.",
    conjunction: "conj.",
    interjection: "interj.",
    exclamation: "exclam.",
    article: "art.",
    determiner: "det.",
  };
  return map[key] ?? partOfSpeech.toLowerCase();
}

export function WordInfoSheet({ word, onClose }: WordInfoSheetProps) {
  const [loading, setLoading] = useState(false);
  const [lemma, setLemma] = useState("");
  const [senses, setSenses] = useState<WordSense[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!word) return;

    let cancelled = false;
    const key = word.trim().toLowerCase();
    const cached = getCachedWordInfo(key);
    const cacheUsable = cached && ((cached.senses?.length ?? 0) > 0 || !cached.inGraph);

    if (cacheUsable) {
      setLemma(cached.lemma);
      setSenses(cached.senses ?? []);
      setError(cached.error ?? null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setLemma(word);
    setSenses([]);

    void fetchWordInfo(word, { force: Boolean(cached) }).then((info) => {
      if (cancelled) return;
      setLemma(info.lemma);
      setSenses(info.senses ?? []);
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
      <article
        className="word-info-sheet"
        role="dialog"
        aria-label={`Definition for ${lemma}`}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="word-info-sheet__close"
          onClick={onClose}
          aria-label="Close definition"
        >
          ×
        </button>

        <h2 className="word-info-sheet__headword">{lemma}</h2>

        {loading ? (
          <p className="word-info-sheet__loading">Looking up entry…</p>
        ) : senses.length > 0 ? (
          <ol className="word-info-sheet__senses">
            {senses.map((sense, index) => (
              <li key={index} className="word-info-sheet__sense">
                {sense.partOfSpeech && (
                  <span className="word-info-sheet__pos">
                    {partOfSpeechAbbrev(sense.partOfSpeech)}
                  </span>
                )}
                <span className="word-info-sheet__definition">{sense.definition}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="word-info-sheet__note">
            {error ?? "No dictionary entry found for this word."}
          </p>
        )}
      </article>
    </div>
  );
}
