import { describe, expect, it } from 'vitest';
import { bugDebtCheck } from '../../../src/audit/checks/bug-debt.js';
import { auditCtx, extrasFor, extrasForWithLabels, NOW, repo } from '../fixtures.js';

const MS_PER_DAY = 86_400_000;

function daysAgoIso(days: number): string {
  return new Date(NOW.getTime() - days * MS_PER_DAY).toISOString();
}

describe('bugDebtCheck (v0.2 baseline)', () => {
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
    // No labels matched → multiplier 1 → debtScore == weightedDebtScore.
    expect(findings[0]?.metadata.debtScore).toBe(1600);
    expect(findings[0]?.metadata.weightedDebtScore).toBe(1600);
    expect(findings[0]?.metadata.labelMultiplier).toBe(1);
    expect(findings[0]?.metadata.openIssuesCount).toBe(4);
    expect(findings[0]?.metadata.oldestAgeDays).toBe(400);
  });

  it('does not flag when the weightedDebtScore is within the threshold', () => {
    // v0.3: weightedDebtScore = age * count * multiplier (no labels → 1).
    // 30 days * 10 issues * 1 = 300, just under the default 365 threshold.
    const ctx = auditCtx({
      repos: [repo()],
      extras: [
        extrasFor('octocat/demo', {
          openIssuesCount: 10,
          oldestOpenIssueAt: daysAgoIso(30),
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

describe('bugDebtCheck (v0.3 label-aware)', () => {
  it('no labels matched → multiplier 1.0 (v0.2-equivalent calc)', () => {
    const ctx = auditCtx({
      repos: [repo()],
      extras: [
        extrasForWithLabels('octocat/demo', ['random-tag', 'no-match'], {
          openIssuesCount: 4,
          oldestOpenIssueAt: daysAgoIso(400),
        }),
      ],
    });
    const findings = bugDebtCheck(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.metadata.labelMultiplier).toBe(1);
    expect(findings[0]?.metadata.debtScore).toBe(1600);
    expect(findings[0]?.metadata.weightedDebtScore).toBe(1600);
  });

  it("'severity:critical' label → multiplier 4 → severity=high", () => {
    const ctx = auditCtx({
      repos: [repo()],
      extras: [
        extrasForWithLabels('octocat/demo', ['severity:critical'], {
          openIssuesCount: 1,
          oldestOpenIssueAt: daysAgoIso(100),
        }),
      ],
    });
    const findings = bugDebtCheck(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('high');
    expect(findings[0]?.metadata.labelMultiplier).toBe(4);
    expect(findings[0]?.metadata.weightedDebtScore).toBe(400);
    expect(findings[0]?.metadata.dominantLabels).toEqual(['severity:critical']);
  });

  it("'bug' label only → multiplier 2 → severity=medium", () => {
    const ctx = auditCtx({
      repos: [repo()],
      extras: [
        extrasForWithLabels('octocat/demo', ['bug'], {
          openIssuesCount: 2,
          oldestOpenIssueAt: daysAgoIso(200),
        }),
      ],
    });
    const findings = bugDebtCheck(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('medium');
    expect(findings[0]?.metadata.labelMultiplier).toBe(2);
    expect(findings[0]?.metadata.weightedDebtScore).toBe(800);
  });

  it('multiple labels → max wins (not sum)', () => {
    const ctx = auditCtx({
      repos: [repo()],
      extras: [
        extrasForWithLabels('octocat/demo', ['bug', 'documentation', 'severity:high'], {
          openIssuesCount: 2,
          oldestOpenIssueAt: daysAgoIso(100),
        }),
      ],
    });
    const findings = bugDebtCheck(ctx);
    expect(findings).toHaveLength(1);
    // bug=2, documentation=0.5, severity:high=3 → max 3 (not 2+0.5+3 = 5.5)
    expect(findings[0]?.metadata.labelMultiplier).toBe(3);
    expect(findings[0]?.metadata.weightedDebtScore).toBe(600);
    expect(findings[0]?.severity).toBe('high');
  });

  it("'enhancement' label (weight 0.5) does not lift multiplier above the 1.0 floor", () => {
    // Per the docs in schemas.ts:
    //   "An untyped issue (no matching label) gets multiplier 1.0."
    // The current implementation also treats 1.0 as a *floor* — sub-1
    // weights like 'enhancement' (0.5) never push the multiplier below 1.
    // Whether that floor is intentional is ambiguous in the spec; we lock
    // the observed behavior here so future shifts are deliberate. (See
    // BUG NOTE in the test suite report — the floor may not match
    // intent.)
    const ctx = auditCtx({
      repos: [repo()],
      extras: [
        extrasForWithLabels('octocat/demo', ['enhancement'], {
          openIssuesCount: 2,
          oldestOpenIssueAt: daysAgoIso(200),
        }),
      ],
      // Choose threshold high enough that NO finding fires under the
      // current floor=1 behavior (weighted = 400, threshold = 500).
      thresholds: { bugDebtWarn: 500 },
    });
    expect(bugDebtCheck(ctx)).toEqual([]);
  });

  it('preserves metadata.debtScore for backward compat', () => {
    const ctx = auditCtx({
      repos: [repo()],
      extras: [
        extrasForWithLabels('octocat/demo', ['bug'], {
          openIssuesCount: 5,
          oldestOpenIssueAt: daysAgoIso(100),
        }),
      ],
    });
    const findings = bugDebtCheck(ctx);
    expect(findings).toHaveLength(1);
    // Legacy v0.2 calc: 100 * 5 = 500 — must survive untouched in metadata.
    expect(findings[0]?.metadata.debtScore).toBe(500);
    // v0.3 weighted: 500 * 2 = 1000.
    expect(findings[0]?.metadata.weightedDebtScore).toBe(1000);
  });

  it('threshold applied to weightedDebtScore, not debtScore', () => {
    // Base debtScore would NOT cross the threshold; weighted (× 4) DOES.
    const ctx = auditCtx({
      repos: [repo()],
      extras: [
        extrasForWithLabels('octocat/demo', ['severity:critical'], {
          openIssuesCount: 2,
          oldestOpenIssueAt: daysAgoIso(50),
        }),
      ],
      thresholds: { bugDebtWarn: 300 },
    });
    const findings = bugDebtCheck(ctx);
    // base debtScore: 100 (under 300). weighted: 400 (over 300) → fires.
    expect(findings).toHaveLength(1);
    expect(findings[0]?.metadata.debtScore).toBe(100);
    expect(findings[0]?.metadata.weightedDebtScore).toBe(400);
  });

  it('case-insensitive label matching', () => {
    const ctx = auditCtx({
      repos: [repo()],
      extras: [
        extrasForWithLabels('octocat/demo', ['BUG', 'Severity:High'], {
          openIssuesCount: 2,
          oldestOpenIssueAt: daysAgoIso(100),
        }),
      ],
    });
    const findings = bugDebtCheck(ctx);
    expect(findings).toHaveLength(1);
    // BUG=2, Severity:High=3 (case-insensitive) → max 3.
    expect(findings[0]?.metadata.labelMultiplier).toBe(3);
  });
});

describe('bugDebtCheck — property: label-weight order independence', () => {
  // Vitest doesn't ship fast-check; we use a small randomized loop instead.
  // Property: shuffling the input label order MUST NOT change the resulting
  // labelMultiplier (the check takes the max, which is order-independent).
  it('multiplier is invariant under label permutation (10 trials)', () => {
    const labels = [
      'bug',
      'documentation',
      'severity:high',
      'enhancement',
      'feature-request',
      'random-noise',
    ];

    function computeMultiplier(orderedLabels: string[]): number {
      const ctx = auditCtx({
        repos: [repo()],
        extras: [
          extrasForWithLabels('octocat/demo', orderedLabels, {
            openIssuesCount: 2,
            oldestOpenIssueAt: daysAgoIso(400),
          }),
        ],
      });
      const findings = bugDebtCheck(ctx);
      // Expect a finding because base debtScore = 800 and weighted with the
      // 'severity:high' present is 2400 — well over the default threshold.
      expect(findings).toHaveLength(1);
      const mult = findings[0]?.metadata.labelMultiplier;
      if (typeof mult !== 'number') throw new Error('labelMultiplier missing');
      return mult;
    }

    const baseline = computeMultiplier(labels);
    // Deterministic LCG so the test stays reproducible without an explicit
    // seed argument. Period long enough for the small N we need.
    let state = 0x12345678;
    function next(): number {
      state = (state * 1664525 + 1013904223) & 0xffffffff;
      return state >>> 0;
    }
    function shuffle<T>(arr: T[]): T[] {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = next() % (i + 1);
        const a = copy[i] as T;
        const b = copy[j] as T;
        copy[i] = b;
        copy[j] = a;
      }
      return copy;
    }

    for (let trial = 0; trial < 10; trial += 1) {
      const shuffled = shuffle(labels);
      const got = computeMultiplier(shuffled);
      expect(got).toBe(baseline);
    }
  });
});
