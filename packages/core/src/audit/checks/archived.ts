import { AUDIT_SCHEMA_VERSION, type AuditCheck, type AuditFinding, findingId } from '../schemas.js';

const MS_PER_DAY = 86_400_000;
const ARCHIVED_RECENT_ISSUE_DAYS = 90;
const FORK_COUNT_HOT = 5;

/**
 * archivedCheck — flags archived repos that still attract activity (open
 * issues, recent issue activity, or many forks). Archived repos can't accept
 * fixes, so this surfaces user-visible footguns.
 */
export const archivedCheck: AuditCheck = (ctx): AuditFinding[] => {
  const { snapshot, extras, now } = ctx;
  const out: AuditFinding[] = [];

  for (const repo of snapshot.repositories) {
    if (!repo.isArchived) continue;

    const repoExtras = extras.perRepo.get(repo.nameWithOwner);
    const openIssues = repoExtras?.openIssuesCount ?? 0;
    const oldestOpenIssueAt = repoExtras?.oldestOpenIssueAt ?? null;

    let recentIssueActivity = false;
    if (oldestOpenIssueAt !== null) {
      const oldestMs = Date.parse(oldestOpenIssueAt);
      if (Number.isFinite(oldestMs)) {
        const ageDays = (now.getTime() - oldestMs) / MS_PER_DAY;
        recentIssueActivity = ageDays < ARCHIVED_RECENT_ISSUE_DAYS;
      }
    }

    const matches = openIssues > 0 || recentIssueActivity || repo.forkCount > FORK_COUNT_HOT;
    if (!matches) continue;

    const [owner, name] = repo.nameWithOwner.split('/');

    out.push({
      id: findingId('archived', repo.nameWithOwner, 'archived-with-activity'),
      schemaVersion: AUDIT_SCHEMA_VERSION,
      severity: 'high',
      category: 'archived',
      repo: {
        owner: owner ?? '',
        name: name ?? repo.name,
        url: repo.url,
      },
      title: `Archived but active: ${repo.nameWithOwner}`,
      message:
        "Archived repos can't accept fixes but still attract issues, forks, and traffic. That's a footgun for users who think they can contribute.",
      evidence: [
        {
          url: repo.url,
          label: 'Archived repo',
        },
      ],
      suggestedAction:
        'Un-archive to accept contributions, or link to a maintained fork in the README.',
      detectedAt: now.toISOString(),
      metadata: {
        openIssuesCount: openIssues,
        forkCount: repo.forkCount,
      },
    });
  }

  return out;
};
