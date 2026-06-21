import { FormEvent, useState } from "react";

interface WordInputProps {
  disabled?: boolean;
  busy?: boolean;
  onChange?: (value: string) => void;
  onTypingStart?: () => void;
  onSubmit: (word: string) => boolean | Promise<boolean>;
}

function triggerShake(setShake: (value: boolean) => void): void {
  setShake(true);
  window.setTimeout(() => setShake(false), 400);
}

export function WordInput({ disabled, busy, onChange, onTypingStart, onSubmit }: WordInputProps) {
  const [value, setValue] = useState("");
  const [shake, setShake] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!value.trim() || disabled || busy) return;
    const accepted = await onSubmit(value);
    if (accepted) {
      setValue("");
      onChange?.("");
    } else {
      triggerShake(setShake);
    }
  };

  return (
    <form
      className={`word-input ${shake ? "word-input--shake" : ""}`}
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      <div className="word-input__field">
        <input
          type="text"
          value={value}
          disabled={disabled || busy}
          placeholder={busy ? "Checking..." : "Type a connecting word"}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          onChange={(event) => {
            const next = event.target.value;
            if (next.length > 0 && value.length === 0) {
              onTypingStart?.();
            }
            setValue(next);
            onChange?.(next);
          }}
        />
        <button type="submit" disabled={disabled || busy || !value.trim()}>
          {busy ? "..." : "Add"}
        </button>
      </div>
    </form>
  );
}
