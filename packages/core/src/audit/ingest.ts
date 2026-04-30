import { z } from 'zod';
import type { Cache } from '../cache.js';
import type { GitHubClient } from '../github.js';
import type { Logger } from '../logger.js';
import { withRetry } from '../retry.js';
import type { Snapshot } from '../schemas.js';
import { IssueLabel, PrTimelineSummary, RepoSignatureStats } from './schemas.js';

/**
 * Audit-extras cache TTL. Six hours: long enough that a typical CI run hits
 * cache from the previous run on the same day, short enough that license /
 * README changes propagate within a working day.
 */
export const AUDIT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const AUDIT_CACHE_KEY_PREFIX = 'audit-extras';

// Per-page bound mirrors `core/src/ingest.ts` — guards against a misbehaving
// GraphQL endpoint paginating forever.
const MAX_PAGES = 20;
const REPOS_PAGE_SIZE = 50;
const SEARCH_PAGE_SIZE = 50;

// v0.3: per-repo enrichment. We sample the last 100 commits to derive
// signature ratios + author-email diversity, and the most recent 25 open
// issues to weight bug-debt by label.
const COMMIT_HISTORY_SAMPLE = 100;
const ISSUE_LABEL_SAMPLE = 25;
const ISSUE_LABEL_PAGE = 10;
// v0.3: per-PR timeline ceiling. Matches the 50 PR cap on userOpenPRs to
// keep cold-cache cost <= 150 GraphQL calls per audit.
const PR_TIMELINE_LIMIT = 50;

// ---------------------------------------------------------------------------
// Boundary schemas — what we promise to hand to the checks layer.
// ---------------------------------------------------------------------------

export const AuditExtrasForRepo = z.object({
  nameWithOwner: z.string(),
  licenseSpdx: z.string().nullable(),
  hasReadme: z.boolean(),
  topLevelEntries: z.array(z.string()).default([]),
  openIssuesCount: z.number().int().nonnegative(),
  oldestOpenIssueAt: z.string().datetime().nullable(),
  // v0.3: labels of recent open issues (sampled). Empty array when the
  // labels query failed or no issues are open.
  issueLabels: z.array(IssueLabel).default([]),
  // v0.3: signature + author-email aggregates over the recent commit
  // sample. `null` when commit history fetch fails or repo is empty.
  signatureStats: RepoSignatureStats.nullable().default(null),
});
export type AuditExtrasForRepo = z.infer<typeof AuditExtrasForRepo>;

