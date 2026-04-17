import type { HealthzData } from '../types';
import styles from './SystemStatus.module.css';

interface Props {
  data: HealthzData | null;
}

export function SystemStatus({ data }: Props) {
  if (!data) {
    return (
      <div className={styles.bar}>
        <span className={styles.loading}>Connecting to backend…</span>
      </div>
    );
  }

  const { systemState, userCount, nlpStrategy, nlpReady } = data;
  const armed = systemState.armed;

  return (
    <div className={styles.bar}>
      <span className={`${styles.badge} ${armed ? styles.armed : styles.disarmed}`}>
        <span className={styles.dot} />
        {armed ? `ARMED${systemState.mode ? ` · ${systemState.mode.toUpperCase()}` : ''}` : 'DISARMED'}
      </span>
      <span className={styles.stat}>
        Users: <span>{userCount}</span>
      </span>
      <span className={styles.stat}>
        NLP: <span>{nlpStrategy}{nlpReady ? '' : ' (initializing…)'}</span>
      </span>
    </div>
  );
}
