import { AUDIT_SCHEMA_VERSION, type AuditCheck, type AuditFinding, findingId } from '../schemas.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_MONTH = 30;

/**
 * staleCheck — flags non-archived, non-fork repositories whose `pushedAt` is
 * older than the configured `staleRepoMonths` threshold.
 */
export const staleCheck: AuditCheck = (ctx): AuditFinding[] => {
  const { snapshot, thresholds, now } = ctx;
  const out: AuditFinding[] = [];
  const cutoff = now.getTime() - MS_PER_DAY * DAYS_PER_MONTH * thresholds.staleRepoMonths;

  for (const repo of snapshot.repositories) {
    if (repo.isArchived || repo.isFork) continue;
    const pushedAtMs = Date.parse(repo.pushedAt);
    if (!Number.isFinite(pushedAtMs)) continue;
    if (pushedAtMs >= cutoff) continue;

    const lastPushDate = repo.pushedAt.split('T')[0] ?? repo.pushedAt;
    const [owner, name] = repo.nameWithOwner.split('/');

    out.push({
      id: findingId('stale', repo.nameWithOwner, repo.pushedAt),
      schemaVersion: AUDIT_SCHEMA_VERSION,
      severity: 'medium',
      category: 'stale',
      repo: {
        owner: owner ?? '',
        name: name ?? repo.name,
        url: repo.url,
      },
      title: `Stale repository: ${repo.nameWithOwner}`,
      message: `Last push was ${lastPushDate}, beyond the ${thresholds.staleRepoMonths}-month freshness threshold. A fresh commit, archive, or removal would clean the portfolio signal.`,
      evidence: [
        {
          url: repo.url,
          label: `Last push: ${lastPushDate}`,
        },
      ],
      suggestedAction:
        'Push a fresh commit, archive the repo, or exclude it from your portfolio config.',
      detectedAt: now.toISOString(),
      metadata: {},
    });
  }

  return out;
};
