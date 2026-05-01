import type {
  PortfolioConfig,
  PortfolioReport,
  ProjectEntry,
  Repository,
  Snapshot,
  StackEntry,
} from '../../src/schemas.js';
import { repo as baseRepo } from '../fixtures.js';

/**
 * Fixed clock used by every summary test so builds + renders are
 * byte-deterministic regardless of when the suite runs.
 */
export const NOW = new Date('2026-04-30T00:00:00.000Z');

const MS_PER_DAY = 86_400_000;

/** Helper: ISO string for `daysAgo` days before NOW. */
export function daysAgoIso(days: number): string {
  return new Date(NOW.getTime() - days * MS_PER_DAY).toISOString();
}

/**
 * Default config matching `PortfolioConfig.parse({})` defaults — the summary
 * builders never read the config, so a hand-rolled minimal object is enough
 * and keeps the fixture independent of unrelated schema changes.
 */
function defaultConfig(): PortfolioConfig {
  return {
    sections: ['header', 'stack', 'projects', 'activity'],
    locale: 'en',
    filters: {
      exclude_archived: true,
      exclude_forks: true,
      exclude_topics: ['tutorial', 'exercise', 'homework'],
      min_stars: 0,
    },
    weights: { loc: 0.5, recency: 0.3, maturity: 0.2 },
    projects: { pinned_first: true, max: 6 },
    audit: {
      enabled: true,
      thresholds: { staleRepoMonths: 6, prRotDays: 30, bugDebtWarn: 365 },
      ignore: { repos: [], categories: [] },
      outputs: { markdown: 'audit.md', json: 'audit.json' },
      failOn: '',
    },
  };
}

/**
 * Six repos covering the six domains. createdAt years are spread across
 * 2021–2025 so `learningTrajectory` produces multiple buckets and the
 * recency-bucket logic is exercised across active/recent/dormant/archived.
 */
function buildRepos(): Repository[] {
  return [
    // Backend — Python+TS, large, recent push (active).
    baseRepo({
      name: 'api-server',
      nameWithOwner: 'octolearn/api-server',
      url: 'https://github.com/octolearn/api-server',
      description: 'Backend API server in Python.',
      primaryLanguage: 'Python',
      languages: [
        { name: 'Python', bytes: 200_000 },
        { name: 'TypeScript', bytes: 30_000 },
        { name: 'Dockerfile', bytes: 1_200 },
      ],
      topics: ['django', 'rest', 'backend'],
      stargazerCount: 42,
      forkCount: 5,
      isFork: false,
      isArchived: false,
      isPinned: true,
      createdAt: '2022-03-15T00:00:00.000Z',
      pushedAt: daysAgoIso(15), // active (≤90d)
    }),
    // Frontend — TS+CSS, recent (≤365d but >90d).
    baseRepo({
      name: 'design-system',
      nameWithOwner: 'octolearn/design-system',
      url: 'https://github.com/octolearn/design-system',
      description: 'Cross-app component library.',
      primaryLanguage: 'TypeScript',
      languages: [
        { name: 'TypeScript', bytes: 120_000 },
        { name: 'CSS', bytes: 45_000 },
      ],
      topics: ['react', 'tailwind', 'frontend'],
      stargazerCount: 12,
      forkCount: 2,
      isFork: false,
      isArchived: false,
      isPinned: true,
      createdAt: '2023-06-01T00:00:00.000Z',
      pushedAt: daysAgoIso(200), // recent
    }),
    // DevOps — Go+Hcl, dormant (>365d).
    baseRepo({
      name: 'infra-helm',
      nameWithOwner: 'octolearn/infra-helm',
      url: 'https://github.com/octolearn/infra-helm',
      description: 'Helm charts for cluster bootstrap.',
      primaryLanguage: 'Go',
      languages: [
        { name: 'Go', bytes: 80_000 },
        { name: 'HCL', bytes: 20_000 },
      ],
      topics: ['kubernetes', 'helm', 'terraform'],
      stargazerCount: 3,
      forkCount: 0,
      isFork: false,
      isArchived: false,
      isPinned: false,
      createdAt: '2021-08-10T00:00:00.000Z',
      pushedAt: daysAgoIso(420), // dormant
    }),
    // ML — Python+Jupyter, recent.
    baseRepo({
      name: 'classifier-lab',
      nameWithOwner: 'octolearn/classifier-lab',
      url: 'https://github.com/octolearn/classifier-lab',
      description: 'Image classification experiments.',
      primaryLanguage: 'Python',
      languages: [
        { name: 'Python', bytes: 60_000 },
        { name: 'Jupyter Notebook', bytes: 130_000 },
      ],
      topics: ['pytorch', 'machine-learning'],
      stargazerCount: 0,
      forkCount: 0,
      isFork: false,
      isArchived: false,
      isPinned: false,
      createdAt: '2024-02-20T00:00:00.000Z',
      pushedAt: daysAgoIso(180), // recent
    }),
    // Mobile — Swift, archived.
    baseRepo({
      name: 'todo-ios',
      nameWithOwner: 'octolearn/todo-ios',
      url: 'https://github.com/octolearn/todo-ios',
      description: 'iOS to-do app, archived.',
      primaryLanguage: 'Swift',
      languages: [{ name: 'Swift', bytes: 25_000 }],
      topics: ['ios'],
      stargazerCount: 1,
      forkCount: 0,
      isFork: false,
      isArchived: true, // archived bucket
      isPinned: false,
      createdAt: '2021-05-05T00:00:00.000Z',
      pushedAt: '2022-09-01T00:00:00.000Z',
    }),
    // Unknown — fork, no language signal, tiny.
    baseRepo({
      name: 'sandbox',
      nameWithOwner: 'octolearn/sandbox',
      url: 'https://github.com/octolearn/sandbox',
      description: null,
      primaryLanguage: null,
      languages: [],
      topics: [],
      stargazerCount: 0,
      forkCount: 0,
      isFork: true,
      isArchived: false,
      isPinned: false,
      createdAt: '2025-01-15T00:00:00.000Z',
      pushedAt: daysAgoIso(60), // active
    }),
  ];
}

