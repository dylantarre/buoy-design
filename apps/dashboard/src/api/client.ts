import type { DashboardData, HealthData, InboxItem, GuardrailConfig, ActivityItem } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8787';

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

export const api = {
  getDashboard: () => fetchApi<DashboardData>('/dashboard'),

  getHealth: () => fetchApi<HealthData>('/dashboard/health'),

  getInbox: () => fetchApi<InboxItem[]>('/dashboard/inbox'),

  getGuardrails: () => fetchApi<GuardrailConfig>('/dashboard/guardrails'),

  getActivity: () => fetchApi<ActivityItem[]>('/dashboard/activity'),

  performInboxAction: (itemId: string, action: string) =>
    fetchApi<{ success: boolean }>(`/dashboard/inbox/${itemId}/action`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),

  updateGuardrails: (config: Partial<GuardrailConfig>) =>
    fetchApi<GuardrailConfig>('/dashboard/guardrails', {
      method: 'PATCH',
      body: JSON.stringify(config),
    }),
};
