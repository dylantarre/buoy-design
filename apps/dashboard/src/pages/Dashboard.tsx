import { useDashboardStore } from '../store/dashboard';
import { useDashboard, useInboxAction, useUpdateGuardrails } from '../api/hooks';
import { RingHero, BarHero, CardsHero } from '../components/Hero';
import { Inbox } from '../components/Inbox';
import { Guardrails } from '../components/Guardrails';
import { DeepDive } from '../components/DeepDive';
import { Activity } from '../components/Activity';
import styles from './Dashboard.module.css';

export function Dashboard() {
  const { style } = useDashboardStore();
  const { data, isLoading, error } = useDashboard();
  const inboxAction = useInboxAction();
  const updateGuardrails = useUpdateGuardrails();

  const handleInboxAction = (itemId: string, action: string) => {
    inboxAction.mutate({ itemId, action });
  };

  const handleToggleRule = (ruleId: string) => {
    if (!data?.guardrails) return;

    const updatedRules = data.guardrails.rules.map((rule) =>
      rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule
    );
    updateGuardrails.mutate({ rules: updatedRules });
  };

  const handleSensitivityChange = (sensitivity: 'relaxed' | 'balanced' | 'strict') => {
    updateGuardrails.mutate({ sensitivity });
  };

  if (isLoading) {
    return (
      <div className={styles.dashboard}>
        <div className={styles.loading}>Loading dashboard...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={styles.dashboard}>
        <div className={styles.error}>
          Failed to load dashboard. Please try again.
        </div>
      </div>
    );
  }

  const { health, inbox, guardrails, activity } = data;

  return (
    <div className={styles.dashboard}>
      {/* Hero Section - Style-specific */}
      {style === 'ring' && <RingHero health={health} />}
      {style === 'bar' && <BarHero health={health} />}
      {style === 'cards' && <CardsHero health={health} userName="Alex" />}

      {/* Shared Sections */}
      <Inbox items={inbox} onAction={handleInboxAction} />

      <Guardrails
        config={guardrails}
        onToggleRule={handleToggleRule}
        onSensitivityChange={handleSensitivityChange}
      />

      <DeepDive />

      <Activity items={activity} />
    </div>
  );
}
