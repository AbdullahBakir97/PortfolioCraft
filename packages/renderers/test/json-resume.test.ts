import type { PortfolioReport } from '@portfoliocraft/core';
import { PortfolioConfig } from '@portfoliocraft/core';
import { describe, expect, it } from 'vitest';
import { renderJsonResume } from '../src/json-resume.js';

const NOW = new Date('2026-04-29T00:00:00.000Z').toISOString();

const REPORT: PortfolioReport = {
  generatedAt: NOW,
  config: PortfolioConfig.parse({}),
  snapshot: {
    fetchedAt: NOW,
    user: {
      login: 'octocat',
      name: 'The Octocat',
      bio: 'Builds things',
      company: 'Hubber',
      location: 'Internet',
      websiteUrl: 'https://example.invalid',
      avatarUrl: 'https://example.invalid/avatar.png',
      followers: 1,
      publicRepos: 4,
      createdAt: NOW,
    },
    repositories: [],
    contributions: {
      totalCommits: 1,
      totalPRs: 1,
      totalIssues: 1,
      totalReviews: 1,
      reposContributedTo: 1,
    },
  },
  stack: [],
  projects: [],
  summary: 'octocat: ...',
};

describe('renderJsonResume', () => {
  it('produces a JSON Resume with schemaVersion 1.0.0', () => {
    const r = renderJsonResume(REPORT);
    expect(r.schemaVersion).toBe('1.0.0');
    expect(r.basics.profiles[0]).toEqual({
      network: 'GitHub',
      username: 'octocat',
      url: 'https://github.com/octocat',
    });
    expect(r.work[0]?.name).toBe('Hubber');
  });
});
