import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Guardrails } from './Guardrails';
import type { GuardrailConfig } from '../../types';

const mockConfig: GuardrailConfig = {
  rules: [
    {
      id: 'rule-1',
      name: 'Block hardcoded colors',
      description: 'Prevent hardcoded color values',
      enabled: true,
      category: 'color',
    },
    {
      id: 'rule-2',
      name: 'Require spacing tokens',
      description: 'Enforce spacing scale',
      enabled: true,
      category: 'spacing',
    },
    {
      id: 'rule-3',
      name: 'Enforce typography',
      description: 'Require typography tokens',
      enabled: false,
      category: 'typography',
    },
  ],
  sensitivity: 'balanced',
};

describe('Guardrails', () => {
  it('renders the title', () => {
    render(
      <Guardrails
        config={mockConfig}
        onToggleRule={vi.fn()}
        onSensitivityChange={vi.fn()}
      />
    );
    expect(screen.getByText('⚙️ AI Guardrails')).toBeInTheDocument();
  });

  it('shows active rules count', () => {
    render(
      <Guardrails
        config={mockConfig}
        onToggleRule={vi.fn()}
        onSensitivityChange={vi.fn()}
      />
    );
    expect(screen.getByText('2/3')).toBeInTheDocument();
  });

  it('renders all rules', () => {
    render(
      <Guardrails
        config={mockConfig}
        onToggleRule={vi.fn()}
        onSensitivityChange={vi.fn()}
      />
    );
    expect(screen.getByText('Block hardcoded colors')).toBeInTheDocument();
    expect(screen.getByText('Require spacing tokens')).toBeInTheDocument();
    expect(screen.getByText('Enforce typography')).toBeInTheDocument();
  });

  it('shows enabled rules as checked', () => {
    render(
      <Guardrails
        config={mockConfig}
        onToggleRule={vi.fn()}
        onSensitivityChange={vi.fn()}
      />
    );
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).toBeChecked();
    expect(checkboxes[2]).not.toBeChecked();
  });

  it('calls onToggleRule when checkbox is clicked', () => {
    const onToggleRule = vi.fn();
    render(
      <Guardrails
        config={mockConfig}
        onToggleRule={onToggleRule}
        onSensitivityChange={vi.fn()}
      />
    );

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    expect(onToggleRule).toHaveBeenCalledWith('rule-1');
  });

  it('renders sensitivity options', () => {
    render(
      <Guardrails
        config={mockConfig}
        onToggleRule={vi.fn()}
        onSensitivityChange={vi.fn()}
      />
    );
    expect(screen.getByText('Relaxed')).toBeInTheDocument();
    expect(screen.getByText('Balanced')).toBeInTheDocument();
    expect(screen.getByText('Strict')).toBeInTheDocument();
  });

  it('shows current sensitivity as selected', () => {
    render(
      <Guardrails
        config={mockConfig}
        onToggleRule={vi.fn()}
        onSensitivityChange={vi.fn()}
      />
    );
    const balancedRadio = screen.getByRole('radio', { name: /Balanced/i });
    expect(balancedRadio).toBeChecked();
  });

  it('calls onSensitivityChange when option is selected', () => {
    const onSensitivityChange = vi.fn();
    render(
      <Guardrails
        config={mockConfig}
        onToggleRule={vi.fn()}
        onSensitivityChange={onSensitivityChange}
      />
    );

    const strictRadio = screen.getByRole('radio', { name: /Strict/i });
    fireEvent.click(strictRadio);

    expect(onSensitivityChange).toHaveBeenCalledWith('strict');
  });

  it('renders edit buttons', () => {
    render(
      <Guardrails
        config={mockConfig}
        onToggleRule={vi.fn()}
        onSensitivityChange={vi.fn()}
      />
    );
    expect(screen.getByText('Edit Rules →')).toBeInTheDocument();
    expect(screen.getByText('Adjust Sensitivity →')).toBeInTheDocument();
  });
});
