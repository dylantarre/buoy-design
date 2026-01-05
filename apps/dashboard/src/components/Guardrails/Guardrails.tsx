import type { GuardrailConfig } from '../../types';
import styles from './Guardrails.module.css';

interface GuardrailsProps {
  config: GuardrailConfig;
  onToggleRule: (ruleId: string) => void;
  onSensitivityChange: (sensitivity: 'relaxed' | 'balanced' | 'strict') => void;
}

export function Guardrails({ config, onToggleRule, onSensitivityChange }: GuardrailsProps) {
  const enabledCount = config.rules.filter((r) => r.enabled).length;

  return (
    <section className={styles.guardrails}>
      <h2 className={styles.title}>⚙️ AI Guardrails</h2>

      <div className={styles.grid}>
        <div className={styles.rulesCard}>
          <header className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Active Rules</h3>
            <span className={styles.cardCount}>{enabledCount}/{config.rules.length}</span>
          </header>

          <div className={styles.rulesList}>
            {config.rules.map((rule) => (
              <label key={rule.id} className={styles.rule}>
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={() => onToggleRule(rule.id)}
                  className={styles.ruleCheckbox}
                />
                <span className={styles.ruleName}>{rule.name}</span>
              </label>
            ))}
          </div>

          <button className={styles.editButton}>Edit Rules →</button>
        </div>

        <div className={styles.sensitivityCard}>
          <header className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>How strict should Buoy be?</h3>
          </header>

          <div className={styles.sensitivityOptions}>
            <SensitivityOption
              value="relaxed"
              label="Relaxed"
              description="Flag only major issues"
              selected={config.sensitivity === 'relaxed'}
              onChange={onSensitivityChange}
            />
            <SensitivityOption
              value="balanced"
              label="Balanced"
              description="Flag deviations, suggest fixes"
              selected={config.sensitivity === 'balanced'}
              onChange={onSensitivityChange}
            />
            <SensitivityOption
              value="strict"
              label="Strict"
              description="Block PRs with any drift"
              selected={config.sensitivity === 'strict'}
              onChange={onSensitivityChange}
            />
          </div>

          <p className={styles.sensitivityExplanation}>
            Currently: AI tools get gentle nudges and suggestions. Major issues need your review.
          </p>

          <button className={styles.editButton}>Adjust Sensitivity →</button>
        </div>
      </div>
    </section>
  );
}

interface SensitivityOptionProps {
  value: 'relaxed' | 'balanced' | 'strict';
  label: string;
  description: string;
  selected: boolean;
  onChange: (value: 'relaxed' | 'balanced' | 'strict') => void;
}

function SensitivityOption({ value, label, description, selected, onChange }: SensitivityOptionProps) {
  return (
    <label className={`${styles.sensitivityOption} ${selected ? styles.sensitivityOptionSelected : ''}`}>
      <input
        type="radio"
        name="sensitivity"
        value={value}
        checked={selected}
        onChange={() => onChange(value)}
        className={styles.sensitivityRadio}
      />
      <div className={styles.sensitivityContent}>
        <span className={styles.sensitivityLabel}>{label}</span>
        <span className={styles.sensitivityDescription}>{description}</span>
      </div>
    </label>
  );
}
