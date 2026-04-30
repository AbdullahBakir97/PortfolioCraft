import { z } from 'zod';
import type { Cache } from '../cache.js';
import type { GitHubClient } from '../github.js';
import type { Logger } from '../logger.js';
import type { Snapshot } from '../schemas.js';

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
});
export type AuditExtrasForRepo = z.infer<typeof AuditExtrasForRepo>;

export const UserOpenPR = z.object({
  number: z.number().int().nonnegative(),
  title: z.string(),
  repository: z.string(),
  url: z.string().url(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
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
      // Commits expose `tree`. Tags / non-Commit targets won't, so we narrow.
      tree?: { entries: Array<{ name: string; type: string }> | null } | null;
    } | null;
  } | null;
  // GraphQL `object(expression: "HEAD:README.md")` returns an opaque GitObject
  // when the path exists, null otherwise. We only need the typename.
  readme: { __typename: string } | null;
  issues: {
    totalCount: number;
    nodes: Array<{ createdAt: string }> | null;
  };
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
              }
            }
          }
          readme: object(expression: "HEAD:README.md") { __typename }
          issues(states: OPEN, first: 1, orderBy: { field: CREATED_AT, direction: ASC }) {
            totalCount
            nodes { createdAt }
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
    const result: RepoExtrasPage = await client.graphql<RepoExtrasPage>(REPO_EXTRAS_QUERY, {
      login: user,
      cursor,
    });
    const conn = result.user.repositories;
    for (const node of conn.nodes) {
      const extras = toRepoExtras(node);
      const validated = AuditExtrasForRepo.parse(extras);
      perRepo.set(validated.nameWithOwner, validated);
    }
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }

  const searchQuery = `is:open is:pr author:${user}`;
  const prResult = await client.graphql<UserPRSearchResult>(USER_OPEN_PRS_QUERY, {
    q: searchQuery,
  });
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

function toRepoExtras(node: RepoExtrasNode): AuditExtrasForRepo {
  const tree = node.defaultBranchRef?.target?.tree;
  const topLevelEntries = tree?.entries ? tree.entries.map((e) => e.name) : [];
  const oldestOpenIssue = node.issues.nodes?.[0];
  return {
    nameWithOwner: node.nameWithOwner,
    licenseSpdx: node.licenseInfo?.spdxId ?? null,
    hasReadme: node.readme !== null,
    topLevelEntries,
    openIssuesCount: node.issues.totalCount,
    oldestOpenIssueAt: oldestOpenIssue?.createdAt ?? null,
  };
}
