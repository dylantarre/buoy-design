import type { HealthData } from '../../types';
import { formatPercentage } from '../../utils/format';
import styles from './CardsHero.module.css';

interface CardsHeroProps {
  health: HealthData;
  userName?: string;
}

export function CardsHero({ health, userName = 'there' }: CardsHeroProps) {
  const greeting = getGreeting();
  const healthMessage = getHealthMessage(health.percentage);
  const lastSyncTime = formatLastSync(health.lastSyncAt);

  return (
    <section className={styles.hero}>
      <header className={styles.header}>
        <div className={styles.greeting}>
          <h1 className={styles.title}>{greeting}, {userName}</h1>
          <p className={styles.subtitle}>{healthMessage} ✨</p>
        </div>
        <div className={styles.syncInfo}>
          <span className={styles.lastSync}>Last sync: {lastSyncTime}</span>
          <button className={styles.syncButton}>Sync ↻</button>
        </div>
      </header>

      <div className={styles.cards}>
        <div className={styles.card}>
          <div className={styles.cardValue}>{formatPercentage(health.percentage)}</div>
          <div className={styles.cardLabel}>System Health</div>
          {health.trend && (
            <div className={`${styles.cardTrend} ${styles[`trend${health.trend.direction}`]}`}>
              {health.trend.direction === 'up' ? '↑' : health.trend.direction === 'down' ? '↓' : '→'} {health.trend.percentage}% this week
            </div>
          )}
        </div>

        <div className={styles.card}>
          <div className={styles.cardValue}>
            {health.componentsAligned}/{health.componentsTotal}
          </div>
          <div className={styles.cardLabel}>Components Live</div>
          <div className={styles.cardMeta}>
            {health.componentsTotal - health.componentsAligned} in review
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardValue}>{health.alertCount} items</div>
          <div className={styles.cardLabel}>Need Your Eye</div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardValue}>12 caught</div>
          <div className={styles.cardLabel}>By Guardrails</div>
          <div className={styles.cardMeta}>this week</div>
        </div>
      </div>
    </section>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getHealthMessage(percentage: number): string {
  if (percentage >= 90) return 'Your design system is looking healthy today';
  if (percentage >= 70) return 'Your design system is doing well';
  return 'Your design system needs some attention';
}

function formatLastSync(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  return `${diffHours}h ago`;
}
