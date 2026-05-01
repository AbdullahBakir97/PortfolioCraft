import {
  type CvSummary,
  type ProjectCaseStudy,
  SUMMARY_SCHEMA_VERSION,
  type SummaryActivity,
  type SummarySkills,
  type SummaryUser,
  type UniSummary,
} from '@portfoliocraft/core';

/**
 * Fixed clock used by every summary-renderer test. Renderer tests build their
 * data structures by hand (NOT through the builder) so a builder regression
 * cannot mask a renderer regression.
 */
export const NOW_ISO = '2026-04-30T00:00:00.000Z';

export function user(overrides: Partial<SummaryUser> = {}): SummaryUser {
  return {
    login: 'octolearn',
    name: 'Octo Learner',
    bio: 'Building things with code.',
    location: 'Lisbon',
    websiteUrl: 'https://octolearn.example',
    ...overrides,
  };
}

export function activity(overrides: Partial<SummaryActivity> = {}): SummaryActivity {
  return {
    period: 'last 12 months',
    commits: 1234,
    pullRequests: 56,
    reviews: 18,
    issues: 7,
    reposContributedTo: 9,
    ...overrides,
  };
}

export function skills(overrides: Partial<SummarySkills> = {}): SummarySkills {
  return {
    strong: ['TypeScript'],
    working: ['Python'],
    familiar: ['Go'],
    ...overrides,
  };
}

export function caseStudy(overrides: Partial<ProjectCaseStudy> = {}): ProjectCaseStudy {
  return {
    repository: {
      owner: 'octolearn',
      name: 'api-server',
      url: 'https://github.com/octolearn/api-server',
      nameWithOwner: 'octolearn/api-server',
    },
    domain: 'backend',
    significance: 0.95,
    description: 'Backend API server in Python.',
    topics: ['django', 'rest', 'backend'],
    primaryLanguage: 'Python',
    topLanguages: ['Python', 'TypeScript', 'Dockerfile'],
    stargazerCount: 42,
    forkCount: 5,
    estimatedDurationMonths: 18,
    firstPushDate: '2022-03-15T00:00:00.000Z',
    lastPushDate: '2026-04-15T00:00:00.000Z',
    isPinned: true,
    isArchived: false,
    recencyBucket: 'active',
    ...overrides,
  };
}

export function cvSummary(overrides: Partial<CvSummary> = {}): CvSummary {
  return {
    schemaVersion: SUMMARY_SCHEMA_VERSION,
    generatedAt: NOW_ISO,
    user: user(),
    headline: 'Backend developer · TypeScript, Python, Go · 6 public repos · 1,234 commits',
    skills: skills(),
    selectedProjects: [caseStudy()],
    domains: ['backend'],
    activity: activity(),
    links: { github: 'https://github.com/octolearn' },
    ...overrides,
  };
}

export function uniSummary(overrides: Partial<UniSummary> = {}): UniSummary {
  return {
    schemaVersion: SUMMARY_SCHEMA_VERSION,
    generatedAt: NOW_ISO,
    user: user(),
    headline: 'Aspiring backend engineer · TypeScript, Python · 6 public repos · 1,234 commits',
    learningTrajectory: [
      {
        year: 2022,
        primaryLanguages: ['Python'],
        primaryDomains: ['backend'],
        reposCreated: 1,
        summary: 'Created 1 repo primarily in Python, focused on backend.',
      },
      {
        year: 2023,
        primaryLanguages: ['TypeScript'],
        primaryDomains: ['frontend'],
        reposCreated: 1,
        summary: 'Created 1 repo primarily in TypeScript, focused on frontend.',
      },
      {
        year: 2024,
        primaryLanguages: ['Python'],
        primaryDomains: ['ml'],
        reposCreated: 1,
        summary: 'Created 1 repo primarily in Python, focused on ml.',
      },
    ],
    topProjects: [caseStudy()],
    technicalDepth: [
      {
        domain: 'backend',
        repos: 1,
        primaryLanguages: ['Python'],
        summary: '1 backend project in Python covering django, rest, backend.',
      },
    ],
    selfDirectedScope: {
      totalReposScanned: 6,
      openSourceShare: 5 / 6,
      longestProjectMonths: 24,
      mostStarredRepo: 'octolearn/api-server',
    },
    ...overrides,
  };
}
