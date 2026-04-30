import { describe, expect, it, vi } from 'vitest';
import { AUDIT_CACHE_TTL_MS, ingestAuditExtras } from '../../src/audit/ingest.js';
import { memoryCache } from '../../src/cache.js';
import type { GitHubClient } from '../../src/github.js';
import { repo } from '../fixtures.js';
import { snapshotWith } from './fixtures.js';

/**
 * Build a fake `GitHubClient` whose `.graphql` returns the supplied responses
 * in order. The first call returns responses[0], the second responses[1], etc.
 */
function fakeClient(responses: unknown[]): {
  client: GitHubClient;
  calls: { query: string; variables: Record<string, unknown> }[];
} {
  const calls: { query: string; variables: Record<string, unknown> }[] = [];
  let idx = 0;
  const graphqlFn = vi.fn(async (query: string, variables: Record<string, unknown>) => {
    calls.push({ query, variables });
    const next = responses[idx++];
    if (next === undefined) {
      throw new Error('fake client ran out of responses');
    }
    return next;
  });

  // Cast: we only need .graphql to satisfy the ingest code path.
  const client = { graphql: graphqlFn, rest: {} } as unknown as GitHubClient;
  return { client, calls };
}

const REPO_PAGE_NO_NEXT = {
  user: {
    repositories: {
      pageInfo: { endCursor: null, hasNextPage: false },
      nodes: [
        {
          nameWithOwner: 'octocat/demo',
          licenseInfo: { spdxId: 'MIT' },
          defaultBranchRef: {
            target: {
              tree: {
                entries: [
                  { name: 'src', type: 'tree' },
                  { name: 'README.md', type: 'blob' },
                ],
              },
            },
          },
          readme: { __typename: 'Blob' },
          issues: {
            totalCount: 2,
            nodes: [{ createdAt: '2024-01-01T00:00:00.000Z' }],
          },
        },
      ],
    },
  },
};

const PR_SEARCH_EMPTY = {
  search: { nodes: [] },
};

const PR_SEARCH_ONE = {
  search: {
    nodes: [
      {
        __typename: 'PullRequest',
        number: 7,
        title: 'A PR',
        url: 'https://github.com/octocat/demo/pull/7',
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-15T00:00:00.000Z',
        repository: { nameWithOwner: 'octocat/demo' },
      },
    ],
  },
};

