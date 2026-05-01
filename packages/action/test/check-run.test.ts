import { AUDIT_SCHEMA_VERSION, type AuditFinding, type AuditReport } from '@portfoliocraft/core';
import { describe, expect, it } from 'vitest';
import { renderCheckSummary } from '../src/run.js';

const NOW_ISO = '2026-04-30T00:00:00.000Z';

function finding(over: Partial<AuditFinding> = {}): AuditFinding {
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

function summaryFor(
  bySeverity: Partial<AuditReport['summary']['bySeverity']> = {},
  totalFindings = 0,
): AuditReport['summary'] {
  return {
    totalFindings,
    bySeverity: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
      ...bySeverity,
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
      'unverified-employer-context': 0,
    },
    bugDebtScore: 0,
    reposScanned: 1,
    reposWithFindings: totalFindings === 0 ? 0 : 1,
    verifiedSignatureRatio: null,
  };
}

describe('renderCheckSummary', () => {
  it('renders the severity table with all 5 severity rows', () => {
    const out = renderCheckSummary(
      [],
      summaryFor({ critical: 1, high: 2, medium: 3, low: 4, info: 5 }, 15),
      'pass',
    );
    expect(out).toContain('| Severity | Count |');
    expect(out).toContain('| --- | --- |');
    expect(out).toContain('| critical | 1 |');
    expect(out).toContain('| high | 2 |');
    expect(out).toContain('| medium | 3 |');
    expect(out).toContain('| low | 4 |');
    expect(out).toContain('| info | 5 |');
  });

  it('writes a "**Total findings:** N" line that reflects summary.totalFindings', () => {
    const out = renderCheckSummary([], summaryFor({}, 7), 'not-evaluated');
    expect(out).toContain('**Total findings:** 7');
  });

  it('writes the "**Fail-on result:** {pass|fail|not-evaluated}" line', () => {
    const pass = renderCheckSummary([], summaryFor({}, 0), 'pass');
    const fail = renderCheckSummary([], summaryFor({ high: 1 }, 1), 'fail');
    const neutral = renderCheckSummary([], summaryFor({}, 0), 'not-evaluated');
    expect(pass).toContain('**Fail-on result:** pass');
    expect(fail).toContain('**Fail-on result:** fail');
    expect(neutral).toContain('**Fail-on result:** not-evaluated');
  });

  it('omits the "### Top findings" section when findings array is empty', () => {
    const out = renderCheckSummary([], summaryFor({}, 0), 'pass');
    expect(out).not.toContain('### Top findings');
  });

  it('lists the top 10 findings with severity tag when findings array is non-empty', () => {
    // Build 12 findings — the renderer must cap at 10.
    const findings: AuditFinding[] = Array.from({ length: 12 }, (_, i) =>
      finding({
        id: `id${i.toString().padStart(13, '0')}`,
        title: `Finding number ${i}`,
        repo: {
          owner: 'octocat',
          name: `r${i}`,
          url: `https://github.com/octocat/r${i}`,
        },
      }),
    );
    const out = renderCheckSummary(findings, summaryFor({ medium: 12 }, 12), 'fail');
    expect(out).toContain('### Top findings');
    // Severity tags + repo labels for the first 10.
    for (let i = 0; i < 10; i++) {
      expect(out).toContain(`Finding number ${i}`);
      expect(out).toContain('**[medium]**');
    }
    // Findings 10 and 11 must NOT appear (capped at 10).
    expect(out).not.toContain('Finding number 10');
    expect(out).not.toContain('Finding number 11');
  });

  it('renders user-level findings (repo === null) as "(user-level)"', () => {
    const userLevel = finding({
      id: 'aaaaaaaaaaaaaaaa',
      repo: null,
      severity: 'high',
      category: 'pr-rot',
      title: 'A cross-cutting issue',
    });
    const out = renderCheckSummary([userLevel], summaryFor({ high: 1 }, 1), 'fail');
    expect(out).toContain('(user-level)');
    expect(out).toContain('A cross-cutting issue');
    expect(out).toContain('**[high]**');
    // The repo-scoped form must NOT appear for the user-level finding.
    expect(out).not.toContain('octocat/demo');
  });

  it('renders repo-scoped findings as "{owner}/{name}"', () => {
    const repoScoped = finding({
      repo: { owner: 'octocat', name: 'specific', url: 'https://github.com/octocat/specific' },
      title: 'A repo-scoped issue',
    });
    const out = renderCheckSummary([repoScoped], summaryFor({ medium: 1 }, 1), 'pass');
    expect(out).toContain('(octocat/specific)');
    expect(out).not.toContain('(user-level)');
  });
});
