import { FormEvent, useState } from "react";

export type SubmitResult =
  | boolean
  | {
      accepted: boolean;
      shake?: boolean;
    };

interface WordInputProps {
  disabled?: boolean;
  submitting?: boolean;
  onChange?: (value: string) => void;
  onTypingStart?: () => void;
  onSubmit: (word: string) => SubmitResult | Promise<SubmitResult>;
}

function triggerShake(setShake: (value: boolean) => void): void {
  setShake(true);
  window.setTimeout(() => setShake(false), 400);
}

export function WordInput({ disabled, submitting, onChange, onTypingStart, onSubmit }: WordInputProps) {
  const [value, setValue] = useState("");
  const [shake, setShake] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!value.trim() || disabled || submitting) return;
    const result = await onSubmit(value);
    const accepted = typeof result === "boolean" ? result : result.accepted;
    const shake =
      typeof result === "boolean" ? !result : (result.shake ?? !result.accepted);
    if (accepted) {
      setValue("");
      onChange?.("");
    } else if (shake) {
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
          disabled={disabled || submitting}
          placeholder="Type a connecting word"
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
        <button type="submit" disabled={disabled || submitting || !value.trim()}>
          Add
        </button>
      </div>
    </form>
  );
}
