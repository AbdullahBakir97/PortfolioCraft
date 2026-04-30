import { describe, expect, it } from 'vitest';
import { licenseCheck } from '../../../src/audit/checks/license.js';
import { auditCtx, extrasFor, repo } from '../fixtures.js';

describe('licenseCheck', () => {
  it('flags a repo with no detected license', () => {
    const ctx = auditCtx({
      repos: [repo()],
      extras: [extrasFor('octocat/demo', { licenseSpdx: null })],
    });
    const findings = licenseCheck(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.category).toBe('license');
    expect(findings[0]?.severity).toBe('high');
    expect(findings[0]?.evidence[0]?.url).toBe('https://github.com/octocat/demo/community');
  });

  it('does not flag a repo whose licenseSpdx is set', () => {
    const ctx = auditCtx({
      repos: [repo()],
      extras: [extrasFor('octocat/demo', { licenseSpdx: 'MIT' })],
    });
    expect(licenseCheck(ctx)).toEqual([]);
  });

  it('skips when the repo has no extras entry (cannot decide)', () => {
    const ctx = auditCtx({
      repos: [repo()],
      // no extras supplied -> perRepo map is empty
    });
    expect(licenseCheck(ctx)).toEqual([]);
  });

  it('skips archived repos and forks', () => {
    const ctx = auditCtx({
      repos: [
        repo({ name: 'a', nameWithOwner: 'octocat/a', isArchived: true }),
        repo({ name: 'b', nameWithOwner: 'octocat/b', isFork: true }),
      ],
      extras: [
        extrasFor('octocat/a', { licenseSpdx: null }),
        extrasFor('octocat/b', { licenseSpdx: null }),
      ],
    });
    expect(licenseCheck(ctx)).toEqual([]);
  });
});
