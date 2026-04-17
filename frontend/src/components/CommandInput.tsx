import type { KeyboardEvent, ChangeEvent } from 'react';
import styles from './CommandInput.module.css';

interface Props {
  value: string;
  loading: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function CommandInput({ value, loading, onChange, onSubmit }: Props) {
  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !loading && value.trim()) {
      onSubmit();
    }
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value);
  }

  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>Command</span>
      <div className={styles.row}>
        <input
          className={styles.input}
          type="text"
          placeholder='e.g. "arm the system in away mode"'
          value={value}
          disabled={loading}
          onChange={handleChange}
          onKeyDown={handleKey}
          maxLength={500}
          autoFocus
        />
        <button
          className={styles.button}
          disabled={loading || !value.trim()}
          onClick={onSubmit}
        >
          {loading && <span className={styles.spinner} />}
          {loading ? 'Running…' : 'Execute'}
        </button>
      </div>
    </div>
  );
}
