import { AUDIT_SCHEMA_VERSION, type AuditFinding, type AuditReport } from '@portfoliocraft/core';

export const NOW_ISO = '2026-04-30T00:00:00.000Z';

export function finding(over: Partial<AuditFinding> = {}): AuditFinding {
  return {
    id: '0123456789abcdef',
    schemaVersion: AUDIT_SCHEMA_VERSION,
    severity: 'medium',
    category: 'stale',
    repo: {
      owner: 'octocat',
      name: 'demo',
      url: 'https://github.com/octocat/demo',
    },
    title: 'Stale repository: octocat/demo',
    message: 'Last push was a long time ago.',
    evidence: [{ url: 'https://github.com/octocat/demo', label: 'Last push' }],
    suggestedAction: 'Push, archive, or remove.',
    detectedAt: NOW_ISO,
    metadata: {},
    ...over,
  };
}

export function report(over: Partial<AuditReport> = {}): AuditReport {
  const findings = over.findings ?? [];
  return {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    generatedAt: NOW_ISO,
    user: 'octocat',
    summary: {
      totalFindings: findings.length,
      bySeverity: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
      },
      byCategory: {
        stale: 0,
        license: 0,
        docs: 0,
        tests: 0,
        'pr-rot': 0,
        'bug-debt': 0,
        archived: 0,
        'archive-suggestion': 0,
      },
      bugDebtScore: 0,
      reposScanned: 1,
      reposWithFindings: findings.length === 0 ? 0 : 1,
    },
    findings,
    thresholds: {
      staleRepoMonths: 6,
      prRotDays: 30,
      bugDebtWarn: 365,
    },
    ...over,
  };
}
