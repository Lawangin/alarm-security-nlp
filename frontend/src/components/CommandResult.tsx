import type { NlResponse } from '../types';
import styles from './CommandResult.module.css';

interface Props {
  response: NlResponse | null;
  error: string | null;
}

export function CommandResult({ response, error }: Props) {
  if (!response && !error) return null;

  if (error) {
    return (
      <div className={`${styles.card} ${styles.error}`}>
        <span className={styles.sectionLabel}>Error</span>
        <p className={styles.errorText}>{error}</p>
      </div>
    );
  }

  const { data } = response!;
  const { interpretation, result } = data;
  const confidencePct = Math.round(interpretation.confidence * 100);
  const hasEntities = Object.keys(interpretation.entities).length > 0;

  return (
    <div className={styles.card}>
      <div className={styles.section}>
        <span className={styles.sectionLabel}>Input</span>
        <span className={styles.inputText}>"{data.input}"</span>
      </div>

      <hr className={styles.divider} />

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Interpretation</span>
        <div className={styles.intent}>
          <span className={styles.intentBadge}>{interpretation.intent}</span>
        </div>
        <div className={styles.meta}>
          <span>
            Confidence:{' '}
            <span className={styles.metaValue}>
              <span className={styles.confidence}>
                {confidencePct}%
                <span className={styles.bar}>
                  <span className={styles.barFill} style={{ width: `${confidencePct}%` }} />
                </span>
              </span>
            </span>
          </span>
          <span>
            Source: <span className={styles.metaValue}>{interpretation.source}</span>
          </span>
          {hasEntities && (
            <span>
              Entities:{' '}
              <span className={styles.metaValue}>
                {Object.entries(interpretation.entities)
                  .map(([k, v]) => `${k}=${String(v)}`)
                  .join(', ')}
              </span>
            </span>
          )}
        </div>
      </div>

      <hr className={styles.divider} />

      <div className={styles.section}>
        <span className={styles.sectionLabel}>API Call</span>
        <span className={styles.apiCall}>{data.apiCall}</span>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Result</span>
        <pre className={styles.pre}>{JSON.stringify(result, null, 2)}</pre>
      </div>
    </div>
  );
}
