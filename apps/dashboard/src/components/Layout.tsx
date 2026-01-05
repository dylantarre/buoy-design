import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import styles from './Layout.module.css';

export function Layout() {
  return (
    <div className={styles.layout}>
      <Header />
      <main className={styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        <span>Buoy</span>
        <span className={styles.dot}>•</span>
        <span>Keeping your design system shipshape</span>
      </footer>
    </div>
  );
}
