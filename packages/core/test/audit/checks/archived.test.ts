import { describe, expect, it } from 'vitest';
import { archivedCheck } from '../../../src/audit/checks/archived.js';
import { auditCtx, extrasFor, NOW, repo } from '../fixtures.js';

const MS_PER_DAY = 86_400_000;

function daysAgoIso(days: number): string {
  return new Date(NOW.getTime() - days * MS_PER_DAY).toISOString();
}

describe('archivedCheck', () => {
  it('flags an archived repo with open issues', () => {
    const ctx = auditCtx({
      repos: [repo({ isArchived: true })],
      extras: [
        extrasFor('octocat/demo', {
          openIssuesCount: 3,
          oldestOpenIssueAt: daysAgoIso(500),
        }),
      ],
    });
    const findings = archivedCheck(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('high');
    expect(findings[0]?.category).toBe('archived');
    expect(findings[0]?.metadata.openIssuesCount).toBe(3);
  });

  it('flags an archived repo with recent issue activity (oldest < 90 days)', () => {
    const ctx = auditCtx({
      repos: [repo({ isArchived: true })],
      extras: [
        extrasFor('octocat/demo', {
          openIssuesCount: 0,
          oldestOpenIssueAt: daysAgoIso(30),
        }),
      ],
    });
    const findings = archivedCheck(ctx);
    expect(findings).toHaveLength(1);
  });

  it('flags an archived repo with many forks (> 5)', () => {
    const ctx = auditCtx({
      repos: [repo({ isArchived: true, forkCount: 6 })],
      extras: [
        extrasFor('octocat/demo', {
          openIssuesCount: 0,
          oldestOpenIssueAt: null,
        }),
      ],
    });
    const findings = archivedCheck(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.metadata.forkCount).toBe(6);
  });

  it('does not flag an archived repo with no issues, no recent activity, and few forks', () => {
    const ctx = auditCtx({
      repos: [repo({ isArchived: true, forkCount: 2 })],
      extras: [
        extrasFor('octocat/demo', {
          openIssuesCount: 0,
          oldestOpenIssueAt: null,
        }),
      ],
    });
    expect(archivedCheck(ctx)).toEqual([]);
  });

  it('does not flag a non-archived repo', () => {
    const ctx = auditCtx({
      repos: [repo({ isArchived: false, forkCount: 100 })],
      extras: [
        extrasFor('octocat/demo', {
          openIssuesCount: 50,
          oldestOpenIssueAt: daysAgoIso(10),
        }),
      ],
    });
    expect(archivedCheck(ctx)).toEqual([]);
  });

  it('treats missing extras as zero issues / no recent activity (still falls through fork count)', () => {
    const ctx = auditCtx({
      repos: [repo({ isArchived: true, forkCount: 10 })],
      // no extras provided
    });
    const findings = archivedCheck(ctx);
    expect(findings).toHaveLength(1);
  });
});
