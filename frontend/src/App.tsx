import { useState, useEffect, useCallback, useRef } from 'react';
import type { HealthzData, NlResponse, HistoryEntry } from './types';
import { executeCommand, fetchHealth } from './api/nlService';
import { SystemStatus } from './components/SystemStatus';
import { CommandInput } from './components/CommandInput';
import { CommandResult } from './components/CommandResult';
import { ExampleCommands } from './components/ExampleCommands';
import { CommandHistory } from './components/CommandHistory';
import './App.css';

let idCounter = 0;
function nextId() {
  return String(++idCounter);
}

export default function App() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NlResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [health, setHealth] = useState<HealthzData | null>(null);
  const healthIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshHealth = useCallback(async () => {
    try {
      const data = await fetchHealth();
      setHealth(data);
    } catch {
      // backend not yet up — leave previous state
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
    healthIntervalRef.current = setInterval(() => void refreshHealth(), 5000);
    return () => {
      if (healthIntervalRef.current) clearInterval(healthIntervalRef.current);
    };
  }, [refreshHealth]);

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const response = await executeCommand(trimmed);
      setResult(response);
      setHistory((prev) => [
        ...prev,
        { id: nextId(), text: trimmed, response, error: null, timestamp: new Date() },
      ]);
      // refresh health after each command since state may have changed
      void refreshHealth();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      setHistory((prev) => [
        ...prev,
        { id: nextId(), text: trimmed, response: null, error: msg, timestamp: new Date() },
      ]);
    } finally {
      setLoading(false);
      setText('');
    }
  }, [text, loading, refreshHealth]);

  function handleRerun(cmd: string) {
    setText(cmd);
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <span className="app-icon">⬡</span>
          <span>Security Control</span>
        </div>
        <SystemStatus data={health} />
      </header>

      <main className="app-main">
        <div className="app-content">
          <ExampleCommands onSelect={setText} />
          <CommandInput
            value={text}
            loading={loading}
            onChange={setText}
            onSubmit={handleSubmit}
          />
          <CommandResult response={result} error={error} />
          <CommandHistory entries={history} onRerun={handleRerun} />
        </div>
      </main>
    </div>
  );
}
