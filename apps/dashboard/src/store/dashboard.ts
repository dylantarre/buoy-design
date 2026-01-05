import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DashboardStyle } from '../types';

interface DashboardStore {
  style: DashboardStyle;
  setStyle: (style: DashboardStyle) => void;
}

export const useDashboardStore = create<DashboardStore>()(
  persist(
    (set) => ({
      style: 'ring',
      setStyle: (style) => set({ style }),
    }),
    {
      name: 'buoy-dashboard-preferences',
    }
  )
);
