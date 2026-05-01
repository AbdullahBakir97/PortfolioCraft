import type {
  LearningTrajectoryEntry,
  ProjectCaseStudy,
  TechnicalDepthEntry,
  UniSummary,
} from '@portfoliocraft/core';

/**
 * Render a `UniSummary` as a longer, narrative-shaped Markdown document
 * suitable for university motivation letters and similar applications.
 *
 * Pure function: identical input always produces byte-identical output. Tone
 * is first-person but reserved — plain factual phrasing only. The user is
 * expected to do a light pass to humanize the output before submitting.
 *
 * Section order is fixed:
 *   1. Headline + bio paragraph
 *   2. Learning trajectory (year by year)
 *   3. Selected projects (one block per top project)
 *   4. Technical depth (one line per domain)
 *   5. Self-directed scope
 */
export function renderUniMarkdown(uni: UniSummary): string {
  const lines: string[] = [];

  lines.push('# Software development background');
  lines.push('');
  lines.push(...renderOpening(uni));

  // Learning trajectory.
  const trajectory = uni.learningTrajectory.filter((entry) => entry.reposCreated > 0);
  if (trajectory.length > 0) {
    lines.push('');
    lines.push('## Learning trajectory');
    lines.push('');
    for (const entry of trajectory) {
      lines.push(...renderTrajectoryEntry(entry));
    }
  }

  // Selected projects — deeper than the CV: per-project section heading and
  // a multi-sentence body that pulls in topics, dates, scale, and link.
  if (uni.topProjects.length > 0) {
    lines.push('');
    lines.push('## Selected projects');
    lines.push('');
    for (let i = 0; i < uni.topProjects.length; i++) {
      const project = uni.topProjects[i];
      if (project === undefined) continue;
      lines.push(...renderUniProject(project));
      // Blank line between projects, but not after the very last one.
      if (i < uni.topProjects.length - 1) lines.push('');
    }
  }

  // Technical depth — one line per domain, summary string is already prose.
  if (uni.technicalDepth.length > 0) {
    lines.push('');
    lines.push('## Technical depth');
    lines.push('');
    for (const entry of uni.technicalDepth) {
      lines.push(renderTechnicalDepthEntry(entry));
    }
  }

  // Scope of self-directed work.
  lines.push('');
  lines.push('## Scope of self-directed work');
  lines.push('');
  lines.push(renderSelfDirectedScope(uni));

  // Footer matches the CV renderer for consistency across artifacts.
  lines.push('');
  lines.push('---');
  lines.push(
    '_Generated from GitHub history by [PortfolioCraft](https://github.com/marketplace/actions/portfoliocraft-action)._',
  );

  return `${lines.join('\n')}\n`;
}

function renderOpening(uni: UniSummary): string[] {
  const out: string[] = [];

  // Build the opening sentence: "I'm a {headline-rephrased} with {N} public
  // repositories on GitHub spanning {top 2 domains}."
  const headlineFragment = rephraseHeadline(uni.headline);
  const repoCount = uni.selfDirectedScope.totalReposScanned;
  const topDomains = collectTopDomains(uni);
  const domainClause = formatDomainClause(topDomains);

  let opener = `I'm a ${headlineFragment} with ${repoCount} public ${pluralize(repoCount, 'repository', 'repositories')} on GitHub`;
  if (domainClause !== null) {
    opener += ` ${domainClause}`;
  }
  opener += '.';
  out.push(opener);

  if (uni.user.bio !== null && uni.user.bio.trim().length > 0) {
    out.push('');
    out.push(stripBulletPrefix(uni.user.bio.trim()));
  }
  return out;
}

