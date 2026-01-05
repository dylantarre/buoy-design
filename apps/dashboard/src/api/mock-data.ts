import type { DashboardData, HealthData, InboxItem, GuardrailConfig, ActivityItem } from '../types';

export const mockHealth: HealthData = {
  percentage: 94,
  componentsAligned: 47,
  componentsTotal: 52,
  alertCount: 2,
  trend: {
    direction: 'up',
    percentage: 3,
  },
  lastSyncAt: new Date().toISOString(),
};

export const mockInbox: InboxItem[] = [
  {
    id: 'inbox-1',
    type: 'new-component',
    title: 'New component: <ProductBadge>',
    description: 'AI created this during the sprint. Looks like a keeper?',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    metadata: {
      filePath: 'src/components/checkout/ProductBadge.tsx',
      prNumber: 482,
      author: 'jamie',
      similarity: 88,
      existingMatch: 'StatusBadge',
    },
  },
  {
    id: 'inbox-2',
    type: 'undefined-token',
    title: 'Undefined token: #3B82F6',
    description: 'This blue is being used in 3 places but isn\'t in your palette.',
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    metadata: {
      tokenValue: '#3B82F6',
      closestToken: '--color-blue-500',
    },
  },
  {
    id: 'inbox-3',
    type: 'guardrail-catch',
    title: 'Guardrail catch: Spacing deviation',
    description: 'AI tried to use 18px padding (your system uses 16px or 20px). Buoy suggested the fix and the dev accepted it — nice!',
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    metadata: {
      resolved: true,
    },
  },
];

export const mockGuardrails: GuardrailConfig = {
  rules: [
    {
      id: 'rule-1',
      name: 'Block hardcoded colors',
      description: 'Prevent hardcoded color values, require token usage',
      enabled: true,
      category: 'color',
    },
    {
      id: 'rule-2',
      name: 'Require spacing tokens',
      description: 'Enforce spacing scale, no arbitrary values',
      enabled: true,
      category: 'spacing',
    },
    {
      id: 'rule-3',
      name: 'Check component naming',
      description: 'Ensure new components follow naming conventions',
      enabled: true,
      category: 'component',
    },
    {
      id: 'rule-4',
      name: 'Enforce typography scale',
      description: 'Require typography tokens for font sizes',
      enabled: false,
      category: 'typography',
    },
    {
      id: 'rule-5',
      name: 'Validate border radius',
      description: 'Ensure consistent border radius values',
      enabled: false,
      category: 'other',
    },
  ],
  sensitivity: 'balanced',
};

export const mockActivity: ActivityItem[] = [
  {
    id: 'activity-1',
    type: 'component-added',
    description: '<CardHeader> added to system by you',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    success: true,
  },
  {
    id: 'activity-2',
    type: 'guardrail-caught',
    description: 'Guardrail caught 5px border-radius, dev fixed it',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    success: true,
  },
  {
    id: 'activity-3',
    type: 'token-approved',
    description: 'New token --spacing-2xs approved',
    createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    success: true,
  },
  {
    id: 'activity-4',
    type: 'marked-one-off',
    description: '<DataTable> marked as one-off (not added to system)',
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    success: false,
  },
];

export const mockDashboard: DashboardData = {
  health: mockHealth,
  inbox: mockInbox,
  guardrails: mockGuardrails,
  activity: mockActivity,
};
