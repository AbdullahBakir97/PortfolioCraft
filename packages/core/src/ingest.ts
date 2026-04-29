import type { Cache } from './cache.js';
import { classifyRepository } from './classification.js';
import { applyFilters, keptRepos } from './filters.js';
import type { GitHubClient } from './github.js';
import type { Logger } from './logger.js';
import type {
  ContributionSummary,
  PortfolioConfig,
  PortfolioReport,
  ProjectEntry,
  Repository,
  Snapshot,
  UserProfile,
} from './schemas.js';
import { scoreStack } from './scoring.js';

interface UserAndReposGraphQL {
  user: {
    login: string;
    name: string | null;
    bio: string | null;
    company: string | null;
    location: string | null;
    websiteUrl: string | null;
    avatarUrl: string;
    createdAt: string;
    followers: { totalCount: number };
    repositories: { totalCount: number };
    pinnedItems: { nodes: Array<{ nameWithOwner: string }> };
    contributionsCollection: {
      totalCommitContributions: number;
      totalPullRequestContributions: number;
      totalIssueContributions: number;
      totalPullRequestReviewContributions: number;
      totalRepositoriesWithContributedCommits: number;
    };
  };
}

interface RepositoryNode {
  name: string;
  nameWithOwner: string;
  description: string | null;
  url: string;
  homepageUrl: string | null;
  stargazerCount: number;
  forkCount: number;
  isFork: boolean;
  isArchived: boolean;
  isPrivate: boolean;
  pushedAt: string;
  createdAt: string;
  primaryLanguage: { name: string } | null;
  repositoryTopics: { nodes: Array<{ topic: { name: string } }> };
  languages: { edges: Array<{ size: number; node: { name: string } }> };
}

interface ReposPage {
  user: {
    repositories: {
      pageInfo: { endCursor: string | null; hasNextPage: boolean };
      nodes: RepositoryNode[];
    };
  };
}

const USER_QUERY = /* GraphQL */ `
  query DPUserHeader($login: String!) {
    user(login: $login) {
      login
      name
      bio
      company
      location
      websiteUrl
      avatarUrl
      createdAt
      followers { totalCount }
      repositories(ownerAffiliations: OWNER, privacy: PUBLIC) { totalCount }
      pinnedItems(first: 6, types: [REPOSITORY]) {
        nodes { ... on Repository { nameWithOwner } }
      }
      contributionsCollection {
        totalCommitContributions
        totalPullRequestContributions
        totalIssueContributions
        totalPullRequestReviewContributions
        totalRepositoriesWithContributedCommits
      }
    }
  }
`;

const REPOS_QUERY = /* GraphQL */ `
  query DPRepos($login: String!, $cursor: String) {
    user(login: $login) {
      repositories(
        first: 50
        after: $cursor
        ownerAffiliations: OWNER
        orderBy: { field: PUSHED_AT, direction: DESC }
      ) {
        pageInfo { endCursor hasNextPage }
        nodes {
          name
          nameWithOwner
          description
          url
          homepageUrl
          stargazerCount
          forkCount
          isFork
          isArchived
          isPrivate
          pushedAt
          createdAt
          primaryLanguage { name }
          repositoryTopics(first: 15) { nodes { topic { name } } }
          languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
            edges { size node { name } }
          }
        }
      }
    }
  }
`;

export interface IngestOptions {
  client: GitHubClient;
  user: string;
  cache?: Cache;
  logger?: Logger;
  now?: Date;
}

