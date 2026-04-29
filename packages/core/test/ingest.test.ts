import { describe, expect, it } from 'vitest';
import { buildReport, computeSignificance } from '../src/ingest.js';
import { PortfolioConfig, type Snapshot } from '../src/schemas.js';
import { repo } from './fixtures.js';

const NOW = new Date('2026-04-29T00:00:00.000Z');

describe('buildReport', () => {
  const baseSnapshot: Snapshot = {
    fetchedAt: NOW.toISOString(),
    user: {
      login: 'octocat',
      name: 'The Octocat',
      bio: 'Builds things',
      company: null,
      location: null,
      websiteUrl: null,
      avatarUrl: 'https://example.invalid/octocat.png',
      followers: 1,
      publicRepos: 4,
      createdAt: '2020-01-01T00:00:00.000Z',
    },
    repositories: [
      repo({
        name: 'modern-app',
        isPinned: true,
        stargazerCount: 30,
        pushedAt: '2026-04-01T00:00:00.000Z',
      }),
      repo({ name: 'old-fork', isFork: true }),
      repo({ name: 'archived', isArchived: true }),
      repo({
        name: 'go-svc',
        primaryLanguage: 'Go',
        languages: [{ name: 'Go', bytes: 200_000 }],
        topics: ['kubernetes'],
        stargazerCount: 5,
        pushedAt: '2026-03-15T00:00:00.000Z',
      }),
    ],
    contributions: {
      totalCommits: 200,
      totalPRs: 30,
      totalIssues: 10,
      totalReviews: 50,
      reposContributedTo: 5,
    },
  };

  it('drops filtered repos and ranks pinned first', () => {
    const config = PortfolioConfig.parse({});
    const report = buildReport({ config, snapshot: baseSnapshot, now: NOW });
    expect(report.projects.map((p) => p.repository.name)).toEqual(['modern-app', 'go-svc']);
    expect(report.projects[0]?.repository.isPinned).toBe(true);
  });

  it('produces a non-empty stack from kept repos', () => {
    const config = PortfolioConfig.parse({});
    const report = buildReport({ config, snapshot: baseSnapshot, now: NOW });
    expect(report.stack.length).toBeGreaterThan(0);
    expect(report.stack[0]?.score).toBeGreaterThan(0);
  });

  it('summary mentions the user and stack count', () => {
    const config = PortfolioConfig.parse({});
    const report = buildReport({ config, snapshot: baseSnapshot, now: NOW });
    expect(report.summary).toContain('octocat');
    expect(report.summary).toContain('projects');
  });

  it('computeSignificance gives pinned repos a lift', () => {
    const a = computeSignificance(repo({ isPinned: true, stargazerCount: 5 }), NOW);
    const b = computeSignificance(repo({ isPinned: false, stargazerCount: 5 }), NOW);
    expect(a).toBeGreaterThan(b);
  });
});
