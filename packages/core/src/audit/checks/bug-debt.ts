// v0.2 simplification: counts ALL open issues, not just label:bug. The
// weighted score (age * count) is a useful proxy regardless of label.
// v0.3 will fetch issue labels and weight by severity.
import { AUDIT_SCHEMA_VERSION, type AuditCheck, type AuditFinding, findingId } from '../schemas.js';

const MS_PER_DAY = 86_400_000;

/**
 * bugDebtCheck — for each kept repo with open issues, weights the oldest open
 * issue's age by the open-issue count and emits a finding when the oldest
 * exceeds the `bugDebtWarn` threshold.
 */
export const bugDebtCheck: AuditCheck = (ctx): AuditFinding[] => {
  const { snapshot, extras, thresholds, now } = ctx;
  const out: AuditFinding[] = [];

  for (const repo of snapshot.repositories) {
    if (repo.isArchived || repo.isFork) continue;
    const repoExtras = extras.perRepo.get(repo.nameWithOwner);
    if (!repoExtras) continue;
    if (repoExtras.openIssuesCount <= 0) continue;
    if (repoExtras.oldestOpenIssueAt === null) continue;

    const oldestMs = Date.parse(repoExtras.oldestOpenIssueAt);
    if (!Number.isFinite(oldestMs)) continue;
    const oldestAgeDays = Math.floor((now.getTime() - oldestMs) / MS_PER_DAY);
    if (oldestAgeDays <= thresholds.bugDebtWarn) continue;

    const debtScore = oldestAgeDays * repoExtras.openIssuesCount;
    const [owner, name] = repo.nameWithOwner.split('/');

    out.push({
      id: findingId('bug-debt', repo.nameWithOwner, repoExtras.oldestOpenIssueAt),
      schemaVersion: AUDIT_SCHEMA_VERSION,
      severity: 'medium',
      category: 'bug-debt',
      repo: {
        owner: owner ?? '',
        name: name ?? repo.name,
        url: repo.url,
      },
      title: `Bug debt: ${repo.nameWithOwner}`,
      message: `${repoExtras.openIssuesCount} open issues; the oldest is ${oldestAgeDays} days old. Long-lived issues compound and signal abandonment to visitors.`,
      evidence: [
        {
          url: `${repo.url}/issues`,
          label: `${repoExtras.openIssuesCount} open · oldest ${oldestAgeDays} days`,
        },
      ],
      suggestedAction: 'Triage stale issues — close, label, or convert to discussions.',
      detectedAt: now.toISOString(),
      metadata: { debtScore, openIssuesCount: repoExtras.openIssuesCount, oldestAgeDays },
    });
  }

  return out;
};
