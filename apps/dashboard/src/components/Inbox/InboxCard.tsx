import type { InboxItem } from '../../types';
import { formatRelativeTime } from '../../utils/format';
import styles from './InboxCard.module.css';

interface InboxCardProps {
  item: InboxItem;
  onAction: (itemId: string, action: string) => void;
}

const TYPE_CONFIG = {
  'new-component': {
    badge: '🆕 NEW COMPONENT',
    badgeClass: 'badgeNew',
  },
  'undefined-token': {
    badge: '🎨 UNDEFINED TOKEN',
    badgeClass: 'badgeToken',
  },
  'guardrail-catch': {
    badge: '⚡ GUARDRAIL CATCH',
    badgeClass: 'badgeGuardrail',
  },
  'large-deviation': {
    badge: '⚠️ LARGE DEVIATION',
    badgeClass: 'badgeDeviation',
  },
};

export function InboxCard({ item, onAction }: InboxCardProps) {
  const config = TYPE_CONFIG[item.type];

  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <span className={`${styles.badge} ${styles[config.badgeClass]}`}>
          {config.badge}
        </span>
        <time className={styles.time}>{formatRelativeTime(item.createdAt)}</time>
      </header>

      <h3 className={styles.title}>{item.title}</h3>
      <p className={styles.description}>{item.description}</p>

      {item.metadata.filePath && (
        <p className={styles.meta}>
          Found in: <code>{item.metadata.filePath}</code>
          {item.metadata.prNumber && ` • PR #${item.metadata.prNumber} by @${item.metadata.author}`}
        </p>
      )}

      {item.type === 'undefined-token' && item.metadata.tokenValue && (
        <div className={styles.tokenPreview}>
          <div className={styles.tokenSwatch} style={{ backgroundColor: item.metadata.tokenValue }} />
          <span className={styles.tokenValue}>{item.metadata.tokenValue} (used)</span>
          <span className={styles.tokenVs}>vs</span>
          <div className={styles.tokenSwatch} style={{ backgroundColor: item.metadata.closestToken ? '#3b81f5' : '#ccc' }} />
          <span className={styles.tokenValue}>{item.metadata.closestToken} (system)</span>
        </div>
      )}

      {item.metadata.resolved ? (
        <div className={styles.resolved}>
          <span className={styles.resolvedIcon}>✅</span>
          <span>Resolved automatically</span>
          <div className={styles.actions}>
            <button
              className={styles.actionButton}
              onClick={() => onAction(item.id, 'view-details')}
            >
              View Details
            </button>
            <button
              className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
              onClick={() => onAction(item.id, 'nice')}
            >
              Nice!
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.actions}>
          {item.type === 'new-component' && (
            <>
              <button
                className={styles.actionButton}
                onClick={() => onAction(item.id, 'preview')}
              >
                Preview
              </button>
              <button
                className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                onClick={() => onAction(item.id, 'add-to-system')}
              >
                Add to System ✓
              </button>
              <button
                className={styles.actionButton}
                onClick={() => onAction(item.id, 'mark-one-off')}
              >
                Mark as One-off
              </button>
              <button
                className={`${styles.actionButton} ${styles.actionButtonMuted}`}
                onClick={() => onAction(item.id, 'ignore')}
              >
                Ignore
              </button>
            </>
          )}
          {item.type === 'undefined-token' && (
            <>
              <button
                className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                onClick={() => onAction(item.id, 'add-token')}
              >
                Add as New Token
              </button>
              <button
                className={styles.actionButton}
                onClick={() => onAction(item.id, 'map-existing')}
              >
                Map to Existing
              </button>
              <button
                className={`${styles.actionButton} ${styles.actionButtonMuted}`}
                onClick={() => onAction(item.id, 'ask-dev')}
              >
                Ask Dev to Fix
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}
