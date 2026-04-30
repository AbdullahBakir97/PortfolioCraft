import type {
  AuditCheckContext,
  AuditExtras,
  AuditExtrasForRepo,
  AuditThresholds,
  IssueLabel,
  PrTimelineSummary,
  RepoSignatureStats,
  UserOpenPR,
} from '../../src/audit/index.js';
import type { Repository, Snapshot } from '../../src/schemas.js';
import { repo as baseRepo } from '../fixtures.js';

/** Fixed clock used by every audit test so findings are deterministic. */
export const NOW = new Date('2026-04-30T00:00:00.000Z');

const MS_PER_DAY = 86_400_000;

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
 *
 * v0.3: `issueLabels` defaults to `[]` and `signatureStats` defaults to `null`
 * so check code that destructures these fields doesn't crash on legacy
 * fixtures. Callers that exercise the v0.3 surface should prefer
 * `extrasForWithLabels` / `extrasForWithSignature`.
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
    issueLabels: [],
    signatureStats: null,
    ...overrides,
  };
}

/**
 * v0.3 helper: build extras with `issueLabels` populated from a list of label
 * names. Each label gets a deterministic placeholder color so any downstream
 * test that diffs full extras stays stable.
 */
export function extrasForWithLabels(
  nameWithOwner: string,
  labels: string[],
  overrides: Partial<AuditExtrasForRepo> = {},
): AuditExtrasForRepo {
  const issueLabels: IssueLabel[] = labels.map((name) => ({ name, color: null }));
  return extrasFor(nameWithOwner, { issueLabels, ...overrides });
}

/**
 * v0.3 helper: build extras whose `signatureStats` hits the requested
 * `signedRatio` exactly. Uses a 100-commit sample so any ratio in 0.01
 * increments is representable; ratios outside [0, 1] are clamped.
 */
export function extrasForWithSignature(
  nameWithOwner: string,
  signedRatio: number,
  overrides: Partial<AuditExtrasForRepo> = {},
): AuditExtrasForRepo {
  const totalCommits = 100;
  const clamped = Math.max(0, Math.min(1, signedRatio));
  const signedCommits = Math.round(totalCommits * clamped);
  const signatureRatio = signedCommits / totalCommits;
  const signatureStats: RepoSignatureStats = {
    totalCommits,
    signedCommits,
    signatureRatio,
    uniqueAuthorEmails: [],
  };
  return extrasFor(nameWithOwner, { signatureStats, ...overrides });
}

/**
 * v0.3 default: open PR with no timeline data. Exercises the v0.2 fallback
 * path in pr-rot. `timeline` is explicitly `null` so the destructure inside
 * the check sees the fallback branch (not `undefined`, which would crash).
 */
export function userPR(overrides: Partial<UserOpenPR> = {}): UserOpenPR {
  return {
    number: 1,
    title: 'A pull request',
    repository: 'octocat/demo',
    url: 'https://github.com/octocat/demo/pull/1',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-15T00:00:00.000Z',
    timeline: null,
    ...overrides,
  };
}

/**
 * v0.3 helper: synthesize a UserOpenPR with a non-null timeline whose
 * `lastEventAt` is exactly `ageDays` before NOW. The PR's `updatedAt` mirrors
 * `lastEventAt` so any check that looks at either field stays consistent.
 *
 * `createdAt` defaults to a day before `lastEventAt` (or stays as supplied if
 * caller overrides), so a PR with `ageDays: 5` and a 'reviewer'-led timeline
 * really did exist before that final reviewer event.
 */
export function userPRWithTimeline(
  overrides: Partial<UserOpenPR>,
  role: PrTimelineSummary['lastActorRole'],
  ageDays: number,
): UserOpenPR {
  const lastEventMs = NOW.getTime() - ageDays * MS_PER_DAY;
  const lastEventAt = new Date(lastEventMs).toISOString();
  // Default createdAt to one day before the timeline event so the PR's age
  // exceeds the "last activity" age in every case.
  const defaultCreatedAt = new Date(lastEventMs - MS_PER_DAY).toISOString();
  const timeline: PrTimelineSummary = {
    lastActorRole: role,
    lastEventAt,
    eventCount: 1,
  };
  return userPR({
    createdAt: defaultCreatedAt,
    updatedAt: lastEventAt,
    timeline,
    ...overrides,
  });
}

export interface AuditCtxOverrides {
  repos?: Repository[];
  extras?: AuditExtrasForRepo[];
  userOpenPRs?: UserOpenPR[];
  thresholds?: Partial<AuditThresholds>;
  user?: string;
  now?: Date;
  /**
   * v0.3 escape hatch: callers building `employer-verified-context` test
   * cases need to set `bio`/`company` on the snapshot user. Anything passed
   * here is shallow-merged onto the default user object.
   */
  user_profile?: Partial<Snapshot['user']>;
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

  const snapshot = snapshotWith(repos);
  if (overrides.user_profile) {
    snapshot.user = { ...snapshot.user, ...overrides.user_profile };
  }

  return {
    snapshot,
    extras,
    thresholds: { ...DEFAULT_THRESHOLDS, ...(overrides.thresholds ?? {}) },
    user: overrides.user ?? 'octocat',
    now: overrides.now ?? NOW,
  };
}

export { baseRepo as repo };
