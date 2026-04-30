import { describe, expect, it } from 'vitest';
import { prRotCheck } from '../../../src/audit/checks/pr-rot.js';
import { auditCtx, NOW, userPR, userPRWithTimeline } from '../fixtures.js';

const MS_PER_DAY = 86_400_000;

function daysAgoIso(days: number): string {
  return new Date(NOW.getTime() - days * MS_PER_DAY).toISOString();
}

describe('prRotCheck (v0.3 timeline matrix)', () => {
  it('reviewer-waiting → low severity regardless of age', () => {
    const ctx = auditCtx({
      userOpenPRs: [userPRWithTimeline({}, 'reviewer', 5)],
    });
    const findings = prRotCheck(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('low');
    expect(findings[0]?.metadata.lastActorRole).toBe('reviewer');
  });

  it('reviewer-waiting → low severity even after 200 days', () => {
    const ctx = auditCtx({
      userOpenPRs: [userPRWithTimeline({}, 'reviewer', 200)],
    });
    const findings = prRotCheck(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('low');
    expect(findings[0]?.metadata.ageDays).toBe(200);
    expect(findings[0]?.title.toLowerCase()).toContain('awaiting reviewer');
  });

  it('author-waiting + age 31 days → medium severity', () => {
    const ctx = auditCtx({
      userOpenPRs: [userPRWithTimeline({}, 'author', 31)],
    });
    const findings = prRotCheck(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('medium');
    expect(findings[0]?.metadata.lastActorRole).toBe('author');
    expect(findings[0]?.metadata.ageDays).toBe(31);
  });

  it('author-waiting + age 91 days → high severity', () => {
    const ctx = auditCtx({
      userOpenPRs: [userPRWithTimeline({}, 'author', 91)],
    });
    const findings = prRotCheck(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('high');
    expect(findings[0]?.metadata.lastActorRole).toBe('author');
  });

  it('author-waiting + age 30 days (at threshold) → no finding', () => {
    const ctx = auditCtx({
      userOpenPRs: [userPRWithTimeline({}, 'author', 30)],
    });
    expect(prRotCheck(ctx)).toEqual([]);
  });

  it('timeline null + age 31 days → medium severity (v0.2 fallback)', () => {
    const ctx = auditCtx({
      userOpenPRs: [userPR({ createdAt: daysAgoIso(31), timeline: null })],
    });
    const findings = prRotCheck(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('medium');
    expect(findings[0]?.metadata.lastActorRole).toBe('unknown');
    expect(findings[0]?.metadata.ageDays).toBe(31);
  });

  it('timeline null + age 91 days → high severity (v0.2 fallback)', () => {
    const ctx = auditCtx({
      userOpenPRs: [userPR({ createdAt: daysAgoIso(91), timeline: null })],
    });
    const findings = prRotCheck(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('high');
    expect(findings[0]?.metadata.lastActorRole).toBe('unknown');
  });

  it('exposes lastActorRole and ageDays on every finding', () => {
    const ctx = auditCtx({
      userOpenPRs: [
        userPRWithTimeline(
          { number: 1, url: 'https://github.com/octocat/demo/pull/1' },
          'author',
          60,
        ),
        userPRWithTimeline(
          { number: 2, url: 'https://github.com/octocat/demo/pull/2' },
          'reviewer',
          10,
        ),
        userPR({
          number: 3,
          url: 'https://github.com/octocat/demo/pull/3',
          createdAt: daysAgoIso(45),
          timeline: null,
        }),
      ],
    });
    const findings = prRotCheck(ctx);
    expect(findings).toHaveLength(3);
    for (const f of findings) {
      expect(f.metadata.lastActorRole).toBeDefined();
      expect(typeof f.metadata.ageDays).toBe('number');
      expect(f.metadata.ageDays).toBeGreaterThanOrEqual(0);
    }
  });

  it('emits no finding when the user has no open PRs', () => {
    const ctx = auditCtx({ userOpenPRs: [] });
    expect(prRotCheck(ctx)).toEqual([]);
  });

  it('skips PRs with un-parseable createdAt and a null timeline', () => {
    const ctx = auditCtx({
      userOpenPRs: [userPR({ createdAt: '2026-04-01T00:00:00.000Z', timeline: null })],
    });
    (ctx.extras.userOpenPRs[0] as unknown as { createdAt: string }).createdAt = 'not-a-date';
    expect(prRotCheck(ctx)).toEqual([]);
  });

  it("timeline lastActorRole === 'unknown' falls back to age-only behavior", () => {
    // Distinct from a null timeline — the timeline object exists but the
    // last actor wasn't identifiable. Should still surface old PRs via the
    // v0.2 age-from-createdAt heuristic.
    const ctx = auditCtx({
      userOpenPRs: [userPRWithTimeline({ createdAt: daysAgoIso(60) }, 'unknown', 5)],
    });
    const findings = prRotCheck(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.metadata.lastActorRole).toBe('unknown');
    // age-only path uses createdAt-based age (60), not lastEventAt (5).
    expect(findings[0]?.metadata.ageDays).toBe(60);
  });

  it('reviewer-waiting with un-parseable lastEventAt clamps ageDays to 0', () => {
    // Exercises the Number.isFinite ternary fallback in the reviewer branch.
    const pr = userPRWithTimeline({}, 'reviewer', 10);
    // Mutate after construction — schema parse already happened.
    if (pr.timeline) {
      (pr.timeline as unknown as { lastEventAt: string }).lastEventAt = 'not-a-date';
    }
    const ctx = auditCtx({ userOpenPRs: [pr] });
    const findings = prRotCheck(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('low');
    expect(findings[0]?.metadata.ageDays).toBe(0);
  });

  it('author-waiting with un-parseable lastEventAt is skipped', () => {
    const pr = userPRWithTimeline({}, 'author', 100);
    if (pr.timeline) {
      (pr.timeline as unknown as { lastEventAt: string }).lastEventAt = 'not-a-date';
    }
    const ctx = auditCtx({ userOpenPRs: [pr] });
    expect(prRotCheck(ctx)).toEqual([]);
  });
});
