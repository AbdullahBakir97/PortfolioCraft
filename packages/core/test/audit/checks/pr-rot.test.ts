import { describe, expect, it } from 'vitest';
import { prRotCheck } from '../../../src/audit/checks/pr-rot.js';
import { NOW, auditCtx, userPR } from '../fixtures.js';

const MS_PER_DAY = 86_400_000;

function daysAgoIso(days: number): string {
  return new Date(NOW.getTime() - days * MS_PER_DAY).toISOString();
}

describe('prRotCheck', () => {
  it('flags a PR open longer than the prRotDays threshold', () => {
    const ctx = auditCtx({
      userOpenPRs: [userPR({ createdAt: daysAgoIso(45) })],
    });
    const findings = prRotCheck(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.category).toBe('pr-rot');
    expect(findings[0]?.severity).toBe('medium');
    expect(findings[0]?.metadata.ageDays).toBe(45);
  });

  it('does not flag a fresh PR within the threshold', () => {
    const ctx = auditCtx({
      userOpenPRs: [userPR({ createdAt: daysAgoIso(10) })],
    });
    expect(prRotCheck(ctx)).toEqual([]);
  });

  it('escalates severity to high when the PR is older than 90 days', () => {
    const ctx = auditCtx({
      userOpenPRs: [userPR({ createdAt: daysAgoIso(91) })],
    });
    const findings = prRotCheck(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('high');
  });

  it('keeps severity medium at exactly 90 days (transition is > 90)', () => {
    const ctx = auditCtx({
      userOpenPRs: [userPR({ createdAt: daysAgoIso(90) })],
    });
    const findings = prRotCheck(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('medium');
  });

  it('skips PRs whose createdAt does not parse', () => {
    const ctx = auditCtx({
      userOpenPRs: [userPR({ createdAt: '2026-04-01T00:00:00.000Z' })],
    });
    (ctx.extras.userOpenPRs[0] as unknown as { createdAt: string }).createdAt = 'not-a-date';
    expect(prRotCheck(ctx)).toEqual([]);
  });

  it('emits no finding when the user has no open PRs', () => {
    const ctx = auditCtx({ userOpenPRs: [] });
    expect(prRotCheck(ctx)).toEqual([]);
  });
});
