import { describe, expect, it } from 'vitest';
import { bugDebtCheck } from '../../../src/audit/checks/bug-debt.js';
import { NOW, auditCtx, extrasFor, repo } from '../fixtures.js';

const MS_PER_DAY = 86_400_000;

function daysAgoIso(days: number): string {
  return new Date(NOW.getTime() - days * MS_PER_DAY).toISOString();
}

describe('bugDebtCheck', () => {
  it('flags a repo whose oldest issue exceeds bugDebtWarn', () => {
    const ctx = auditCtx({
      repos: [repo()],
      extras: [
        extrasFor('octocat/demo', {
          openIssuesCount: 4,
          oldestOpenIssueAt: daysAgoIso(400),
        }),
      ],
    });
    const findings = bugDebtCheck(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.category).toBe('bug-debt');
    expect(findings[0]?.severity).toBe('medium');
    // debtScore = 400 days * 4 issues = 1600
    expect(findings[0]?.metadata.debtScore).toBe(1600);
    expect(findings[0]?.metadata.openIssuesCount).toBe(4);
    expect(findings[0]?.metadata.oldestAgeDays).toBe(400);
  });

  it('does not flag when the oldest issue is within the threshold', () => {
    const ctx = auditCtx({
      repos: [repo()],
      extras: [
        extrasFor('octocat/demo', {
          openIssuesCount: 10,
          oldestOpenIssueAt: daysAgoIso(100),
        }),
      ],
    });
    expect(bugDebtCheck(ctx)).toEqual([]);
  });

  it('does not flag when the repo has no open issues', () => {
    const ctx = auditCtx({
      repos: [repo()],
      extras: [
        extrasFor('octocat/demo', {
          openIssuesCount: 0,
          oldestOpenIssueAt: null,
        }),
      ],
    });
    expect(bugDebtCheck(ctx)).toEqual([]);
  });

  it('skips repos with openIssuesCount > 0 but null oldestOpenIssueAt', () => {
    const ctx = auditCtx({
      repos: [repo()],
      extras: [
        extrasFor('octocat/demo', {
          openIssuesCount: 3,
          oldestOpenIssueAt: null,
        }),
      ],
    });
    expect(bugDebtCheck(ctx)).toEqual([]);
  });

  it('skips archived and fork repos', () => {
    const ctx = auditCtx({
      repos: [
        repo({ name: 'a', nameWithOwner: 'octocat/a', isArchived: true }),
        repo({ name: 'b', nameWithOwner: 'octocat/b', isFork: true }),
      ],
      extras: [
        extrasFor('octocat/a', {
          openIssuesCount: 5,
          oldestOpenIssueAt: daysAgoIso(800),
        }),
        extrasFor('octocat/b', {
          openIssuesCount: 5,
          oldestOpenIssueAt: daysAgoIso(800),
        }),
      ],
    });
    expect(bugDebtCheck(ctx)).toEqual([]);
  });

  it('respects a custom bugDebtWarn threshold', () => {
    const ctx = auditCtx({
      repos: [repo()],
      extras: [
        extrasFor('octocat/demo', {
          openIssuesCount: 2,
          oldestOpenIssueAt: daysAgoIso(40),
        }),
      ],
      thresholds: { bugDebtWarn: 30 },
    });
    const findings = bugDebtCheck(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.metadata.debtScore).toBe(80);
  });

  it('skips repos with no extras entry', () => {
    const ctx = auditCtx({ repos: [repo()] });
    expect(bugDebtCheck(ctx)).toEqual([]);
  });
});
