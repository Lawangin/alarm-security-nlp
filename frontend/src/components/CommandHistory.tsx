import type { HistoryEntry } from '../types';
import styles from './CommandHistory.module.css';

interface Props {
  entries: HistoryEntry[];
  onRerun: (text: string) => void;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function CommandHistory({ entries, onRerun }: Props) {
  if (entries.length === 0) return null;

  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>History</span>
      <div className={styles.list}>
        {[...entries].reverse().map((entry) => (
          <button key={entry.id} className={styles.item} onClick={() => onRerun(entry.text)}>
            <span className={`${styles.icon} ${entry.error ? styles.err : styles.ok}`}>
              {entry.error ? '✕' : '✓'}
            </span>
            <span className={styles.text}>{entry.text}</span>
            {entry.response && (
              <span className={styles.intent}>
                {entry.response.data.interpretation.intent}
              </span>
            )}
            <span className={styles.time}>{formatTime(entry.timestamp)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
