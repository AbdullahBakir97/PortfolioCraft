import { describe, expect, it } from 'vitest';
import { testsCheck } from '../../../src/audit/checks/tests.js';
import { auditCtx, extrasFor, repo } from '../fixtures.js';

describe('testsCheck', () => {
  it('flags a repo with no test directory or test files', () => {
    const ctx = auditCtx({
      repos: [repo()],
      extras: [
        extrasFor('octocat/demo', {
          topLevelEntries: ['src', 'package.json', 'README.md'],
        }),
      ],
    });
    const findings = testsCheck(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.category).toBe('tests');
    expect(findings[0]?.severity).toBe('low');
  });

  it('does not flag a repo with a lowercase test directory', () => {
    const ctx = auditCtx({
      repos: [repo()],
      extras: [extrasFor('octocat/demo', { topLevelEntries: ['src', 'tests'] })],
    });
    expect(testsCheck(ctx)).toEqual([]);
  });

  it('does not flag a repo with a mixed-case Tests/ directory (case-insensitive lookup)', () => {
    const ctx = auditCtx({
      repos: [repo()],
      extras: [
        extrasFor('octocat/demo', {
          topLevelEntries: ['src', 'Tests'],
        }),
      ],
    });
    expect(testsCheck(ctx)).toEqual([]);
  });

  it('does not flag a repo with a top-level *.test.ts file', () => {
    const ctx = auditCtx({
      repos: [repo()],
      extras: [
        extrasFor('octocat/demo', {
          topLevelEntries: ['src', 'index.test.ts'],
        }),
      ],
    });
    expect(testsCheck(ctx)).toEqual([]);
  });

  it('recognizes __tests__ and spec directories', () => {
    const a = auditCtx({
      repos: [repo({ name: 'a', nameWithOwner: 'octocat/a' })],
      extras: [extrasFor('octocat/a', { topLevelEntries: ['__tests__'] })],
    });
    const b = auditCtx({
      repos: [repo({ name: 'b', nameWithOwner: 'octocat/b' })],
      extras: [extrasFor('octocat/b', { topLevelEntries: ['spec'] })],
    });
    expect(testsCheck(a)).toEqual([]);
    expect(testsCheck(b)).toEqual([]);
  });

  it('skips archived and fork repos', () => {
    const ctx = auditCtx({
      repos: [
        repo({ name: 'a', nameWithOwner: 'octocat/a', isArchived: true }),
        repo({ name: 'b', nameWithOwner: 'octocat/b', isFork: true }),
      ],
      extras: [
        extrasFor('octocat/a', { topLevelEntries: [] }),
        extrasFor('octocat/b', { topLevelEntries: [] }),
      ],
    });
    expect(testsCheck(ctx)).toEqual([]);
  });

  it('skips repos with no extras entry', () => {
    const ctx = auditCtx({ repos: [repo()] });
    expect(testsCheck(ctx)).toEqual([]);
  });
});
