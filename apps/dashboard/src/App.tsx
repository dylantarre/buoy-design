import { Routes, Route } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { Layout } from './components/Layout';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
      </Route>
    </Routes>
  );
}
