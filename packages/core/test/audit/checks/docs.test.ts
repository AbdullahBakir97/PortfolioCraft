import { describe, expect, it } from 'vitest';
import { docsCheck } from '../../../src/audit/checks/docs.js';
import { auditCtx, extrasFor, repo } from '../fixtures.js';

describe('docsCheck', () => {
  it('flags a repo missing a README', () => {
    const ctx = auditCtx({
      repos: [repo()],
      extras: [extrasFor('octocat/demo', { hasReadme: false })],
    });
    const findings = docsCheck(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.category).toBe('docs');
    expect(findings[0]?.severity).toBe('medium');
    expect(findings[0]?.title).toContain('No README');
  });

  it('does not flag a repo with a README', () => {
    const ctx = auditCtx({
      repos: [repo()],
      extras: [extrasFor('octocat/demo', { hasReadme: true })],
    });
    expect(docsCheck(ctx)).toEqual([]);
  });

  it('skips when extras are missing for the repo', () => {
    const ctx = auditCtx({ repos: [repo()] });
    expect(docsCheck(ctx)).toEqual([]);
  });

  it('skips archived and fork repos even when README is missing', () => {
    const ctx = auditCtx({
      repos: [
        repo({ name: 'a', nameWithOwner: 'octocat/a', isArchived: true }),
        repo({ name: 'b', nameWithOwner: 'octocat/b', isFork: true }),
      ],
      extras: [
        extrasFor('octocat/a', { hasReadme: false }),
        extrasFor('octocat/b', { hasReadme: false }),
      ],
    });
    expect(docsCheck(ctx)).toEqual([]);
  });
});
