import styles from './DeepDive.module.css';

interface DeepDiveLink {
  icon: string;
  title: string;
  description: string;
  href: string;
}

const DEEP_DIVE_LINKS: DeepDiveLink[] = [
  {
    icon: '📊',
    title: 'Token Usage',
    description: 'See which tokens are used where, and which are orphaned',
    href: '/tokens',
  },
  {
    icon: '🧩',
    title: 'Component Map',
    description: 'Visual map of all components and their adoption status',
    href: '/components',
  },
  {
    icon: '📈',
    title: 'Drift History',
    description: 'How drift has trended over time across your repos',
    href: '/history',
  },
];

export function DeepDive() {
  return (
    <section className={styles.deepDive}>
      <h2 className={styles.title}>🔍 Deep Dive</h2>

      <div className={styles.grid}>
        {DEEP_DIVE_LINKS.map((link) => (
          <a key={link.href} href={link.href} className={styles.card}>
            <span className={styles.icon}>{link.icon}</span>
            <h3 className={styles.cardTitle}>{link.title}</h3>
            <p className={styles.cardDescription}>{link.description}</p>
            <span className={styles.cardLink}>Explore →</span>
          </a>
        ))}
      </div>
    </section>
  );
}
