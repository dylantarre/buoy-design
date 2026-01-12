import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

// ============================================================================
// Types
// ============================================================================

interface ColorToken {
  name: string;
  value: string;
  opacity: number;
  source: 'style' | 'usage';
  usageCount?: number;
}

interface TypographyToken {
  name: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: string;
  letterSpacing: string;
}

interface SpacingValue {
  value: number;
  usageCount: number;
}

interface ComponentInfo {
  id: string;
  name: string;
  description: string;
  instanceCount: number;
  variantCount: number;
}

interface AnalysisResult {
  colors: {
    defined: ColorToken[];
    used: ColorToken[];
    duplicates: Array<{ colors: ColorToken[]; suggestion: string }>;
  };
  typography: {
    defined: TypographyToken[];
    orphaned: number;
  };
  spacing: {
    values: SpacingValue[];
    hasScale: boolean;
  };
  components: {
    defined: ComponentInfo[];
    orphaned: number;
  };
  health: {
    score: number;
    breakdown: {
      colorScore: number;
      typographyScore: number;
      spacingScore: number;
      componentScore: number;
    };
  };
}

type View = 'overview' | 'colors' | 'typography' | 'spacing' | 'components' | 'export';

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    height: '100vh',
    overflow: 'auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    borderBottom: '1px solid #E7E5E4',
    paddingBottom: '12px',
  },
  logo: {
    fontSize: '24px',
  },
  title: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#1C1917',
  },
  healthCard: {
    background: '#FAFAF9',
    borderRadius: '12px',
    padding: '20px',
    textAlign: 'center' as const,
  },
  healthScore: {
    fontSize: '48px',
    fontWeight: 700,
    color: '#1C1917',
  },
  healthLabel: {
    fontSize: '14px',
    color: '#57534E',
    marginTop: '4px',
  },
  breakdown: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
    marginTop: '16px',
  },
  breakdownItem: {
    background: '#FFFFFF',
    borderRadius: '8px',
    padding: '12px',
    cursor: 'pointer',
    border: '1px solid #E7E5E4',
    transition: 'all 0.15s ease',
  },
  breakdownLabel: {
    fontSize: '11px',
    color: '#A8A29E',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  breakdownValue: {
    fontSize: '20px',
    fontWeight: 600,
    marginTop: '4px',
  },
  section: {
    marginTop: '8px',
  },
  sectionTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#1C1917',
    marginBottom: '12px',
  },
  issueCard: {
    background: '#FEF2F2',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '8px',
  },
  issueTitle: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#DC2626',
  },
  issueDescription: {
    fontSize: '11px',
    color: '#57534E',
    marginTop: '4px',
  },
  button: {
    width: '100%',
    padding: '12px',
    background: '#0EA5E9',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  secondaryButton: {
    width: '100%',
    padding: '12px',
    background: '#FFFFFF',
    color: '#1C1917',
    border: '1px solid #E7E5E4',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    marginTop: '8px',
  },
  backButton: {
    background: 'none',
    border: 'none',
    color: '#0EA5E9',
    fontSize: '12px',
    cursor: 'pointer',
    padding: '0',
    marginBottom: '12px',
  },
  colorSwatch: {
    width: '24px',
    height: '24px',
    borderRadius: '4px',
    border: '1px solid #E7E5E4',
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 0',
    borderBottom: '1px solid #F5F5F4',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #E7E5E4',
    borderTopColor: '#0EA5E9',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
};

// ============================================================================
// Components
// ============================================================================

function getScoreColor(score: number): string {
  if (score >= 90) return '#84CC16';
  if (score >= 70) return '#EAB308';
  if (score >= 50) return '#F97316';
  return '#EF4444';
}

function getScoreMessage(score: number): { title: string; description: string } {
  if (score >= 90) return {
    title: 'Looking great!',
    description: 'Your design system is solid. I can help keep your code in sync.'
  };
  if (score >= 70) return {
    title: 'Nice work!',
    description: 'A few tweaks and you\'ll be in great shape.'
  };
  if (score >= 50) return {
    title: 'Getting there!',
    description: 'Adding more styles will help me catch more drift.'
  };
  return {
    title: 'Let\'s get started!',
    description: 'Create some color and text styles so I can track them.'
  };
}

function HealthOverview({
  analysis,
  onNavigate,
}: {
  analysis: AnalysisResult;
  onNavigate: (view: View) => void;
}) {
  const { health, colors, typography, spacing, components } = analysis;
  const scoreMessage = getScoreMessage(health.score);

  // Build actionable insights
  const insights: Array<{ title: string; description: string; action: string; view: View }> = [];

  if (colors.defined.length === 0) {
    insights.push({
      title: 'No color styles defined',
      description: 'Create color styles in Figma to establish your palette',
      action: 'Learn more →',
      view: 'colors',
    });
  } else if (colors.duplicates.length > 0) {
    insights.push({
      title: `${colors.duplicates.length} similar colors found`,
      description: 'Consolidating these would simplify your palette',
      action: 'Review colors →',
      view: 'colors',
    });
  }

  if (typography.defined.length === 0) {
    insights.push({
      title: 'No text styles defined',
      description: 'Create text styles for headings, body, and UI text',
      action: 'Learn more →',
      view: 'typography',
    });
  } else if (typography.orphaned > 0) {
    insights.push({
      title: `${typography.orphaned} text nodes without styles`,
      description: 'Applying text styles ensures consistency when coded',
      action: 'See details →',
      view: 'typography',
    });
  }

  if (!spacing.hasScale && spacing.values.length > 0) {
    insights.push({
      title: 'Inconsistent spacing values',
      description: 'Using a 4px or 8px scale makes spacing predictable',
      action: 'Review spacing →',
      view: 'spacing',
    });
  }

  if (components.defined.length === 0) {
    insights.push({
      title: 'No components defined',
      description: 'Turn repeated UI elements into reusable components',
      action: 'Learn more →',
      view: 'components',
    });
  } else if (components.orphaned > 0) {
    insights.push({
      title: `${components.orphaned} detached instances`,
      description: 'These won\'t update when you change the main component',
      action: 'See details →',
      view: 'components',
    });
  }

  // Summary stats
  const stats = {
    colors: colors.defined.length,
    typography: typography.defined.length,
    components: components.defined.length,
    spacing: spacing.values.length,
  };

  return (
    <>
      <div style={styles.healthCard}>
        <div style={{ ...styles.healthScore, color: getScoreColor(health.score) }}>
          {health.score}%
        </div>
        <div style={styles.healthLabel}>{scoreMessage.title}</div>
        <div style={{ fontSize: '12px', color: '#57534E', marginTop: '8px', lineHeight: 1.4 }}>
          {scoreMessage.description}
        </div>

        <div style={styles.breakdown}>
          <div style={styles.breakdownItem} onClick={() => onNavigate('colors')}>
            <div style={styles.breakdownLabel}>Colors</div>
            <div style={{ ...styles.breakdownValue, color: getScoreColor(health.breakdown.colorScore) }}>
              {stats.colors}
            </div>
          </div>
          <div style={styles.breakdownItem} onClick={() => onNavigate('typography')}>
            <div style={styles.breakdownLabel}>Typography</div>
            <div style={{ ...styles.breakdownValue, color: getScoreColor(health.breakdown.typographyScore) }}>
              {stats.typography}
            </div>
          </div>
          <div style={styles.breakdownItem} onClick={() => onNavigate('spacing')}>
            <div style={styles.breakdownLabel}>Spacing</div>
            <div style={{ ...styles.breakdownValue, color: getScoreColor(health.breakdown.spacingScore) }}>
              {stats.spacing}
            </div>
          </div>
          <div style={styles.breakdownItem} onClick={() => onNavigate('components')}>
            <div style={styles.breakdownLabel}>Components</div>
            <div style={{ ...styles.breakdownValue, color: getScoreColor(health.breakdown.componentScore) }}>
              {stats.components}
            </div>
          </div>
        </div>
      </div>

      {insights.length > 0 ? (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>I noticed a few things</div>
          {insights.slice(0, 3).map((insight, i) => (
            <div
              key={i}
              style={{ ...styles.issueCard, cursor: 'pointer', background: '#FFFBEB' }}
              onClick={() => onNavigate(insight.view)}
            >
              <div style={{ ...styles.issueTitle, color: '#B45309' }}>{insight.title}</div>
              <div style={styles.issueDescription}>{insight.description}</div>
              <div style={{ fontSize: '11px', color: '#0EA5E9', marginTop: '6px', fontWeight: 500 }}>
                {insight.action}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ ...styles.issueCard, background: '#F0FDF4', marginTop: '8px' }}>
          <div style={{ ...styles.issueTitle, color: '#16A34A' }}>✓ All good here!</div>
          <div style={styles.issueDescription}>
            I'll keep an eye on things. Export to start tracking drift in code.
          </div>
        </div>
      )}

      <div style={{ marginTop: 'auto' }}>
        <button style={styles.button} onClick={() => onNavigate('export')}>
          Export Design Intent
        </button>
        <button
          style={styles.secondaryButton}
          onClick={() => parent.postMessage({ pluginMessage: { type: 'analyze' } }, '*')}
        >
          Re-analyze
        </button>
      </div>
    </>
  );
}

function ColorsView({
  colors,
  onBack,
}: {
  colors: AnalysisResult['colors'];
  onBack: () => void;
}) {
  return (
    <>
      <button style={styles.backButton} onClick={onBack}>
        ← Back to Overview
      </button>

      <div style={styles.sectionTitle}>
        Defined Colors ({colors.defined.length})
      </div>
      {colors.defined.map((color, i) => (
        <div key={i} style={styles.listItem}>
          <div style={{ ...styles.colorSwatch, background: color.value }} />
          <div>
            <div style={{ fontWeight: 500 }}>{color.name}</div>
            <div style={{ fontSize: '11px', color: '#A8A29E' }}>{color.value}</div>
          </div>
        </div>
      ))}

      {colors.duplicates.length > 0 && (
        <>
          <div style={{ ...styles.sectionTitle, marginTop: '16px', color: '#DC2626' }}>
            Duplicate Colors ({colors.duplicates.length})
          </div>
          {colors.duplicates.map((group, i) => (
            <div key={i} style={styles.issueCard}>
              <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                {group.colors.map((c, j) => (
                  <div key={j} style={{ ...styles.colorSwatch, background: c.value }} />
                ))}
              </div>
              <div style={{ fontSize: '11px' }}>{group.suggestion}</div>
            </div>
          ))}
        </>
      )}
    </>
  );
}

function TypographyView({
  typography,
  onBack,
}: {
  typography: AnalysisResult['typography'];
  onBack: () => void;
}) {
  return (
    <>
      <button style={styles.backButton} onClick={onBack}>
        ← Back to Overview
      </button>

      <div style={styles.sectionTitle}>
        Text Styles ({typography.defined.length})
      </div>
      {typography.defined.map((style, i) => (
        <div key={i} style={styles.listItem}>
          <div>
            <div style={{ fontWeight: 500 }}>{style.name}</div>
            <div style={{ fontSize: '11px', color: '#A8A29E' }}>
              {style.fontFamily} {style.fontWeight} · {style.fontSize}px
            </div>
          </div>
        </div>
      ))}

      {typography.orphaned > 0 && (
        <div style={{ ...styles.issueCard, marginTop: '16px' }}>
          <div style={styles.issueTitle}>{typography.orphaned} text nodes without styles</div>
          <div style={styles.issueDescription}>
            Consider applying text styles for consistency
          </div>
        </div>
      )}
    </>
  );
}

function SpacingView({
  spacing,
  onBack,
}: {
  spacing: AnalysisResult['spacing'];
  onBack: () => void;
}) {
  return (
    <>
      <button style={styles.backButton} onClick={onBack}>
        ← Back to Overview
      </button>

      <div style={styles.sectionTitle}>Spacing Values Used</div>

      {spacing.hasScale ? (
        <div style={{ ...styles.issueCard, background: '#F0FDF4', marginBottom: '16px' }}>
          <div style={{ ...styles.issueTitle, color: '#16A34A' }}>
            ✓ Following a consistent scale
          </div>
          <div style={styles.issueDescription}>Your spacing values follow a 4px/8px grid</div>
        </div>
      ) : (
        <div style={{ ...styles.issueCard, marginBottom: '16px' }}>
          <div style={styles.issueTitle}>No consistent spacing scale</div>
          <div style={styles.issueDescription}>
            Consider using multiples of 4 or 8 for spacing
          </div>
        </div>
      )}

      {spacing.values.slice(0, 10).map((value, i) => (
        <div key={i} style={styles.listItem}>
          <div
            style={{
              width: Math.min(value.value, 48),
              height: '16px',
              background: '#0EA5E9',
              borderRadius: '2px',
            }}
          />
          <div>
            <div style={{ fontWeight: 500 }}>{value.value}px</div>
            <div style={{ fontSize: '11px', color: '#A8A29E' }}>
              Used {value.usageCount} times
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

function ComponentsView({
  components,
  onBack,
}: {
  components: AnalysisResult['components'];
  onBack: () => void;
}) {
  return (
    <>
      <button style={styles.backButton} onClick={onBack}>
        ← Back to Overview
      </button>

      <div style={styles.sectionTitle}>
        Components ({components.defined.length})
      </div>
      {components.defined.map((comp, i) => (
        <div key={i} style={styles.listItem}>
          <div>
            <div style={{ fontWeight: 500 }}>{comp.name}</div>
            <div style={{ fontSize: '11px', color: '#A8A29E' }}>
              {comp.instanceCount} instances
              {comp.variantCount > 0 && ` · ${comp.variantCount} variants`}
            </div>
          </div>
        </div>
      ))}

      {components.orphaned > 0 && (
        <div style={{ ...styles.issueCard, marginTop: '16px' }}>
          <div style={styles.issueTitle}>{components.orphaned} orphaned instances</div>
          <div style={styles.issueDescription}>
            Instances without a main component in this file
          </div>
        </div>
      )}
    </>
  );
}

function ExportView({
  analysis,
  onBack,
  saving,
  saved,
  inviteUrl,
  generatingInvite,
  saveError,
}: {
  analysis: AnalysisResult;
  onBack: () => void;
  saving: boolean;
  saved: boolean;
  inviteUrl: string | null;
  generatingInvite: boolean;
  saveError: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [jsonCopied, setJsonCopied] = useState(false);

  const handleCopy = async () => {
    if (inviteUrl) {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyJson = async () => {
    const exportData = {
      source: 'figma',
      exportedAt: new Date().toISOString(),
      colors: analysis.colors.defined.map(c => ({ name: c.name, value: c.value })),
      typography: analysis.typography.defined.map(t => ({
        name: t.name,
        fontFamily: t.fontFamily,
        fontSize: t.fontSize,
        fontWeight: t.fontWeight,
      })),
      components: analysis.components.defined.map(c => ({ name: c.name, description: c.description })),
      spacing: analysis.spacing.values.slice(0, 8).map(s => s.value),
    };
    await navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
    setJsonCopied(true);
    setTimeout(() => setJsonCopied(false), 2000);
  };

  const step = saved ? (inviteUrl ? 3 : 2) : 1;
  const needsSignup = saveError !== null;

  return (
    <>
      <button style={styles.backButton} onClick={onBack}>
        ← Back to Overview
      </button>

      <div style={styles.sectionTitle}>Share Your Design System</div>

      <p style={{ fontSize: '12px', color: '#57534E', marginBottom: '16px', lineHeight: 1.5 }}>
        I'll help keep your code in sync with these design decisions.
      </p>

      {/* Summary of what's being exported */}
      <div style={{ background: '#FAFAF9', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', color: '#A8A29E', marginBottom: '8px' }}>EXPORTING:</div>
        <div style={{ fontSize: '12px', marginBottom: '4px' }}>
          {analysis.colors.defined.length > 0 ? '✓' : '○'} {analysis.colors.defined.length} color{analysis.colors.defined.length !== 1 ? 's' : ''}
        </div>
        <div style={{ fontSize: '12px', marginBottom: '4px' }}>
          {analysis.typography.defined.length > 0 ? '✓' : '○'} {analysis.typography.defined.length} text style{analysis.typography.defined.length !== 1 ? 's' : ''}
        </div>
        <div style={{ fontSize: '12px', marginBottom: '4px' }}>
          {analysis.components.defined.length > 0 ? '✓' : '○'} {analysis.components.defined.length} component{analysis.components.defined.length !== 1 ? 's' : ''}
        </div>
        <div style={{ fontSize: '12px' }}>
          {analysis.spacing.values.length > 0 ? '✓' : '○'} {Math.min(8, analysis.spacing.values.length)} spacing value{analysis.spacing.values.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          style={{ ...styles.button, flex: 1 }}
          onClick={handleCopyJson}
        >
          {jsonCopied ? '✓ Copied!' : 'Copy JSON'}
        </button>
        <button
          style={{ ...styles.button, flex: 1, background: '#16A34A' }}
          onClick={() => parent.postMessage({ pluginMessage: { type: 'create-page' } }, '*')}
        >
          Add Dashboard Page
        </button>
      </div>

      <div style={{ fontSize: '11px', color: '#57534E', marginTop: '12px', textAlign: 'center', lineHeight: 1.4 }}>
        <strong>Copy YAML</strong> for your <code style={{ background: '#F5F5F4', padding: '2px 4px', borderRadius: '3px' }}>.buoy.yaml</code>
        <br />
        <strong>Add Dashboard Page</strong> creates a health report in this file
      </div>
    </>
  );
}

// ============================================================================
// App
// ============================================================================

function App() {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('overview');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  useEffect(() => {
    window.onmessage = (event) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;

      switch (msg.type) {
        case 'analyzing':
          setLoading(true);
          setError(null);
          break;
        case 'analysis-complete':
          setAnalysis(msg.payload);
          setLoading(false);
          break;
        case 'error':
          setError(msg.payload);
          setLoading(false);
          break;
        case 'saving':
          setSaving(true);
          break;
        case 'save-complete':
          setSaving(false);
          setSaved(true);
          break;
        case 'save-error':
          setSaving(false);
          setSaveError(msg.payload || 'Failed to save');
          break;
        case 'generating-invite':
          setGeneratingInvite(true);
          break;
        case 'invite-generated':
          setGeneratingInvite(false);
          setInviteUrl(msg.payload);
          break;
        case 'invite-error':
          setGeneratingInvite(false);
          break;
      }
    };
  }, []);

  if (loading) {
    return (
      <div style={styles.loading}>
        <div style={styles.spinner} />
        <div style={{ fontSize: '12px', color: '#57534E' }}>🛟 Taking a look around...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.issueCard}>
          <div style={styles.issueTitle}>Error</div>
          <div style={styles.issueDescription}>{error}</div>
        </div>
        <button
          style={styles.button}
          onClick={() => parent.postMessage({ pluginMessage: { type: 'analyze' } }, '*')}
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!analysis) {
    return null;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.logo}>🛟</span>
        <span style={styles.title}>Buoy</span>
      </div>

      {view === 'overview' && <HealthOverview analysis={analysis} onNavigate={setView} />}
      {view === 'colors' && <ColorsView colors={analysis.colors} onBack={() => setView('overview')} />}
      {view === 'typography' && <TypographyView typography={analysis.typography} onBack={() => setView('overview')} />}
      {view === 'spacing' && <SpacingView spacing={analysis.spacing} onBack={() => setView('overview')} />}
      {view === 'components' && <ComponentsView components={analysis.components} onBack={() => setView('overview')} />}
      {view === 'export' && (
        <ExportView
          analysis={analysis}
          onBack={() => setView('overview')}
          saving={saving}
          saved={saved}
          inviteUrl={inviteUrl}
          generatingInvite={generatingInvite}
          saveError={saveError}
        />
      )}
    </div>
  );
}

// Add CSS animation
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleSheet);

// Render
const root = createRoot(document.getElementById('root')!);
root.render(<App />);
