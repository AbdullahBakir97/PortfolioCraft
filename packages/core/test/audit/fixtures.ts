import type {
  AuditCheckContext,
  AuditExtras,
  AuditExtrasForRepo,
  AuditThresholds,
  UserOpenPR,
} from '../../src/audit/index.js';
import type { Repository, Snapshot } from '../../src/schemas.js';
import { repo as baseRepo } from '../fixtures.js';

/** Fixed clock used by every audit test so findings are deterministic. */
export const NOW = new Date('2026-04-30T00:00:00.000Z');

export const DEFAULT_THRESHOLDS: AuditThresholds = {
  staleRepoMonths: 6,
  prRotDays: 30,
  bugDebtWarn: 365,
};

/**
 * Build a minimal-but-valid Snapshot wrapping the supplied repos. The user
 * profile and contribution summary are not consulted by any check, but they
 * still have to satisfy the Zod schemas.
 */
export function snapshotWith(repos: Repository[]): Snapshot {
  return {
    fetchedAt: NOW.toISOString(),
    user: {
      login: 'octocat',
      name: 'Octo Cat',
      bio: null,
      company: null,
      location: null,
      websiteUrl: null,
      avatarUrl: 'https://github.com/octocat.png',
      followers: 0,
      publicRepos: repos.length,
      createdAt: '2020-01-01T00:00:00.000Z',
    },
    repositories: repos,
    contributions: {
      totalCommits: 0,
      totalPRs: 0,
      totalIssues: 0,
      totalReviews: 0,
      reposContributedTo: 0,
    },
  };
}

/**
 * Default extras for a repo: missing license, missing README, no test dir, no
 * open issues. With these defaults the license/docs/tests checks fire by
 * default; tests opt out per case.
 */
export function extrasFor(
  nameWithOwner: string,
  overrides: Partial<AuditExtrasForRepo> = {},
): AuditExtrasForRepo {
  return {
    nameWithOwner,
    licenseSpdx: null,
    hasReadme: false,
    topLevelEntries: [],
    openIssuesCount: 0,
    oldestOpenIssueAt: null,
    ...overrides,
  };
}

export function userPR(overrides: Partial<UserOpenPR> = {}): UserOpenPR {
  return {
    number: 1,
    title: 'A pull request',
    repository: 'octocat/demo',
    url: 'https://github.com/octocat/demo/pull/1',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-15T00:00:00.000Z',
    ...overrides,
  };
}

export interface AuditCtxOverrides {
  repos?: Repository[];
  extras?: AuditExtrasForRepo[];
  userOpenPRs?: UserOpenPR[];
  thresholds?: Partial<AuditThresholds>;
  user?: string;
  now?: Date;
}

/**
 * Build a valid AuditCheckContext. Defaults to a single demo repo with no
 * extras entry — callers typically pass `extras: [extrasFor(...)]` to wire up
 * the perRepo map.
 */
export function auditCtx(overrides: AuditCtxOverrides = {}): AuditCheckContext {
  const repos = overrides.repos ?? [baseRepo()];
  const extrasList = overrides.extras ?? [];
  const perRepo = new Map<string, AuditExtrasForRepo>();
  for (const e of extrasList) perRepo.set(e.nameWithOwner, e);

  const extras: AuditExtras = {
    perRepo,
    userOpenPRs: overrides.userOpenPRs ?? [],
  };

  return {
    snapshot: snapshotWith(repos),
    extras,
    thresholds: { ...DEFAULT_THRESHOLDS, ...(overrides.thresholds ?? {}) },
    user: overrides.user ?? 'octocat',
    now: overrides.now ?? NOW,
  };
}

export { baseRepo as repo };
