import type { InboxItem } from '../../types';
import { InboxCard } from './InboxCard';
import styles from './Inbox.module.css';

interface InboxProps {
  items: InboxItem[];
  onAction: (itemId: string, action: string) => void;
}

export function Inbox({ items, onAction }: InboxProps) {
  const hasItems = items.length > 0;

  return (
    <section className={styles.inbox}>
      <header className={styles.header}>
        <h2 className={styles.title}>
          Needs Your Eye
          {hasItems && <span className={styles.count}>({items.length})</span>}
        </h2>
        {hasItems && (
          <button className={styles.viewAll}>View all →</button>
        )}
      </header>

      <div className={styles.list}>
        {hasItems ? (
          items.map((item) => (
            <InboxCard key={item.id} item={item} onAction={onAction} />
          ))
        ) : (
          <EmptyState />
        )}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}>✓</span>
      <p className={styles.emptyText}>All caught up! Nothing needs your attention right now.</p>
    </div>
  );
}
