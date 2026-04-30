import { describe, expect, it } from 'vitest';
import { staleCheck } from '../../../src/audit/checks/stale.js';
import { auditCtx, repo } from '../fixtures.js';

describe('staleCheck', () => {
  it('flags a repo whose pushedAt is older than the staleRepoMonths threshold', () => {
    const ctx = auditCtx({
      repos: [repo({ pushedAt: '2024-01-01T00:00:00.000Z' })],
    });
    const findings = staleCheck(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.category).toBe('stale');
    expect(findings[0]?.severity).toBe('medium');
    expect(findings[0]?.repo?.owner).toBe('octocat');
    expect(findings[0]?.repo?.name).toBe('demo');
  });

  it('does not flag a repo pushed within the threshold', () => {
    const ctx = auditCtx({
      repos: [repo({ pushedAt: '2026-04-01T00:00:00.000Z' })],
    });
    expect(staleCheck(ctx)).toEqual([]);
  });

  it('skips archived repos even if their pushedAt is ancient', () => {
    const ctx = auditCtx({
      repos: [repo({ pushedAt: '2020-01-01T00:00:00.000Z', isArchived: true })],
    });
    expect(staleCheck(ctx)).toEqual([]);
  });

  it('skips forks even if their pushedAt is ancient', () => {
    const ctx = auditCtx({
      repos: [repo({ pushedAt: '2020-01-01T00:00:00.000Z', isFork: true })],
    });
    expect(staleCheck(ctx)).toEqual([]);
  });

  it('skips repos whose pushedAt does not parse', () => {
    const ctx = auditCtx({
      repos: [repo({ pushedAt: '2020-01-01T00:00:00.000Z' })],
    });
    // Force an unparseable string post-validation by mutating; cast through
    // unknown so TS-strict accepts the test override.
    const repos = ctx.snapshot.repositories;
    (repos[0] as unknown as { pushedAt: string }).pushedAt = 'not-a-date';
    expect(staleCheck(ctx)).toEqual([]);
  });

  it('respects a custom staleRepoMonths threshold', () => {
    const ctx = auditCtx({
      repos: [repo({ pushedAt: '2026-01-01T00:00:00.000Z' })],
      thresholds: { staleRepoMonths: 12 },
    });
    expect(staleCheck(ctx)).toEqual([]);
  });
});
