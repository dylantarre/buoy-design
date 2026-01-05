import type { ActivityItem } from '../../types';
import { formatRelativeTime } from '../../utils/format';
import styles from './Activity.module.css';

interface ActivityProps {
  items: ActivityItem[];
}

export function Activity({ items }: ActivityProps) {
  return (
    <section className={styles.activity}>
      <header className={styles.header}>
        <h2 className={styles.title}>Recent Activity</h2>
        <button className={styles.viewAll}>View All →</button>
      </header>

      <div className={styles.list}>
        {items.map((item) => (
          <ActivityRow key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

interface ActivityRowProps {
  item: ActivityItem;
}

function ActivityRow({ item }: ActivityRowProps) {
  return (
    <div className={styles.row}>
      <span className={`${styles.indicator} ${item.success ? styles.indicatorSuccess : styles.indicatorNeutral}`}>
        {item.success ? '✓' : '○'}
      </span>
      <span className={styles.description}>{item.description}</span>
      <time className={styles.time}>{formatRelativeTime(item.createdAt)}</time>
    </div>
  );
}