export const UserOpenPR = z.object({
  number: z.number().int().nonnegative(),
  title: z.string(),
  repository: z.string(),
  url: z.string().url(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  // v0.3: per-PR timeline summary. `null` when timeline fetch fails or
  // when the PR was beyond the per-audit timeline cap.
  timeline: PrTimelineSummary.nullable().default(null),
});
export type UserOpenPR = z.infer<typeof UserOpenPR>;

/**
 * What the audit checks consume. `perRepo` is keyed by `nameWithOwner` so a
 * check can correlate a `Repository` from the `Snapshot` with its extras in
 * O(1).
 */
export interface AuditExtras {
  perRepo: Map<string, AuditExtrasForRepo>;
  userOpenPRs: UserOpenPR[];
}

// JSON shape used when round-tripping AuditExtras through Cache (which
// serializes to JSON). Maps don't survive JSON.stringify, so we flatten to an
// array of [key, value] pairs.
const AuditExtrasOnDisk = z.object({
  perRepo: z.array(z.tuple([z.string(), AuditExtrasForRepo])),
  userOpenPRs: z.array(UserOpenPR),
});
type AuditExtrasOnDisk = z.infer<typeof AuditExtrasOnDisk>;

// ---------------------------------------------------------------------------
// GraphQL response shapes (raw — not validated; we cherry-pick into
// AuditExtrasForRepo and validate that).
// ---------------------------------------------------------------------------

interface RepoExtrasNode {
  nameWithOwner: string;
  licenseInfo: { spdxId: string | null } | null;
  defaultBranchRef: {
    target: {
      // Commits expose `tree` and `history`. Tags / non-Commit targets
      // won't expose these, so the query inlines them on `... on Commit`.
      tree?: { entries: Array<{ name: string; type: string }> | null } | null;
      history?: {
        totalCount?: number;
        nodes: Array<{
          committedDate: string;
          author: { email: string | null } | null;
          signature: { isValid: boolean | null } | null;
        }> | null;
      } | null;
    } | null;
  } | null;
  // GraphQL `object(expression: "HEAD:README.md")` returns an opaque GitObject
  // when the path exists, null otherwise. We only need the typename.
  readme: { __typename: string } | null;
  issues: {
    totalCount: number;
    nodes: Array<{ createdAt: string }> | null;
  };
  // v0.3: a second `issues` connection scoped to recent open issues with
  // their labels. Aliased in the GraphQL query as `recentIssues`.
  recentIssues: {
    nodes: Array<{
      labels: { nodes: Array<{ name: string; color: string | null }> | null } | null;
    }> | null;
  };
}

// v0.3: per-PR timeline node shapes. Only the unioned cases we ask for are
// modeled; everything else flows through as `__typename` only.
interface PrTimelineNodeBase {
  __typename: string;
}
interface PrTimelineActorNode extends PrTimelineNodeBase {
  // IssueComment / PullRequestReview use `author`; ReviewRequestedEvent uses
  // `actor`. Both ultimately give us a login.
  author?: { login: string } | null;
  actor?: { login: string } | null;
  createdAt?: string;
  state?: string;
}

interface PrTimelineResult {
  repository: {
    pullRequest: {
      timelineItems: {
        totalCount: number;
        nodes: Array<PrTimelineActorNode | PrTimelineNodeBase> | null;
      };
    } | null;
  } | null;
}

interface RepoExtrasPage {
  user: {
    repositories: {
      pageInfo: { endCursor: string | null; hasNextPage: boolean };
      nodes: RepoExtrasNode[];
    };
  };
}

interface UserPRSearchResult {
  search: {
    nodes: Array<
      | {
          // Non-PullRequest hits in `is:pr` searches shouldn't happen, but the
          // search() field types each node as a union. Filter at runtime.
          __typename?: string;
          number: number;
          title: string;
          url: string;
          createdAt: string;
          updatedAt: string;
          repository: { nameWithOwner: string };
        }
      | Record<string, unknown>
    >;
  };
}

const REPO_EXTRAS_QUERY = /* GraphQL */ `
  query DPAuditRepoExtras($login: String!, $cursor: String) {
    user(login: $login) {
      repositories(
        first: ${REPOS_PAGE_SIZE}
        after: $cursor
        ownerAffiliations: OWNER
        orderBy: { field: PUSHED_AT, direction: DESC }
      ) {
        pageInfo { endCursor hasNextPage }
        nodes {
          nameWithOwner
          licenseInfo { spdxId }
          defaultBranchRef {
            target {
              ... on Commit {
                tree { entries { name type } }
                history(first: ${COMMIT_HISTORY_SAMPLE}) {
                  totalCount
                  nodes {
                    committedDate
                    author { email }
                    signature { isValid }
                  }
                }
              }
            }
          }
          readme: object(expression: "HEAD:README.md") { __typename }
          issues(states: OPEN, first: 1, orderBy: { field: CREATED_AT, direction: ASC }) {
            totalCount
            nodes { createdAt }
          }
          recentIssues: issues(
            states: OPEN
            first: ${ISSUE_LABEL_SAMPLE}
            orderBy: { field: CREATED_AT, direction: DESC }
          ) {
            nodes {
              labels(first: ${ISSUE_LABEL_PAGE}) {
                nodes { name color }
              }
            }
          }
        }
      }
    }
  }
`;

// v0.3: per-PR timeline. Only the event types that actually move the
// "who's waiting on whom" needle: review, comment, review request,
// reopen/close.
const PR_TIMELINE_QUERY = /* GraphQL */ `
  query DPPrTimeline($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        timelineItems(
          last: 30
          itemTypes: [
            PULL_REQUEST_REVIEW
            ISSUE_COMMENT
            REVIEW_REQUESTED_EVENT
            REOPENED_EVENT
            CLOSED_EVENT
          ]
        ) {
          totalCount
          nodes {
            __typename
            ... on IssueComment {
              author { login }
              createdAt
            }
            ... on PullRequestReview {
              author { login }
              createdAt
              state
            }
            ... on ReviewRequestedEvent {
              actor { login }
              createdAt
            }
          }
        }
      }
    }
  }
`;

const USER_OPEN_PRS_QUERY = /* GraphQL */ `
  query DPAuditUserOpenPRs($q: String!) {
    search(query: $q, first: ${SEARCH_PAGE_SIZE}, type: ISSUE) {
      nodes {
        __typename
        ... on PullRequest {
          number
          title
          url
          createdAt
          updatedAt
          repository { nameWithOwner }
        }
      }
    }
  }
`;

export interface IngestAuditExtrasOptions {
  client: GitHubClient;
  user: string;
  snapshot: Snapshot;
  cache?: Cache;
  logger?: Logger;
  now?: Date;
}

export async function ingestAuditExtras(opts: IngestAuditExtrasOptions): Promise<AuditExtras> {
  const { client, user, cache, logger } = opts;

  const cacheKey = cache ? `${AUDIT_CACHE_KEY_PREFIX}/${user}` : null;
  if (cache && cacheKey) {
    const cached = await cache.get<AuditExtrasOnDisk>(cacheKey);
    if (cached) {
      const parsed = AuditExtrasOnDisk.safeParse(cached);
      if (parsed.success) {
        logger?.debug({ user }, 'audit-extras cache hit');
        return {
          perRepo: new Map(parsed.data.perRepo),
          userOpenPRs: parsed.data.userOpenPRs,
        };
      }
      logger?.debug(
        { user, issues: parsed.error.issues.length },
        'audit-extras cache rejected (schema drift)',
      );
    }
  }

  const perRepo = new Map<string, AuditExtrasForRepo>();
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result: RepoExtrasPage = await withRetry(
      () =>
        client.graphql<RepoExtrasPage>(REPO_EXTRAS_QUERY, {
          login: user,
          cursor,
        }),
      {
        onRetry: (err, attempt, delay) =>
          logger?.warn(
            { user, page, attempt, delay },
            `audit-extras repo-page transient error: ${(err as Error).message?.slice(0, 80) ?? 'unknown'}`,
          ),
      },
    );
    const conn = result.user.repositories;
    for (const node of conn.nodes) {
      const extras = toRepoExtras(node, logger);
      const validated = AuditExtrasForRepo.parse(extras);
      perRepo.set(validated.nameWithOwner, validated);
    }
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }

  const searchQuery = `is:open is:pr author:${user}`;
  const prResult = await withRetry(
    () =>
      client.graphql<UserPRSearchResult>(USER_OPEN_PRS_QUERY, {
        q: searchQuery,
      }),
    {
      onRetry: (err, attempt, delay) =>
        logger?.warn(
          { user, attempt, delay },
          `audit-extras pr-search transient error: ${(err as Error).message?.slice(0, 80) ?? 'unknown'}`,
        ),
    },
  );
  const userOpenPRs: UserOpenPR[] = [];
  for (const raw of prResult.search.nodes) {
    const candidate = raw as {
      __typename?: string;
      number?: unknown;
      title?: unknown;
      url?: unknown;
      createdAt?: unknown;
      updatedAt?: unknown;
      repository?: { nameWithOwner?: unknown } | null;
    };
    if (candidate.__typename && candidate.__typename !== 'PullRequest') continue;
    if (
      typeof candidate.number !== 'number' ||
      typeof candidate.title !== 'string' ||
      typeof candidate.url !== 'string' ||
      typeof candidate.createdAt !== 'string' ||
      typeof candidate.updatedAt !== 'string' ||
      !candidate.repository ||
      typeof candidate.repository.nameWithOwner !== 'string'
    ) {
      continue;
    }
    const validated = UserOpenPR.parse({
      number: candidate.number,
      title: candidate.title,
      repository: candidate.repository.nameWithOwner,
      url: candidate.url,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
    });
    userOpenPRs.push(validated);
  }

  // v0.3: enrich each open PR with its timeline summary. Bounded to
  // PR_TIMELINE_LIMIT to keep cold-cache cost predictable. Each call is
  // independently try/caught so a single 404/network failure can't poison
  // the whole batch.
  const prTimelineCap = Math.min(userOpenPRs.length, PR_TIMELINE_LIMIT);
  for (let i = 0; i < prTimelineCap; i += 1) {
    const pr = userOpenPRs[i];
    if (!pr) continue;
    const slash = pr.repository.indexOf('/');
    if (slash <= 0) continue;
    const owner = pr.repository.slice(0, slash);
    const name = pr.repository.slice(slash + 1);
    try {
      const timelineRes = await withRetry(
        () =>
          client.graphql<PrTimelineResult>(PR_TIMELINE_QUERY, {
            owner,
            name,
            number: pr.number,
          }),
        // Per-PR timeline is best-effort; the existing try/catch around
        // this block degrades to `timeline: null` if retries also fail.
        // Cap retries to 2 so a brief outage doesn't 5x the run time.
        { maxAttempts: 2 },
      );
      const summary = computePrTimelineSummary(timelineRes, user, pr.createdAt);
      userOpenPRs[i] = { ...pr, timeline: summary };
    } catch (err) {
      logger?.warn(
        { user, pr: `${pr.repository}#${pr.number}`, err: (err as Error).message },
        'audit-extras: PR timeline fetch failed; falling back to null',
      );
    }
  }

  const extras: AuditExtras = { perRepo, userOpenPRs };

  if (cache && cacheKey) {
    const onDisk: AuditExtrasOnDisk = {
      perRepo: Array.from(perRepo.entries()),
      userOpenPRs,
    };
    await cache.set(cacheKey, onDisk, AUDIT_CACHE_TTL_MS);
  }

  return extras;
}