function buildSnapshot(repos: Repository[]): Snapshot {
  return {
    fetchedAt: NOW.toISOString(),
    user: {
      login: 'octolearn',
      name: 'Octo Learner',
      bio: 'Building things with code.',
      company: null,
      location: 'Lisbon',
      websiteUrl: 'https://octolearn.example',
      avatarUrl: 'https://github.com/octolearn.png',
      followers: 25,
      publicRepos: repos.length,
      createdAt: '2020-01-01T00:00:00.000Z',
    },
    repositories: repos,
    contributions: {
      totalCommits: 1234,
      totalPRs: 56,
      totalReviews: 18,
      totalIssues: 7,
      reposContributedTo: 9,
    },
  };
}

/**
 * Three-entry stack covering each tier the builder maps:
 *   expert    → strong
 *   proficient → working
 *   familiar   → familiar
 * (`exposed` is exercised by callers that override the stack.)
 */
function buildStack(): StackEntry[] {
  return [
    {
      language: 'TypeScript',
      score: 0.92,
      loc: 180_000,
      recency: 0.9,
      maturity: 0.7,
      tier: 'expert',
    },
    {
      language: 'Python',
      score: 0.71,
      loc: 260_000,
      recency: 0.5,
      maturity: 0.6,
      tier: 'proficient',
    },
    {
      language: 'Go',
      score: 0.31,
      loc: 80_000,
      recency: 0.2,
      maturity: 0.4,
      tier: 'familiar',
    },
  ];
}

/**
 * Four projects with varied significance, isPinned, isArchived. Order
 * matches the report contract (significance descending, pinned-first).
 * Domains are intentionally chosen so `dominantDomain` favours backend.
 */
function buildProjects(repos: Repository[]): ProjectEntry[] {
  const byName = new Map(repos.map((r) => [r.name, r] as const));
  const get = (name: string): Repository => {
    const r = byName.get(name);
    if (r === undefined) throw new Error(`fixture: missing repo ${name}`);
    return r;
  };
  return [
    {
      repository: get('api-server'),
      significance: 0.95,
      domain: 'backend',
      reasons: ['pinned', 'recent push'],
    },
    {
      repository: get('design-system'),
      significance: 0.78,
      domain: 'frontend',
      reasons: ['pinned'],
    },
    {
      repository: get('classifier-lab'),
      significance: 0.55,
      domain: 'ml',
      reasons: ['recent push'],
    },
    {
      repository: get('infra-helm'),
      significance: 0.32,
      domain: 'devops',
      reasons: ['stable'],
    },
  ];
}

export interface SummaryReportOverrides {
  stack?: StackEntry[];
  projects?: ProjectEntry[];
  repos?: Repository[];
  generatedAt?: string;
}

/**
 * Build a small-but-realistic `PortfolioReport` for summary-builder tests.
 * Defaults exercise every domain, every skill tier, and a mix of
 * pinned/archived repos, but every aspect can be overridden per test.
 */
export function summaryReport(overrides: SummaryReportOverrides = {}): PortfolioReport {
  const repos = overrides.repos ?? buildRepos();
  const snapshot = buildSnapshot(repos);
  const stack = overrides.stack ?? buildStack();
  const projects = overrides.projects ?? buildProjects(repos);
  return {
    generatedAt: overrides.generatedAt ?? NOW.toISOString(),
    config: defaultConfig(),
    snapshot,
    stack,
    projects,
    summary: 'A fixture portfolio summary.',
  };
}
