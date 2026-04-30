import { describe, expect, it } from 'vitest';
import { renderAuditMarkdown } from '../src/audit-markdown.js';
import { finding, report } from './audit-fixtures.js';

describe('renderAuditMarkdown', () => {
  it('renders a 2-finding report to a fixed deterministic string', () => {
    const r = report({
      findings: [
        finding({
          id: '0000000000000001',
          severity: 'high',
          category: 'license',
          repo: {
            owner: 'octocat',
            name: 'one',
            url: 'https://github.com/octocat/one',
          },
          title: 'No LICENSE: octocat/one',
          message: 'Missing license.',
          evidence: [
            {
              url: 'https://github.com/octocat/one/community',
              label: 'Community profile',
            },
          ],
          suggestedAction: 'Add MIT or Apache-2.0.',
        }),
        finding({
          id: '0000000000000002',
          severity: 'medium',
          category: 'docs',
          repo: {
            owner: 'octocat',
            name: 'two',
            url: 'https://github.com/octocat/two',
          },
          title: 'No README: octocat/two',
          message: 'Missing README.',
          evidence: [{ url: 'https://github.com/octocat/two', label: 'Repo root' }],
          suggestedAction: 'Add a README.md.',
        }),
      ],
      summary: {
        totalFindings: 2,
        bySeverity: { critical: 0, high: 1, medium: 1, low: 0, info: 0 },
        byCategory: {
          stale: 0,
          license: 1,
          docs: 1,
          tests: 0,
          'pr-rot': 0,
          'bug-debt': 0,
          archived: 0,
          'archive-suggestion': 0,
        },
        bugDebtScore: 0,
        reposScanned: 2,
        reposWithFindings: 2,
      },
    });

    const expected = `${[
      '## Audit',
      '',
      '_Generated 2026-04-30. 2 findings across 2 repos (2 flagged)._',
      '',
      '| Severity | Count |',
      '| --- | --- |',
      '| critical | 0 |',
      '| high | 1 |',
      '| medium | 1 |',
      '| low | 0 |',
      '| info | 0 |',
      '',
      '### Findings',
      '',
      '- **[high]** `license` — No LICENSE: octocat/one',
      '  - Missing license.',
      '  - Evidence: [Community profile](https://github.com/octocat/one/community)',
      '  - **Action:** Add MIT or Apache-2.0.',
      '',
      '- **[medium]** `docs` — No README: octocat/two',
      '  - Missing README.',
      '  - Evidence: [Repo root](https://github.com/octocat/two)',
      '  - **Action:** Add a README.md.',
    ].join('\n')}\n`;

    expect(renderAuditMarkdown(r)).toBe(expected);
  });

  it('renders the empty-findings case without the table or Findings header', () => {
    const r = report({ findings: [] });
    const out = renderAuditMarkdown(r);
    expect(out).toContain('## Audit');
    expect(out).toContain('No findings');
    expect(out).not.toContain('### Findings');
    expect(out).not.toContain('| Severity | Count |');
  });

  it('produces byte-identical output across two calls (determinism)', () => {
    const r = report({
      findings: [
        finding({ id: 'aaaaaaaaaaaaaaaa' }),
        finding({ id: 'bbbbbbbbbbbbbbbb', severity: 'high', category: 'license' }),
      ],
      summary: {
        totalFindings: 2,
        bySeverity: { critical: 0, high: 1, medium: 1, low: 0, info: 0 },
        byCategory: {
          stale: 1,
          license: 1,
          docs: 0,
          tests: 0,
          'pr-rot': 0,
          'bug-debt': 0,
          archived: 0,
          'archive-suggestion': 0,
        },
        bugDebtScore: 0,
        reposScanned: 1,
        reposWithFindings: 1,
      },
    });
    const a = renderAuditMarkdown(r);
    const b = renderAuditMarkdown(r);
    expect(a).toBe(b);
  });

  it('omits the Evidence line when a finding has no evidence', () => {
    const r = report({
      findings: [finding({ id: '1111111111111111', evidence: [] })],
      summary: {
        totalFindings: 1,
        bySeverity: { critical: 0, high: 0, medium: 1, low: 0, info: 0 },
        byCategory: {
          stale: 1,
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
        reposWithFindings: 1,
      },
    });
    const out = renderAuditMarkdown(r);
    expect(out).not.toContain('Evidence:');
  });

  it('sorts findings by severity desc, then category, then repo, then id', () => {
    const r = report({
      findings: [
        // intentionally out of order
        finding({
          id: 'zzzzzzzzzzzzzzzz',
          severity: 'low',
          category: 'tests',
          repo: { owner: 'octocat', name: 'z', url: 'https://github.com/octocat/z' },
          title: 'tests',
        }),
        finding({
          id: 'aaaaaaaaaaaaaaaa',
          severity: 'critical',
          category: 'license',
          repo: { owner: 'octocat', name: 'a', url: 'https://github.com/octocat/a' },
          title: 'license-critical',
        }),
        finding({
          id: 'mmmmmmmmmmmmmmmm',
          severity: 'high',
          category: 'license',
          repo: { owner: 'octocat', name: 'b', url: 'https://github.com/octocat/b' },
          title: 'license-high',
        }),
      ],
      summary: {
        totalFindings: 3,
        bySeverity: { critical: 1, high: 1, medium: 0, low: 1, info: 0 },
        byCategory: {
          stale: 0,
          license: 2,
          docs: 0,
          tests: 1,
          'pr-rot': 0,
          'bug-debt': 0,
          archived: 0,
          'archive-suggestion': 0,
        },
        bugDebtScore: 0,
        reposScanned: 3,
        reposWithFindings: 3,
      },
    });
    const out = renderAuditMarkdown(r);
    const idxCritical = out.indexOf('license-critical');
    const idxHigh = out.indexOf('license-high');
    const idxLow = out.indexOf('tests');
    expect(idxCritical).toBeLessThan(idxHigh);
    expect(idxHigh).toBeLessThan(idxLow);
  });
});

describe('renderAuditMarkdown — v0.3 surfaces', () => {
  it('renders the "Verified signal" section when verifiedSignatureRatio is non-null', () => {
    const r = report({
      findings: [finding({ id: '0123456789abcdef' })],
      summary: {
        totalFindings: 1,
        bySeverity: { critical: 0, high: 0, medium: 1, low: 0, info: 0 },
        byCategory: {
          stale: 1,
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
        reposWithFindings: 1,
        verifiedSignatureRatio: 0.42,
      },
    });
    const out = renderAuditMarkdown(r);
    expect(out).toContain('### Verified signal');
    expect(out).toContain('Signed-commit ratio: 42%');
  });

  it('omits the "Verified signal" section when verifiedSignatureRatio is null', () => {
    const r = report({
      findings: [finding({ id: '0123456789abcdef' })],
      summary: {
        totalFindings: 1,
        bySeverity: { critical: 0, high: 0, medium: 1, low: 0, info: 0 },
        byCategory: {
          stale: 1,
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
        reposWithFindings: 1,
        verifiedSignatureRatio: null,
      },
    });
    const out = renderAuditMarkdown(r);
    expect(out).not.toContain('### Verified signal');
    expect(out).not.toContain('Signed-commit ratio');
  });

  it('bug-debt finding with metadata.labelMultiplier > 1 includes "Label weight: × N"', () => {
    const r = report({
      findings: [
        finding({
          id: 'bbbbbbbbbbbbbbbb',
          severity: 'high',
          category: 'bug-debt',
          repo: { owner: 'octocat', name: 'd', url: 'https://github.com/octocat/d' },
          title: 'Bug debt: octocat/d',
          metadata: {
            debtScore: 1000,
            weightedDebtScore: 4000,
            labelMultiplier: 4,
            dominantLabels: ['severity:critical'],
          },
        }),
      ],
      summary: {
        totalFindings: 1,
        bySeverity: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
        byCategory: {
          stale: 0,
          license: 0,
          docs: 0,
          tests: 0,
          'pr-rot': 0,
          'bug-debt': 1,
          archived: 0,
          'archive-suggestion': 0,
          'unverified-employer-context': 0,
        },
        bugDebtScore: 1000,
        reposScanned: 1,
        reposWithFindings: 1,
        verifiedSignatureRatio: null,
      },
    });
    const out = renderAuditMarkdown(r);
    expect(out).toContain('Label weight: × 4');
    expect(out).toContain('severity:critical');
  });

  it('bug-debt finding with multiplier == 1 omits the Label weight line', () => {
    const r = report({
      findings: [
        finding({
          id: 'cccccccccccccccc',
          severity: 'medium',
          category: 'bug-debt',
          repo: { owner: 'octocat', name: 'd', url: 'https://github.com/octocat/d' },
          title: 'Bug debt: octocat/d',
          metadata: {
            debtScore: 500,
            weightedDebtScore: 500,
            labelMultiplier: 1,
            dominantLabels: [],
          },
        }),
      ],
      summary: {
        totalFindings: 1,
        bySeverity: { critical: 0, high: 0, medium: 1, low: 0, info: 0 },
        byCategory: {
          stale: 0,
          license: 0,
          docs: 0,
          tests: 0,
          'pr-rot': 0,
          'bug-debt': 1,
          archived: 0,
          'archive-suggestion': 0,
          'unverified-employer-context': 0,
        },
        bugDebtScore: 500,
        reposScanned: 1,
        reposWithFindings: 1,
        verifiedSignatureRatio: null,
      },
    });
    const out = renderAuditMarkdown(r);
    expect(out).not.toContain('Label weight:');
  });

  it('pr-rot finding with metadata.lastActorRole includes "Awaiting:" line', () => {
    const r = report({
      findings: [
        finding({
          id: 'dddddddddddddddd',
          severity: 'medium',
          category: 'pr-rot',
          repo: { owner: 'octocat', name: 'd', url: 'https://github.com/octocat/d' },
          title: 'Stale PR (awaiting your response): octocat/d#1',
          metadata: {
            lastActorRole: 'author',
            ageDays: 45,
            lastEventAt: '2026-03-15T00:00:00.000Z',
          },
        }),
        finding({
          id: 'eeeeeeeeeeeeeeee',
          severity: 'low',
          category: 'pr-rot',
          repo: { owner: 'octocat', name: 'd', url: 'https://github.com/octocat/d' },
          title: 'Awaiting reviewer: octocat/d#2',
          metadata: {
            lastActorRole: 'reviewer',
            ageDays: 12,
            lastEventAt: '2026-04-18T00:00:00.000Z',
          },
        }),
      ],
      summary: {
        totalFindings: 2,
        bySeverity: { critical: 0, high: 0, medium: 1, low: 1, info: 0 },
        byCategory: {
          stale: 0,
          license: 0,
          docs: 0,
          tests: 0,
          'pr-rot': 2,
          'bug-debt': 0,
          archived: 0,
          'archive-suggestion': 0,
          'unverified-employer-context': 0,
        },
        bugDebtScore: 0,
        reposScanned: 1,
        reposWithFindings: 1,
        verifiedSignatureRatio: null,
      },
    });
    const out = renderAuditMarkdown(r);
    expect(out).toContain('Awaiting: your response (45 days)');
    expect(out).toContain('Awaiting: reviewer (12 days)');
  });

  it('two consecutive renders with v0.3 surfaces produce byte-identical output', () => {
    const r = report({
      findings: [
        finding({
          id: 'ffffffffffffffff',
          severity: 'high',
          category: 'bug-debt',
          metadata: {
            debtScore: 1000,
            weightedDebtScore: 3000,
            labelMultiplier: 3,
            dominantLabels: ['severity:high'],
          },
        }),
        finding({
          id: 'gggggggggggggggg',
          severity: 'medium',
          category: 'pr-rot',
          metadata: {
            lastActorRole: 'author',
            ageDays: 60,
            lastEventAt: '2026-03-01T00:00:00.000Z',
          },
        }),
      ],
      summary: {
        totalFindings: 2,
        bySeverity: { critical: 0, high: 1, medium: 1, low: 0, info: 0 },
        byCategory: {
          stale: 0,
          license: 0,
          docs: 0,
          tests: 0,
          'pr-rot': 1,
          'bug-debt': 1,
          archived: 0,
          'archive-suggestion': 0,
          'unverified-employer-context': 0,
        },
        bugDebtScore: 1000,
        reposScanned: 1,
        reposWithFindings: 1,
        verifiedSignatureRatio: 0.5,
      },
    });
    const a = renderAuditMarkdown(r);
    const b = renderAuditMarkdown(r);
    expect(a).toBe(b);
  });
});