function toRepoExtras(node: RepoExtrasNode, logger?: Logger): AuditExtrasForRepo {
  const tree = node.defaultBranchRef?.target?.tree;
  const topLevelEntries = tree?.entries ? tree.entries.map((e) => e.name) : [];
  const oldestOpenIssue = node.issues.nodes?.[0];

  let signatureStats: RepoSignatureStats | null = null;
  try {
    signatureStats = computeSignatureStats(node);
  } catch (err) {
    logger?.warn(
      { repo: node.nameWithOwner, err: (err as Error).message },
      'audit-extras: signature stats compute failed; falling back to null',
    );
    signatureStats = null;
  }

  let issueLabels: ReturnType<typeof collectIssueLabels> = [];
  try {
    issueLabels = collectIssueLabels(node);
  } catch (err) {
    logger?.warn(
      { repo: node.nameWithOwner, err: (err as Error).message },
      'audit-extras: issue-label collect failed; falling back to []',
    );
    issueLabels = [];
  }

  return {
    nameWithOwner: node.nameWithOwner,
    licenseSpdx: node.licenseInfo?.spdxId ?? null,
    hasReadme: node.readme !== null,
    topLevelEntries,
    openIssuesCount: node.issues.totalCount,
    oldestOpenIssueAt: oldestOpenIssue?.createdAt ?? null,
    issueLabels,
    signatureStats,
  };
}

