import type { HealthData } from '../../types';
import { formatPercentage } from '../../utils/format';
import styles from './RingHero.module.css';

interface RingHeroProps {
  health: HealthData;
}

export function RingHero({ health }: RingHeroProps) {
  const healthMessage = getHealthMessage(health.percentage);
  const segments = 5;
  const filledSegments = Math.round((health.percentage / 100) * segments);

  return (
    <section className={styles.hero}>
      <div className={styles.container}>
        <div className={styles.ring}>
          <span className={styles.percentage}>{formatPercentage(health.percentage)}</span>
          <div className={styles.segments}>
            {Array.from({ length: segments }, (_, i) => (
              <span
                key={i}
                className={`${styles.segment} ${i < filledSegments ? styles.segmentFilled : ''}`}
              >
                ●
              </span>
            ))}
          </div>
        </div>

        <p className={styles.message}>{healthMessage}</p>

        <div className={styles.stats}>
          <StatCard
            value={`${health.componentsAligned}`}
            label={`${health.componentsTotal}`}
            description="components aligned"
          />
          <StatCard
            value={`${health.alertCount}`}
            label=""
            description="inbox items"
          />
          {health.trend && (
            <StatCard
              value={`${health.trend.direction === 'up' ? '↑' : health.trend.direction === 'down' ? '↓' : '→'} ${health.trend.percentage}%`}
              label=""
              description="this week"
            />
          )}
        </div>
      </div>
    </section>
  );
}

interface StatCardProps {
  value: string;
  label: string;
  description: string;
}

function StatCard({ value, label, description }: StatCardProps) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statValue}>
        {value}
        {label && (
          <>
            <span className={styles.statDivider}>/</span>
            <span className={styles.statTotal}>{label}</span>
          </>
        )}
      </div>
      <div className={styles.statDescription}>{description}</div>
    </div>
  );
}

function getHealthMessage(percentage: number): string {
  if (percentage >= 90) return 'Your design system is looking great today';
  if (percentage >= 70) return 'Doing well, a few things to check';
  return 'Needs some love — let\'s fix it together';
}
