import { describe, expect, it } from 'vitest';
import { archiveSuggestionCheck } from '../../../src/audit/checks/archive-suggestion.js';
import { auditCtx, extrasFor, repo } from '../fixtures.js';

/**
 * Helper: a repo that satisfies all five conditions for a suggestion to fire —
 * not archived, not pinned, not a fork, last push >12 months ago, and
 * (paired with extras) no open issues + no license.
 */
function dormantRepo(over: Partial<Parameters<typeof repo>[0]> = {}) {
  return repo({
    pushedAt: '2024-01-01T00:00:00.000Z',
    isArchived: false,
    isPinned: false,
    isFork: false,
    ...over,
  });
}

const dormantExtras = (name = 'octocat/demo') =>
  extrasFor(name, {
    openIssuesCount: 0,
    licenseSpdx: null,
  });

describe('archiveSuggestionCheck', () => {
  it('fires when all five conditions hold', () => {
    const ctx = auditCtx({
      repos: [dormantRepo()],
      extras: [dormantExtras()],
    });
    const findings = archiveSuggestionCheck(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.category).toBe('archive-suggestion');
    expect(findings[0]?.severity).toBe('info');
  });

  it('does not fire when the repo is archived', () => {
    const ctx = auditCtx({
      repos: [dormantRepo({ isArchived: true })],
      extras: [dormantExtras()],
    });
    expect(archiveSuggestionCheck(ctx)).toEqual([]);
  });

  it('does not fire when the repo is pinned', () => {
    const ctx = auditCtx({
      repos: [dormantRepo({ isPinned: true })],
      extras: [dormantExtras()],
    });
    expect(archiveSuggestionCheck(ctx)).toEqual([]);
  });

  it('does not fire when the repo is a fork', () => {
    const ctx = auditCtx({
      repos: [dormantRepo({ isFork: true })],
      extras: [dormantExtras()],
    });
    expect(archiveSuggestionCheck(ctx)).toEqual([]);
  });

  it('does not fire when the repo has open issues', () => {
    const ctx = auditCtx({
      repos: [dormantRepo()],
      extras: [
        extrasFor('octocat/demo', {
          openIssuesCount: 1,
          licenseSpdx: null,
        }),
      ],
    });
    expect(archiveSuggestionCheck(ctx)).toEqual([]);
  });

  it('does not fire when the repo has a license', () => {
    const ctx = auditCtx({
      repos: [dormantRepo()],
      extras: [
        extrasFor('octocat/demo', {
          openIssuesCount: 0,
          licenseSpdx: 'MIT',
        }),
      ],
    });
    expect(archiveSuggestionCheck(ctx)).toEqual([]);
  });

  it('does not fire when the repo was pushed within 12 months', () => {
    const ctx = auditCtx({
      repos: [dormantRepo({ pushedAt: '2026-01-01T00:00:00.000Z' })],
      extras: [dormantExtras()],
    });
    expect(archiveSuggestionCheck(ctx)).toEqual([]);
  });

  it('skips repos with no extras entry', () => {
    const ctx = auditCtx({ repos: [dormantRepo()] });
    expect(archiveSuggestionCheck(ctx)).toEqual([]);
  });

  it('requires every condition simultaneously — flipping any one off suppresses the finding', () => {
    // Sanity check on the composite: each negative case above demonstrates
    // suppression individually; verify the full positive scenario is the only
    // one that fires.
    const positive = auditCtx({
      repos: [dormantRepo()],
      extras: [dormantExtras()],
    });
    expect(archiveSuggestionCheck(positive)).toHaveLength(1);
  });
});
