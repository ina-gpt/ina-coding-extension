import React from 'react';

interface TerminalResult {
  type: 'test' | 'build' | 'lint' | string;
  passed: boolean;
  details?: string;
}

interface ReviewSummaryData {
  totalFiles: number;
  additions: number;
  deletions: number;
  riskAssessment?: {
    level: 'low' | 'medium' | 'high';
    factors: string[];
  };
  aiSummary?: string;
  terminalResults?: TerminalResult[];
  directories?: number;
  breakingChanges?: string[];
}

interface ReviewSummaryCardProps {
  summary: ReviewSummaryData;
  isLoading: boolean;
}

const RISK_STYLES: Record<string, { bg: string; color: string; icon: string }> = {
  low: { bg: 'rgba(35, 134, 54, 0.15)', color: 'var(--vscode-testing-iconPassed)', icon: '🛡️' },
  medium: { bg: 'rgba(204, 153, 0, 0.15)', color: 'var(--vscode-editorWarning-foreground)', icon: '⚠️' },
  high: { bg: 'rgba(218, 54, 51, 0.15)', color: 'var(--vscode-testing-iconFailed)', icon: '🔴' },
};

const shimmerKeyframes = `
@keyframes reviewShimmer {
  0% { background-position: -200px 0; }
  100% { background-position: 200px 0; }
}
`;

const ShimmerBlock: React.FC<{ width: string; height?: string }> = ({ width, height = '14px' }) => (
  <div style={{
    width, height, borderRadius: '4px',
    background: 'linear-gradient(90deg, var(--vscode-textBlockQuote-background) 25%, var(--vscode-editor-background) 50%, var(--vscode-textBlockQuote-background) 75%)',
    backgroundSize: '400px 100%',
    animation: 'reviewShimmer 1.5s infinite',
  }} />
);

const ReviewSummaryCard: React.FC<ReviewSummaryCardProps> = ({ summary, isLoading }) => {
  if (isLoading) {
    return (
      <div style={{
        padding: '12px', border: '1px solid var(--vscode-panel-border)',
        borderRadius: '6px', backgroundColor: 'var(--vscode-editor-background)',
      }}>
        <style>{shimmerKeyframes}</style>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <ShimmerBlock width="60%" height="16px" />
          <ShimmerBlock width="100%" />
          <ShimmerBlock width="85%" />
          <div style={{ display: 'flex', gap: '12px' }}>
            <ShimmerBlock width="80px" height="40px" />
            <ShimmerBlock width="80px" height="40px" />
            <ShimmerBlock width="80px" height="40px" />
          </div>
          <ShimmerBlock width="40%" />
        </div>
      </div>
    );
  }

  const risk = summary.riskAssessment;
  const riskStyle = risk ? RISK_STYLES[risk.level] || RISK_STYLES.low : null;

  return (
    <div style={{
      padding: '12px', border: '1px solid var(--vscode-panel-border)',
      borderRadius: '6px', backgroundColor: 'var(--vscode-editor-background)',
    }}>
      {/* AI Summary */}
      {summary.aiSummary && (
        <div style={{
          padding: '8px 10px', marginBottom: '10px',
          border: '1px solid var(--vscode-textLink-foreground)',
          borderRadius: '4px', fontSize: '12px', lineHeight: '1.5',
          color: 'var(--vscode-foreground)',
          backgroundColor: 'rgba(0, 122, 204, 0.05)',
        }}>
          {summary.aiSummary}
        </div>
      )}

      {/* Stats Grid */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '10px' }}>
        <div style={{
          flex: 1, padding: '8px', borderRadius: '4px', textAlign: 'center',
          backgroundColor: 'var(--vscode-textBlockQuote-background)',
        }}>
          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--vscode-foreground)' }}>{summary.totalFiles}</div>
          <div style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground)' }}>Files</div>
        </div>
        <div style={{
          flex: 1, padding: '8px', borderRadius: '4px', textAlign: 'center',
          backgroundColor: 'var(--vscode-textBlockQuote-background)',
        }}>
          <div style={{ fontSize: '18px', fontWeight: 700 }}>
            <span style={{ color: 'var(--vscode-testing-iconPassed)' }}>+{summary.additions}</span>
            {' / '}
            <span style={{ color: 'var(--vscode-testing-iconFailed)' }}>-{summary.deletions}</span>
          </div>
          <div style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground)' }}>Lines</div>
        </div>
        {summary.directories !== undefined && (
          <div style={{
            flex: 1, padding: '8px', borderRadius: '4px', textAlign: 'center',
            backgroundColor: 'var(--vscode-textBlockQuote-background)',
          }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--vscode-foreground)' }}>{summary.directories}</div>
            <div style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground)' }}>Directories</div>
          </div>
        )}
      </div>

      {/* Risk Assessment */}
      {risk && riskStyle && (
        <div style={{
          padding: '8px', marginBottom: '10px', borderRadius: '4px',
          backgroundColor: riskStyle.bg,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: risk.factors.length > 0 ? '6px' : '0' }}>
            <span>{riskStyle.icon}</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: riskStyle.color, textTransform: 'capitalize' }}>
              {risk.level} Risk
            </span>
          </div>
          {risk.factors.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
              {risk.factors.map((f, i) => <li key={i} style={{ marginBottom: '2px' }}>{f}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Terminal Results */}
      {summary.terminalResults && summary.terminalResults.length > 0 && (
        <div style={{ marginBottom: '10px' }}>
          {summary.terminalResults.map((result, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '4px 8px', fontSize: '11px',
              borderRadius: '3px', marginBottom: '2px',
              backgroundColor: result.passed ? 'rgba(35, 134, 54, 0.1)' : 'rgba(218, 54, 51, 0.1)',
            }}>
              <span style={{ color: result.passed ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-testing-iconFailed)' }}>
                {result.passed ? '✓' : '✗'}
              </span>
              <span style={{ color: 'var(--vscode-foreground)', textTransform: 'capitalize', fontWeight: 600 }}>{result.type}</span>
              <span style={{ color: result.passed ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-testing-iconFailed)' }}>
                {result.passed ? 'Passed' : 'Failed'}
              </span>
              {result.details && (
                <span style={{ color: 'var(--vscode-descriptionForeground)', marginLeft: 'auto' }}>{result.details}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Breaking Changes */}
      {summary.breakingChanges && summary.breakingChanges.length > 0 && (
        <div style={{
          padding: '8px', borderRadius: '4px',
          backgroundColor: 'rgba(218, 54, 51, 0.15)',
          border: '1px solid var(--vscode-testing-iconFailed)',
        }}>
          <div style={{
            fontSize: '12px', fontWeight: 700, marginBottom: '4px',
            color: 'var(--vscode-testing-iconFailed)',
          }}>Breaking Changes</div>
          <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '11px', color: 'var(--vscode-foreground)' }}>
            {summary.breakingChanges.map((bc, i) => <li key={i} style={{ marginBottom: '2px' }}>{bc}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ReviewSummaryCard;
