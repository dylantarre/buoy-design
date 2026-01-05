/**
 * Dashboard Types
 */

export type DashboardStyle = 'ring' | 'bar' | 'cards';

export interface HealthData {
  percentage: number;
  componentsAligned: number;
  componentsTotal: number;
  alertCount: number;
  trend?: {
    direction: 'up' | 'down' | 'stable';
    percentage: number;
  };
  lastSyncAt: string;
}

export interface InboxItem {
  id: string;
  type: 'new-component' | 'undefined-token' | 'guardrail-catch' | 'large-deviation';
  title: string;
  description: string;
  createdAt: string;
  metadata: {
    filePath?: string;
    prNumber?: number;
    author?: string;
    similarity?: number;
    existingMatch?: string;
    tokenValue?: string;
    closestToken?: string;
    resolved?: boolean;
  };
}

export interface GuardrailRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  category: 'color' | 'spacing' | 'typography' | 'component' | 'other';
}

export interface GuardrailConfig {
  rules: GuardrailRule[];
  sensitivity: 'relaxed' | 'balanced' | 'strict';
}

export interface ActivityItem {
  id: string;
  type: 'component-added' | 'token-approved' | 'guardrail-caught' | 'marked-one-off';
  description: string;
  createdAt: string;
  success: boolean;
}

export interface DashboardData {
  health: HealthData;
  inbox: InboxItem[];
  guardrails: GuardrailConfig;
  activity: ActivityItem[];
}