function computeSignatureStats(node: RepoExtrasNode): RepoSignatureStats | null {
  const history = node.defaultBranchRef?.target?.history;
  const nodes = history?.nodes ?? null;
  if (!nodes || nodes.length === 0) return null;

  let totalCommits = 0;
  let signedCommits = 0;
  const emails = new Set<string>();
  for (const commit of nodes) {
    if (!commit) continue;
    totalCommits += 1;
    if (commit.signature?.isValid === true) signedCommits += 1;
    const email = commit.author?.email;
    if (typeof email === 'string' && email.length > 0) {
      emails.add(email);
    }
  }
  if (totalCommits === 0) return null;
  const signatureRatio = signedCommits / totalCommits;
  return {
    totalCommits,
    signedCommits,
    signatureRatio,
    uniqueAuthorEmails: Array.from(emails).sort(),
  };
}

function collectIssueLabels(node: RepoExtrasNode): IssueLabel[] {
  const issues = node.recentIssues?.nodes ?? null;
  if (!issues) return [];
  const out: IssueLabel[] = [];
  const seen = new Set<string>();
  for (const issue of issues) {
    const labels = issue?.labels?.nodes;
    if (!labels) continue;
    for (const label of labels) {
      if (!label) continue;
      const key = `${label.name} ${label.color ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name: label.name, color: label.color ?? null });
    }
  }
  return out;
}

function computePrTimelineSummary(
  result: PrTimelineResult,
  user: string,
  fallbackCreatedAt: string,
): PrTimelineSummary {
  const items = result.repository?.pullRequest?.timelineItems;
  const totalCount = items?.totalCount ?? 0;
  const nodes = items?.nodes ?? [];

  let latestAtMs = -Infinity;
  let latestActor: string | null = null;
  for (const raw of nodes) {
    if (!raw) continue;
    const node = raw as PrTimelineActorNode;
    const createdAt = node.createdAt;
    if (typeof createdAt !== 'string') continue;
    const ms = Date.parse(createdAt);
    if (!Number.isFinite(ms)) continue;
    if (ms <= latestAtMs) continue;
    latestAtMs = ms;
    const login = node.author?.login ?? node.actor?.login ?? null;
    latestActor = typeof login === 'string' && login.length > 0 ? login : null;
  }

  if (latestAtMs === -Infinity) {
    return {
      lastActorRole: 'unknown',
      lastEventAt: fallbackCreatedAt,
      eventCount: totalCount,
    };
  }

  const role: PrTimelineSummary['lastActorRole'] =
    latestActor === null
      ? 'unknown'
      : latestActor.toLowerCase() === user.toLowerCase()
        ? 'author'
        : 'reviewer';

  return {
    lastActorRole: role,
    lastEventAt: new Date(latestAtMs).toISOString(),
    eventCount: totalCount,
  };
}
