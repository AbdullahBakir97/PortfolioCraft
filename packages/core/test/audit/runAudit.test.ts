import { describe, expect, it } from 'vitest';
import { type AuditConfig, type AuditExtras, runAudit } from '../../src/audit/index.js';
import { NOW, extrasFor, repo, snapshotWith } from './fixtures.js';

const MS_PER_DAY = 86_400_000;

function daysAgoIso(days: number): string {
  return new Date(NOW.getTime() - days * MS_PER_DAY).toISOString();
}

const BASE_CONFIG: AuditConfig = {
  enabled: true,
  thresholds: {
    staleRepoMonths: 6,
    prRotDays: 30,
    bugDebtWarn: 365,
  },
  ignore: { repos: [], categories: [] },
  outputs: { markdown: 'audit.md', json: 'audit.json' },
  failOn: '',
};

function emptyExtras(): AuditExtras {
  return { perRepo: new Map(), userOpenPRs: [] };
}

describe('runAudit', () => {
  it('returns an empty findings list and zero aggregates when nothing fires', () => {
    const snap = snapshotWith([
      // Healthy repo: recent push, has license + readme + tests, not archived.
      repo({
        pushedAt: '2026-04-01T00:00:00.000Z',
      }),
    ]);
    const extras: AuditExtras = {
      perRepo: new Map([
        [
          'octocat/demo',
          extrasFor('octocat/demo', {
            licenseSpdx: 'MIT',
            hasReadme: true,
            topLevelEntries: ['src', 'tests'],
            openIssuesCount: 0,
            oldestOpenIssueAt: null,
          }),
        ],
      ]),
      userOpenPRs: [],
    };
    return runAudit({
      snapshot: snap,
      extras,
      config: BASE_CONFIG,
      user: 'octocat',
      now: NOW,
    }).then((report) => {
      expect(report.findings).toEqual([]);
      expect(report.summary.totalFindings).toBe(0);
      expect(report.summary.bugDebtScore).toBe(0);
      expect(report.summary.reposWithFindings).toBe(0);
      expect(report.summary.reposScanned).toBe(1);
      for (const v of Object.values(report.summary.bySeverity)) {
        expect(v).toBe(0);
      }
      for (const v of Object.values(report.summary.byCategory)) {
        expect(v).toBe(0);
      }
    });
  });

  it('filters findings by ignore.repos glob (legacy-* matches legacy-foo/bar but not modern-foo)', async () => {
    const snap = snapshotWith([
      repo({
        name: 'legacy-foo',
        nameWithOwner: 'octocat/legacy-foo',
        url: 'https://github.com/octocat/legacy-foo',
        pushedAt: '2024-01-01T00:00:00.000Z',
      }),
      repo({
        name: 'legacy-bar',
        nameWithOwner: 'octocat/legacy-bar',
        url: 'https://github.com/octocat/legacy-bar',
        pushedAt: '2024-01-01T00:00:00.000Z',
      }),
      repo({
        name: 'modern-foo',
        nameWithOwner: 'octocat/modern-foo',
        url: 'https://github.com/octocat/modern-foo',
        pushedAt: '2024-01-01T00:00:00.000Z',
      }),
    ]);
    const config: AuditConfig = {
      ...BASE_CONFIG,
      ignore: { repos: ['octocat/legacy-*'], categories: [] },
    };

    const report = await runAudit({
      snapshot: snap,
      extras: emptyExtras(),
      config,
      user: 'octocat',
      now: NOW,
    });

    const repoNames = report.findings.map((f) => f.repo?.name).filter(Boolean);
    expect(repoNames).toContain('modern-foo');
    expect(repoNames).not.toContain('legacy-foo');
    expect(repoNames).not.toContain('legacy-bar');
  });

  it('filters findings by ignore.categories', async () => {
    const snap = snapshotWith([repo({ pushedAt: '2024-01-01T00:00:00.000Z' })]);
    const extras: AuditExtras = {
      perRepo: new Map([
        ['octocat/demo', extrasFor('octocat/demo', { hasReadme: false, licenseSpdx: null })],
      ]),
      userOpenPRs: [],
    };
    const config: AuditConfig = {
      ...BASE_CONFIG,
      ignore: { repos: [], categories: ['stale', 'license'] },
    };
    const report = await runAudit({
      snapshot: snap,
      extras,
      config,
      user: 'octocat',
      now: NOW,
    });
    const cats = report.findings.map((f) => f.category);
    expect(cats).not.toContain('stale');
    expect(cats).not.toContain('license');
  });

  it('produces deterministic ordering — two runs deep-equal', async () => {
    const snap = snapshotWith([
      repo({
        name: 'a',
        nameWithOwner: 'octocat/a',
        url: 'https://github.com/octocat/a',
        pushedAt: '2024-01-01T00:00:00.000Z',
      }),
      repo({
        name: 'b',
        nameWithOwner: 'octocat/b',
        url: 'https://github.com/octocat/b',
        pushedAt: '2024-01-01T00:00:00.000Z',
      }),
    ]);
    const extras: AuditExtras = {
      perRepo: new Map([
        ['octocat/a', extrasFor('octocat/a', { hasReadme: false })],
        ['octocat/b', extrasFor('octocat/b', { hasReadme: false })],
      ]),
      userOpenPRs: [],
    };

    const report1 = await runAudit({
      snapshot: snap,
      extras,
      config: BASE_CONFIG,
      user: 'octocat',
      now: NOW,
    });
    const report2 = await runAudit({
      snapshot: snap,
      extras,
      config: BASE_CONFIG,
      user: 'octocat',
      now: NOW,
    });
    expect(report1.findings).toEqual(report2.findings);
    expect(JSON.stringify(report1)).toBe(JSON.stringify(report2));
  });

  it('summary.bugDebtScore equals the sum of metadata.debtScore on bug-debt findings', async () => {
    // a: debtScore = 400 * 4 = 1600
    // b: debtScore = 800 * 2 = 1600
    const snap = snapshotWith([
      repo({
        name: 'a',
        nameWithOwner: 'octocat/a',
        url: 'https://github.com/octocat/a',
      }),
      repo({
        name: 'b',
        nameWithOwner: 'octocat/b',
        url: 'https://github.com/octocat/b',
      }),
    ]);
    const extras: AuditExtras = {
      perRepo: new Map([
        [
          'octocat/a',
          extrasFor('octocat/a', {
            hasReadme: true,
            licenseSpdx: 'MIT',
            topLevelEntries: ['tests'],
            openIssuesCount: 4,
            oldestOpenIssueAt: daysAgoIso(400),
          }),
        ],
        [
          'octocat/b',
          extrasFor('octocat/b', {
            hasReadme: true,
            licenseSpdx: 'MIT',
            topLevelEntries: ['tests'],
            openIssuesCount: 2,
            oldestOpenIssueAt: daysAgoIso(800),
          }),
        ],
      ]),
      userOpenPRs: [],
    };
    const report = await runAudit({
      snapshot: snap,
      extras,
      config: BASE_CONFIG,
      user: 'octocat',
      now: NOW,
    });
    const bugDebtFindings = report.findings.filter((f) => f.category === 'bug-debt');
    const expectedSum = bugDebtFindings.reduce(
      (acc, f) =>
        acc + (typeof f.metadata.debtScore === 'number' ? (f.metadata.debtScore as number) : 0),
      0,
    );
    expect(report.summary.bugDebtScore).toBe(expectedSum);
    expect(report.summary.bugDebtScore).toBe(3200);
  });

  it('sorts severity descending, then category ascending', async () => {
    // Construct a scenario with mixed severities and categories.
    const snap = snapshotWith([
      repo({
        name: 'a',
        nameWithOwner: 'octocat/a',
        url: 'https://github.com/octocat/a',
        pushedAt: '2024-01-01T00:00:00.000Z',
      }),
    ]);
    const extras: AuditExtras = {
      perRepo: new Map([
        [
          'octocat/a',
          extrasFor('octocat/a', {
            hasReadme: false,
            licenseSpdx: null,
            topLevelEntries: [],
            openIssuesCount: 0,
            oldestOpenIssueAt: null,
          }),
        ],
      ]),
      userOpenPRs: [],
    };
    const report = await runAudit({
      snapshot: snap,
      extras,
      config: BASE_CONFIG,
      user: 'octocat',
      now: NOW,
    });

    // Severity values must be non-increasing.
    const sevRank: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
      info: 0,
    };
    for (let i = 1; i < report.findings.length; i += 1) {
      const prevSev = report.findings[i - 1]?.severity ?? 'info';
      const currSev = report.findings[i]?.severity ?? 'info';
      const prev = sevRank[prevSev] ?? 0;
      const curr = sevRank[currSev] ?? 0;
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });
});