export async function ingestSnapshot(opts: IngestOptions): Promise<Snapshot> {
  const { client, user, cache, logger } = opts;
  const now = opts.now ?? new Date();

  const cacheKey = cache ? `snapshot/${user}` : null;
  if (cache && cacheKey) {
    const cached = await cache.get<Snapshot>(cacheKey);
    if (cached) {
      logger?.debug({ user }, 'snapshot cache hit');
      return cached;
    }
  }

  const userResult = await client.graphql<UserAndReposGraphQL>(USER_QUERY, { login: user });
  const u = userResult.user;
  const profile: UserProfile = {
    login: u.login,
    name: u.name,
    bio: u.bio,
    company: u.company,
    location: u.location,
    websiteUrl: u.websiteUrl,
    avatarUrl: u.avatarUrl,
    followers: u.followers.totalCount,
    publicRepos: u.repositories.totalCount,
    createdAt: u.createdAt,
  };
  const pinnedSet = new Set(u.pinnedItems.nodes.map((n) => n.nameWithOwner));
  const contributions: ContributionSummary = {
    totalCommits: u.contributionsCollection.totalCommitContributions,
    totalPRs: u.contributionsCollection.totalPullRequestContributions,
    totalIssues: u.contributionsCollection.totalIssueContributions,
    totalReviews: u.contributionsCollection.totalPullRequestReviewContributions,
    reposContributedTo: u.contributionsCollection.totalRepositoriesWithContributedCommits,
  };

  const repos: Repository[] = [];
  let cursor: string | null = null;
  // bound the page count so a misbehaving GraphQL never spins forever
  for (let page = 0; page < 20; page += 1) {
    const result: ReposPage = await client.graphql<ReposPage>(REPOS_QUERY, {
      login: user,
      cursor,
    });
    const conn = result.user.repositories;
    for (const node of conn.nodes) {
      repos.push(toRepository(node, pinnedSet));
    }
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }

  const snapshot: Snapshot = {
    fetchedAt: now.toISOString(),
    user: profile,
    repositories: repos,
    contributions,
  };

  if (cache && cacheKey) await cache.set(cacheKey, snapshot);
  return snapshot;
}

function toRepository(node: RepositoryNode, pinned: Set<string>): Repository {
  return {
    name: node.name,
    nameWithOwner: node.nameWithOwner,
    description: node.description,
    url: node.url,
    homepageUrl: node.homepageUrl,
    primaryLanguage: node.primaryLanguage?.name ?? null,
    languages: node.languages.edges.map((e) => ({ name: e.node.name, bytes: e.size })),
    topics: node.repositoryTopics.nodes.map((n) => n.topic.name),
    stargazerCount: node.stargazerCount,
    forkCount: node.forkCount,
    isFork: node.isFork,
    isArchived: node.isArchived,
    isPrivate: node.isPrivate,
    pushedAt: node.pushedAt,
    createdAt: node.createdAt,
    isPinned: pinned.has(node.nameWithOwner),
  };
}

export interface BuildReportOptions {
  config: PortfolioConfig;
  snapshot: Snapshot;
  now?: Date;
}

export function buildReport({
  config,
  snapshot,
  now = new Date(),
}: BuildReportOptions): PortfolioReport {
  const decisions = applyFilters(snapshot.repositories, config.filters);
  const kept = keptRepos(decisions);

  const stack = scoreStack(kept, { weights: config.weights, now }).slice(0, 12);

  const projects: ProjectEntry[] = kept
    .map((repo): ProjectEntry => {
      const classification = classifyRepository(repo);
      const significance = computeSignificance(repo, now);
      return {
        repository: repo,
        domain: classification.domain,
        reasons: classification.reasons,
        significance,
      };
    })
    .sort((a, b) => significanceCompare(a, b, config.projects.pinned_first))
    .slice(0, config.projects.max);

  const summary = oneLineSummary(snapshot, stack, projects);

  return {
    generatedAt: now.toISOString(),
    config,
    snapshot,
    stack,
    projects,
    summary,
  };
}

export function computeSignificance(repo: Repository, now: Date): number {
  const ageDays = Math.max(1, (now.getTime() - Date.parse(repo.createdAt)) / 86_400_000);
  const starMomentum = Math.log10(repo.stargazerCount + 1) / 3;
  const ageSincePushDays = Math.max(0, (now.getTime() - Date.parse(repo.pushedAt)) / 86_400_000);
  const recency = 0.5 ** (ageSincePushDays / 365);
  const sizeProxy = Math.min(1, Math.log10(ageDays) / 4);
  const pinnedBoost = repo.isPinned ? 0.4 : 0;
  return starMomentum + 0.5 * recency + 0.3 * sizeProxy + pinnedBoost;
}

function significanceCompare(a: ProjectEntry, b: ProjectEntry, pinnedFirst: boolean): number {
  if (pinnedFirst && a.repository.isPinned !== b.repository.isPinned) {
    return a.repository.isPinned ? -1 : 1;
  }
  return b.significance - a.significance;
}

function oneLineSummary(
  snapshot: Snapshot,
  stack: ReturnType<typeof scoreStack>,
  projects: ProjectEntry[],
): string {
  const topLangs = stack
    .slice(0, 3)
    .map((s) => s.language)
    .join(', ');
  return `${snapshot.user.login}: ${snapshot.user.publicRepos} repos · top stack: ${topLangs || 'n/a'} · ${projects.length} highlighted projects`;
}
