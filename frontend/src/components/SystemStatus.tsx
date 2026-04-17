import type { HealthzData } from '../types';
import styles from './SystemStatus.module.css';

const STRATEGIES = ['rule-based', 'hybrid', 'llm'] as const;
type Strategy = (typeof STRATEGIES)[number];

interface Props {
  data: HealthzData | null;
  onStrategyChange: (strategy: Strategy) => void;
  strategyChanging: boolean;
}

export function SystemStatus({ data, onStrategyChange, strategyChanging }: Props) {
  if (!data) {
    return (
      <div className={styles.bar}>
        <span className={styles.loading}>Connecting to backend…</span>
      </div>
    );
  }

  const { systemState, userCount, nlpStrategy, nlpReady, llmAvailable } = data;
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
      <span className={styles.strategySelector}>
        {STRATEGIES.map((s) => {
          const requiresLlm = s === 'llm' || s === 'hybrid';
          const unavailable = requiresLlm && !llmAvailable;
          const isActive = nlpStrategy === s;
          return (
            <button
              key={s}
              className={`${styles.strategyBtn} ${isActive ? styles.strategyActive : ''} ${unavailable ? styles.strategyUnavailable : ''}`}
              onClick={() => onStrategyChange(s)}
              disabled={strategyChanging || isActive || unavailable}
              title={unavailable ? 'No LLM API key configured' : strategyChanging ? 'Switching strategy…' : `Switch to ${s}`}
            >
              {s}
            </button>
          );
        })}
        {(!nlpReady || strategyChanging) && (
          <span className={styles.strategyStatus}>
            {strategyChanging ? 'switching…' : 'initializing…'}
          </span>
        )}
      </span>
    </div>
  );
}