describe('ingestAuditExtras', () => {
  it('fetches a single page of repo extras and a PR list', async () => {
    const { client } = fakeClient([REPO_PAGE_NO_NEXT, PR_SEARCH_ONE]);
    const snapshot = snapshotWith([repo()]);

    const extras = await ingestAuditExtras({
      client,
      user: 'octocat',
      snapshot,
    });

    const entry = extras.perRepo.get('octocat/demo');
    expect(entry?.licenseSpdx).toBe('MIT');
    expect(entry?.hasReadme).toBe(true);
    expect(entry?.topLevelEntries).toEqual(['src', 'README.md']);
    expect(entry?.openIssuesCount).toBe(2);
    expect(entry?.oldestOpenIssueAt).toBe('2024-01-01T00:00:00.000Z');
    expect(extras.userOpenPRs).toHaveLength(1);
    expect(extras.userOpenPRs[0]?.number).toBe(7);
  });

  it('falls back to defaults when defaultBranchRef / readme / issues are missing', async () => {
    const page = {
      user: {
        repositories: {
          pageInfo: { endCursor: null, hasNextPage: false },
          nodes: [
            {
              nameWithOwner: 'octocat/empty',
              licenseInfo: null,
              defaultBranchRef: null,
              readme: null,
              issues: { totalCount: 0, nodes: [] },
            },
          ],
        },
      },
    };
    const { client } = fakeClient([page, PR_SEARCH_EMPTY]);
    const extras = await ingestAuditExtras({
      client,
      user: 'octocat',
      snapshot: snapshotWith([
        repo({
          name: 'empty',
          nameWithOwner: 'octocat/empty',
          url: 'https://github.com/octocat/empty',
        }),
      ]),
    });
    const entry = extras.perRepo.get('octocat/empty');
    expect(entry?.licenseSpdx).toBeNull();
    expect(entry?.hasReadme).toBe(false);
    expect(entry?.topLevelEntries).toEqual([]);
    expect(entry?.openIssuesCount).toBe(0);
    expect(entry?.oldestOpenIssueAt).toBeNull();
    expect(extras.userOpenPRs).toEqual([]);
  });

  it('drops PR search nodes with the wrong __typename or malformed shape', async () => {
    const prSearchWithJunk = {
      search: {
        nodes: [
          { __typename: 'Issue', number: 1, title: 't' }, // wrong type
          {
            __typename: 'PullRequest',
            number: 'not-a-number',
            title: 'bad',
          },
          {
            __typename: 'PullRequest',
            number: 2,
            title: 'good',
            url: 'https://github.com/octocat/demo/pull/2',
            createdAt: '2026-04-01T00:00:00.000Z',
            updatedAt: '2026-04-15T00:00:00.000Z',
            repository: { nameWithOwner: 'octocat/demo' },
          },
        ],
      },
    };
    const { client } = fakeClient([REPO_PAGE_NO_NEXT, prSearchWithJunk]);
    const extras = await ingestAuditExtras({
      client,
      user: 'octocat',
      snapshot: snapshotWith([repo()]),
    });
    expect(extras.userOpenPRs).toHaveLength(1);
    expect(extras.userOpenPRs[0]?.number).toBe(2);
  });

  it('writes to and reads from cache (round-trip via memoryCache)', async () => {
    const cache = memoryCache(AUDIT_CACHE_TTL_MS);
    const snapshot = snapshotWith([repo()]);

    const first = fakeClient([REPO_PAGE_NO_NEXT, PR_SEARCH_ONE]);
    const initial = await ingestAuditExtras({
      client: first.client,
      user: 'octocat',
      snapshot,
      cache,
    });
    expect(initial.perRepo.size).toBe(1);
    expect(first.calls.length).toBeGreaterThan(0);

    // Second call: a *new* fake client with no responses queued; if we hit
    // the cache nothing is fetched. If we miss, fakeClient throws.
    const second = fakeClient([]);
    const cached = await ingestAuditExtras({
      client: second.client,
      user: 'octocat',
      snapshot,
      cache,
    });
    expect(cached.perRepo.get('octocat/demo')?.licenseSpdx).toBe('MIT');
    expect(cached.userOpenPRs).toHaveLength(1);
    expect(second.calls).toHaveLength(0);
  });

  it('paginates until hasNextPage is false', async () => {
    const pageOne = {
      user: {
        repositories: {
          pageInfo: { endCursor: 'cursor-1', hasNextPage: true },
          nodes: [
            {
              nameWithOwner: 'octocat/a',
              licenseInfo: { spdxId: 'MIT' },
              defaultBranchRef: { target: { tree: { entries: [] } } },
              readme: { __typename: 'Blob' },
              issues: { totalCount: 0, nodes: [] },
            },
          ],
        },
      },
    };
    const pageTwo = {
      user: {
        repositories: {
          pageInfo: { endCursor: null, hasNextPage: false },
          nodes: [
            {
              nameWithOwner: 'octocat/b',
              licenseInfo: null,
              defaultBranchRef: { target: { tree: null } },
              readme: null,
              issues: { totalCount: 0, nodes: [] },
            },
          ],
        },
      },
    };
    const { client, calls } = fakeClient([pageOne, pageTwo, PR_SEARCH_EMPTY]);
    const extras = await ingestAuditExtras({
      client,
      user: 'octocat',
      snapshot: snapshotWith([
        repo({ name: 'a', nameWithOwner: 'octocat/a', url: 'https://github.com/octocat/a' }),
        repo({ name: 'b', nameWithOwner: 'octocat/b', url: 'https://github.com/octocat/b' }),
      ]),
    });
    expect(extras.perRepo.size).toBe(2);
    // 2 repo pages + 1 PR search.
    expect(calls).toHaveLength(3);
  });
});
