import type { PortfolioReport } from '@devportfolio/core';

export interface JsonResume {
  $schema: string;
  schemaVersion: '1.0.0';
  meta: { canonical: string; lastModified: string };
  basics: {
    name: string | null;
    label: string | null;
    image: string;
    summary: string | null;
    location: { city: string | null } | null;
    profiles: Array<{ network: string; username: string; url: string }>;
    url: string | null;
  };
  skills: Array<{ name: string; level: string; keywords: string[] }>;
  projects: Array<{
    name: string;
    description: string | null;
    url: string;
    keywords: string[];
    highlights: string[];
  }>;
  work: Array<{ name: string; position: string; summary: string }>;
}

export function renderJsonResume(report: PortfolioReport): JsonResume {
  const u = report.snapshot.user;
  return {
    $schema: 'https://jsonresume.org/schema/1.0.0/resume.json',
    schemaVersion: '1.0.0',
    meta: { canonical: u.websiteUrl ?? '', lastModified: report.generatedAt },
    basics: {
      name: u.name,
      label: u.bio,
      image: u.avatarUrl,
      summary: u.bio,
      location: u.location ? { city: u.location } : null,
      url: u.websiteUrl,
      profiles: [
        {
          network: 'GitHub',
          username: u.login,
          url: `https://github.com/${u.login}`,
        },
      ],
    },
    skills: report.stack.slice(0, 12).map((s) => ({
      name: s.language,
      level: s.tier,
      keywords: [],
    })),
    projects: report.projects.map((p) => ({
      name: p.repository.name,
      description: p.repository.description,
      url: p.repository.url,
      keywords: p.repository.topics,
      highlights: p.reasons,
    })),
    work: u.company
      ? [{ name: u.company, position: u.bio ?? 'Engineer', summary: u.bio ?? '' }]
      : [],
  };
}