function rephraseHeadline(headline: string): string {
  // Lowercase the first letter so it reads naturally after "I'm a/an" and
  // strip trailing dots if the builder added them. Use a non-regex loop —
  // a /\.+$/ pattern would be polynomial against pathological input
  // (CodeQL flagged this); slice-while-endsWith is O(n) worst-case.
  let trimmed = headline.trim();
  while (trimmed.endsWith('.')) trimmed = trimmed.slice(0, -1);
  if (trimmed.length === 0) return 'developer';
  const first = trimmed.charAt(0).toLowerCase();
  return first + trimmed.slice(1);
}

function collectTopDomains(uni: UniSummary): string[] {
  // The schema doesn't carry an explicit top-domains list on UniSummary;
  // technicalDepth is sorted by descending repo count, so the first two
  // entries are the user's strongest domains. Fall back to topProjects'
  // domains if technicalDepth is empty.
  const fromDepth = uni.technicalDepth.slice(0, 2).map((entry) => entry.domain);
  if (fromDepth.length > 0) return fromDepth;

  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const project of uni.topProjects) {
    if (!seen.has(project.domain)) {
      seen.add(project.domain);
      ordered.push(project.domain);
      if (ordered.length === 2) break;
    }
  }
  return ordered;
}

function formatDomainClause(domains: string[]): string | null {
  if (domains.length === 0) return null;
  if (domains.length === 1) {
    return `working primarily in ${domains[0]}`;
  }
  return `spanning ${domains[0]} and ${domains[1]}`;
}

function renderTrajectoryEntry(entry: LearningTrajectoryEntry): string[] {
  const out: string[] = [];
  out.push(`**${entry.year}**: ${entry.summary}`);

  // Second sentence: repo count + tech context. Languages and domains live
  // on the entry itself; we only mention what's actually populated so the
  // sentence stays factually anchored.
  const repoNoun = pluralize(entry.reposCreated, 'repository', 'repositories');
  let line = `Created ${entry.reposCreated} ${repoNoun}`;
  const langClause = formatPrimaryListClause(entry.primaryLanguages, 'in');
  const domainClause = formatPrimaryListClause(entry.primaryDomains, 'across');
  if (langClause !== null && domainClause !== null) {
    line += ` ${langClause}, ${domainClause}`;
  } else if (langClause !== null) {
    line += ` ${langClause}`;
  } else if (domainClause !== null) {
    line += ` ${domainClause}`;
  }
  line += '.';
  out.push(line);
  out.push('');
  return out;
}

function formatPrimaryListClause(items: string[], preposition: string): string | null {
  // Up to two items joined with "and"; preserves the schema order which the
  // builder has already sorted deterministically.
  const trimmed = items.filter((s) => s.trim().length > 0).slice(0, 2);
  if (trimmed.length === 0) return null;
  if (trimmed.length === 1) return `${preposition} ${trimmed[0]}`;
  return `${preposition} ${trimmed[0]} and ${trimmed[1]}`;
}

function renderUniProject(project: ProjectCaseStudy): string[] {
  const out: string[] = [];
  out.push(`### ${project.repository.name}`);
  out.push('');

  // Opening sentence: bucket + domain + language + duration + year range.
  const lang = project.primaryLanguage ?? project.topLanguages[0] ?? null;
  const yearRange = formatYearRange(project.firstPushDate, project.lastPushDate);
  const months = project.estimatedDurationMonths;
  const monthNoun = pluralize(months, 'month', 'months');

  let lead = `A ${project.recencyBucket} ${project.domain} project`;
  if (lang !== null) {
    lead += ` built primarily in ${lang}`;
  }
  lead += `, developed over ${months} ${monthNoun}`;
  if (yearRange !== null) {
    lead += ` (${yearRange})`;
  }
  lead += '.';
  out.push(lead);

  // Description paragraph if present.
  if (project.description !== null && project.description.trim().length > 0) {
    out.push('');
    out.push(project.description.trim());
  }

  // Stars + forks + topics. Topics belong here — the uni format treats them
  // as substantive context (unlike the CV format).
  out.push('');
  out.push(renderUniScaleLine(project));

  out.push('');
  out.push(`Repository: [${project.repository.nameWithOwner}](${project.repository.url}).`);
  return out;
}

