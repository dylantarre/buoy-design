import type { HealthData } from '../../types';
import { formatPercentage } from '../../utils/format';
import styles from './BarHero.module.css';

interface BarHeroProps {
  health: HealthData;
}

export function BarHero({ health }: BarHeroProps) {
  const lastSyncTime = formatLastSync(health.lastSyncAt);

  return (
    <section className={styles.hero}>
      <div className={styles.container}>
        <h2 className={styles.title}>Your Design System Health</h2>

        <div className={styles.barContainer}>
          <div className={styles.barTrack}>
            <div
              className={styles.barFill}
              style={{ width: `${health.percentage}%` }}
            />
          </div>
          <span className={styles.barValue}>{formatPercentage(health.percentage)}</span>
        </div>

        <div className={styles.stats}>
          <StatCard
            value={health.componentsAligned}
            total={health.componentsTotal}
            label="components aligned"
          />
          <StatCard
            value={health.alertCount}
            label="need attention"
          />
          <StatCard
            value={health.trend?.percentage || 0}
            label="tokens drifted"
          />
        </div>

        <p className={styles.syncStatus}>
          Last scan: {lastSyncTime} • Next auto-scan: 4 hours
        </p>
      </div>
    </section>
  );
}

interface StatCardProps {
  value: number;
  total?: number;
  label: string;
}

function StatCard({ value, total, label }: StatCardProps) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statValue}>
        {value}
        {total !== undefined && (
          <span className={styles.statTotal}> / {total}</span>
        )}
      </div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

function formatLastSync(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return 'just now';
  if (diffHours === 1) return '1 hour ago';
  return `${diffHours} hours ago`;
}
