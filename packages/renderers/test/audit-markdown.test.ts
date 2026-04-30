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
