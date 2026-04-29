import type { Repository } from '../src/schemas.js';

export function repo(overrides: Partial<Repository> = {}): Repository {
  return {
    name: 'demo',
    nameWithOwner: 'octocat/demo',
    description: 'A demo project',
    url: 'https://github.com/octocat/demo',
    homepageUrl: null,
    primaryLanguage: 'TypeScript',
    languages: [
      { name: 'TypeScript', bytes: 90_000 },
      { name: 'CSS', bytes: 10_000 },
    ],
    topics: ['nextjs', 'frontend'],
    stargazerCount: 12,
    forkCount: 2,
    isFork: false,
    isArchived: false,
    isPrivate: false,
    pushedAt: '2026-04-01T00:00:00.000Z',
    createdAt: '2024-04-01T00:00:00.000Z',
    isPinned: false,
    ...overrides,
  };
}
