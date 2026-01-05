import { useDashboardStore } from '../store/dashboard';
import type { DashboardStyle } from '../types';
import styles from './Header.module.css';

export function Header() {
  const { style, setStyle } = useDashboardStore();

  return (
    <header className={styles.header}>
      <div className={styles.logo}>
        <span className={styles.buoyIcon}>🛟</span>
        <span className={styles.logoText}>Buoy</span>
      </div>

      <nav className={styles.nav}>
        <StyleSelector value={style} onChange={setStyle} />
      </nav>

      <div className={styles.actions}>
        <button className={styles.iconButton} aria-label="Help">
          ?
        </button>
        <button className={styles.iconButton} aria-label="Settings">
          ⚙
        </button>
        <button className={styles.userButton}>
          <span className={styles.avatar}>A</span>
          <span>Alex K</span>
        </button>
      </div>
    </header>
  );
}

interface StyleSelectorProps {
  value: DashboardStyle;
  onChange: (style: DashboardStyle) => void;
}

function StyleSelector({ value, onChange }: StyleSelectorProps) {
  const options: { value: DashboardStyle; label: string }[] = [
    { value: 'ring', label: 'Ring' },
    { value: 'bar', label: 'Bar' },
    { value: 'cards', label: 'Cards' },
  ];

  return (
    <div className={styles.styleSelector}>
      <span className={styles.styleSelectorLabel}>Style:</span>
      {options.map((option) => (
        <button
          key={option.value}
          className={`${styles.styleOption} ${value === option.value ? styles.styleOptionActive : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
