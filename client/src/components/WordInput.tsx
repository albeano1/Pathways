import { FormEvent, useEffect, useState } from "react";

interface WordInputProps {
  disabled?: boolean;
  error?: string | null;
  onChange?: (value: string) => void;
  onTypingStart?: () => void;
  onSubmit: (word: string) => boolean | Promise<boolean>;
}

export function WordInput({ disabled, error, onChange, onTypingStart, onSubmit }: WordInputProps) {
  const [value, setValue] = useState("");
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (!error) return;
    setShake(true);
    const timer = window.setTimeout(() => setShake(false), 400);
    return () => window.clearTimeout(timer);
  }, [error]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!value.trim() || disabled) return;
    const accepted = await onSubmit(value);
    if (accepted) {
      setValue("");
      onChange?.("");
    }
  };

  return (
    <form
      className={`word-input ${shake ? "word-input--shake" : ""}`}
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      <input
        type="text"
        value={value}
        disabled={disabled}
        placeholder="Type a connecting word..."
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          const next = event.target.value;
          if (next.length > 0 && value.length === 0) {
            onTypingStart?.();
          }
          setValue(next);
          onChange?.(next);
        }}
      />
      <button type="submit" disabled={disabled || !value.trim()}>
        Add
      </button>
    </form>
  );
}
