import styles from './ExampleCommands.module.css';

const EXAMPLES = [
  'arm the system in away mode',
  'arm in stay mode',
  'disarm the system',
  'add user Sarah with PIN 4321',
  'add temporary user John pin 5678 from today 5pm to Sunday 10am',
  'remove user Sarah',
  'list users',
  'who has access',
];

interface Props {
  onSelect: (text: string) => void;
}

export function ExampleCommands({ onSelect }: Props) {
  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>Examples</span>
      <div className={styles.chips}>
        {EXAMPLES.map((ex) => (
          <button key={ex} className={styles.chip} onClick={() => onSelect(ex)}>
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