function renderUniScaleLine(project: ProjectCaseStudy): string {
  const stars = project.stargazerCount;
  const forks = project.forkCount;
  let line =
    `The repository carries ${stars} ${pluralize(stars, 'star', 'stars')} ` +
    `and ${forks} ${pluralize(forks, 'fork', 'forks')}`;
  if (project.topics.length >= 1) {
    const top = project.topics.slice(0, 3).join(', ');
    line += `, with primary topics: ${top}`;
  }
  line += '.';
  return line;
}

function formatYearRange(firstIso: string, lastIso: string): string | null {
  const firstYear = extractYear(firstIso);
  const lastYear = extractYear(lastIso);
  if (firstYear === null && lastYear === null) return null;
  if (firstYear === null) return lastYear;
  if (lastYear === null) return firstYear;
  if (firstYear === lastYear) return firstYear;
  return `${firstYear}–${lastYear}`;
}

function extractYear(iso: string): string | null {
  // ISO-8601 datetimes always start with YYYY-MM-DD; slicing skips the
  // Date-parse round-trip and stays locale-independent.
  if (typeof iso !== 'string' || iso.length < 4) return null;
  const year = iso.slice(0, 4);
  if (!/^\d{4}$/.test(year)) return null;
  return year;
}

function renderTechnicalDepthEntry(entry: TechnicalDepthEntry): string {
  const repoNoun = pluralize(entry.repos, 'repository', 'repositories');
  const domainLabel = capitalizeFirst(entry.domain);
  return `**${domainLabel}** (${entry.repos} ${repoNoun}): ${entry.summary}`;
}

function renderSelfDirectedScope(uni: UniSummary): string {
  const scope = uni.selfDirectedScope;
  const total = scope.totalReposScanned;
  const repoNoun = pluralize(total, 'repository', 'repositories');

  // Open-source share clause.
  const sharePct = Math.round(Math.max(0, Math.min(1, scope.openSourceShare)) * 100);
  const shareClause =
    sharePct === 100 ? 'all of which are open-source' : `of which ${sharePct}% are open-source`;

  let line = `I've worked across ${total} public ${repoNoun}, ${shareClause}.`;

  // Longest project + most-starred sentence. Skip cleanly when the schema
  // has no most-starred name (empty profile case).
  if (scope.longestProjectMonths > 0 || scope.mostStarredRepo.length > 0) {
    let tail = '';
    if (scope.longestProjectMonths > 0) {
      const monthNoun = pluralize(scope.longestProjectMonths, 'month', 'months');
      tail += ` My longest sustained project ran for ${scope.longestProjectMonths} ${monthNoun}`;
    }
    if (scope.mostStarredRepo.length > 0) {
      const starredStarCount = findStarsForRepo(uni.topProjects, scope.mostStarredRepo);
      const starredFragment =
        starredStarCount !== null
          ? `${scope.mostStarredRepo} is my most-starred repository at ${starredStarCount} ${pluralize(starredStarCount, 'star', 'stars')}`
          : `${scope.mostStarredRepo} is my most-starred repository`;
      if (tail.length > 0) {
        tail += ` (${starredFragment})`;
      } else {
        tail += ` ${capitalizeFirst(starredFragment)}`;
      }
    }
    tail += '.';
    line += tail;
  }

  return line;
}

function findStarsForRepo(projects: ProjectCaseStudy[], nameWithOwner: string): number | null {
  for (const p of projects) {
    if (p.repository.nameWithOwner === nameWithOwner) return p.stargazerCount;
  }
  return null;
}

function pluralize(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

function capitalizeFirst(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function stripBulletPrefix(text: string): string {
  if (text.startsWith('- ') || text.startsWith('* ')) return text.slice(2);
  return text;
}
