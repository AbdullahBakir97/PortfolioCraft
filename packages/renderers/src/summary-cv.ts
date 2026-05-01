import type { CvSummary, ProjectCaseStudy } from '@portfoliocraft/core';

/**
 * Render a `CvSummary` as paste-ready Markdown.
 *
 * Pure function: identical input always produces byte-identical output. The
 * shape is deliberately CV-flavoured — short, factual, no marketing tone.
 * Topics are intentionally omitted from per-project lines because in CV
 * context they read as noise; the case-studies renderer is where topics earn
 * their place.
 *
 * Total length stays well under ~1,500 words: each project gets exactly two
 * lines (a meta line and a description), the activity block is one line, and
 * the skill tiers collapse to three lines max.
 */
export function renderCvMarkdown(cv: CvSummary): string {
  const lines: string[] = [];

  // Heading: prefer real name when GitHub has it; the login is always there.
  const heading = cv.user.name && cv.user.name.trim().length > 0 ? cv.user.name : cv.user.login;
  lines.push(`## ${heading}`);

  // Sub-heading: location · contact · headline. Each piece is optional, but
  // the headline is always present per the schema. We pick exactly one
  // contact slot (website > github) so the line stays short.
  const subParts: string[] = [];
  if (cv.user.location && cv.user.location.trim().length > 0) {
    subParts.push(cv.user.location.trim());
  }
  const contact = chooseContact(cv);
  if (contact !== null) subParts.push(contact);
  if (cv.headline.trim().length > 0) subParts.push(cv.headline.trim());
  if (subParts.length > 0) {
    lines.push(subParts.join(' · '));
  }

  // Bio as a standalone paragraph. Strip any leading bullet marker the user
  // might have on their GitHub profile bio so we don't render a stray dash.
  if (cv.user.bio && cv.user.bio.trim().length > 0) {
    lines.push('');
    lines.push(stripBulletPrefix(cv.user.bio.trim()));
  }

  // Skills — only render tiers that have entries. Each tier label is bold so
  // the tier name visually anchors the line in the printed CV.
  const skillsBlock = renderSkills(cv);
  if (skillsBlock.length > 0) {
    lines.push('');
    lines.push('### Technical skills');
    lines.push('');
    for (const line of skillsBlock) lines.push(line);
  }

  // Selected projects — the meaty part. Order is preserved from the schema
  // (the builder already sorted by significance descending).
  if (cv.selectedProjects.length > 0) {
    lines.push('');
    lines.push('### Selected projects');
    lines.push('');
    for (const project of cv.selectedProjects) {
      lines.push(...renderCvProject(project));
    }
  }

  // Activity — single line; the period label comes from the schema verbatim.
  lines.push('');
  lines.push(`### Activity (${cv.activity.period})`);
  lines.push('');
  lines.push(renderActivityLine(cv));

  // Footer.
  lines.push('');
  lines.push('---');
  lines.push(
    '_Generated from GitHub history by [PortfolioCraft](https://github.com/marketplace/actions/portfoliocraft-action)._',
  );

  return `${lines.join('\n')}\n`;
}

function chooseContact(cv: CvSummary): string | null {
  const website = cv.user.websiteUrl;
  if (website && website.trim().length > 0) return website.trim();
  // Fall back to the canonical GitHub link, which the schema always supplies.
  return cv.links.github;
}

function stripBulletPrefix(text: string): string {
  // Bios occasionally start with "- " or "* " when imported from a bullet
  // list. Drop a single leading marker so the paragraph doesn't render as
  // an orphaned list item.
  if (text.startsWith('- ') || text.startsWith('* ')) return text.slice(2);
  return text;
}

function renderSkills(cv: CvSummary): string[] {
  const out: string[] = [];
  if (cv.skills.strong.length > 0) {
    out.push(`**Strong:** ${cv.skills.strong.join(', ')}`);
  }
  if (cv.skills.working.length > 0) {
    out.push(`**Working knowledge:** ${cv.skills.working.join(', ')}`);
  }
  if (cv.skills.familiar.length > 0) {
    out.push(`**Familiar with:** ${cv.skills.familiar.join(', ')}`);
  }
  return out;
}

function renderCvProject(project: ProjectCaseStudy): string[] {
  const out: string[] = [];

  // Meta line: top languages · stars · duration · pinned/archived flags.
  const metaParts: string[] = [];

  // Up to 3 languages from topLanguages, joined with comma + space. We take
  // from topLanguages directly (already deduped + ordered by the builder).
  const langs = project.topLanguages.slice(0, 3);
  if (langs.length > 0) metaParts.push(langs.join(', '));

  // Stars: skip when zero (a personal repo without stars adds nothing here).
  if (project.stargazerCount > 0) {
    metaParts.push(`${project.stargazerCount}★`);
  }

  // Duration: skip very short projects so we don't surface "1 mo" weekend
  // experiments next to multi-year work.
  if (project.estimatedDurationMonths >= 2) {
    metaParts.push(`${project.estimatedDurationMonths} mo`);
  }

  if (project.isPinned) metaParts.push('pinned');
  if (project.isArchived) metaParts.push('archived');

  const metaSuffix = metaParts.length > 0 ? ` — ${metaParts.join(' · ')}` : '';
  out.push(`**${project.repository.name}**${metaSuffix}`);

  // Description: prefer the user's own description, fall back to a tight
  // generated sentence so every project reads as a complete two-line entry.
  out.push(buildCvDescription(project));
  out.push('');

  return out;
}

function buildCvDescription(project: ProjectCaseStudy): string {
  if (project.description !== null && project.description.trim().length > 0) {
    return project.description.trim();
  }
  const lang = project.primaryLanguage ?? project.topLanguages[0] ?? null;
  if (lang !== null) {
    return `A ${project.domain} project in ${lang}.`;
  }
  return `A ${project.domain} project.`;
}

function renderActivityLine(cv: CvSummary): string {
  const a = cv.activity;
  return (
    `${a.commits} commits · ${a.pullRequests} pull requests · ` +
    `${a.reviews} reviews · contributed to ${a.reposContributedTo} repositories`
  );
}
