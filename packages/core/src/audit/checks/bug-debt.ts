// v0.3 label-aware: weights by GitHub issue labels (severity:critical, bug,
// enhancement, etc) per LABEL_WEIGHTS in schemas.ts. The threshold now applies
// to weightedDebtScore; legacy debtScore remains in metadata for backward
// compat.
import {
  AUDIT_SCHEMA_VERSION,
  type AuditCheck,
  type AuditFinding,
  findingId,
  LABEL_WEIGHTS,
  type Severity,
} from '../schemas.js';

const MS_PER_DAY = 86_400_000;
// Highest defined weight in LABEL_WEIGHTS. Acts as a ceiling so a misnamed
// 'critical-critical' label can't ever exceed the documented contract.
const MAX_LABEL_MULTIPLIER = 4;
// `'high'` severity once a critical-or-high label is in play.
const HIGH_SEVERITY_LABEL_FLOOR = 3;

/**
 * bugDebtCheck — for each kept repo with open issues, weights the oldest open
 * issue's age by the open-issue count and the maximum LABEL_WEIGHTS multiplier
 * across the sampled issue labels. The threshold compares against the
 * weightedDebtScore (v0.3 semantic upgrade); the legacy debtScore is kept in
 * metadata so the runAudit aggregator that sums it still works.
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

    const { multiplier: labelMultiplier, dominantLabels } = computeLabelMultiplier(
      repoExtras.issueLabels,
    );

    // v0.2 calc, preserved for the runAudit aggregator and downstream tools.
    const debtScore = oldestAgeDays * repoExtras.openIssuesCount;
    // v0.3 weighted score that the threshold now compares against.
    const weightedDebtScore = debtScore * labelMultiplier;

    if (weightedDebtScore <= thresholds.bugDebtWarn) continue;

    const severity: Severity = labelMultiplier >= HIGH_SEVERITY_LABEL_FLOOR ? 'high' : 'medium';
    const [owner, name] = repo.nameWithOwner.split('/');

    out.push({
      id: findingId('bug-debt', repo.nameWithOwner, repoExtras.oldestOpenIssueAt),
      schemaVersion: AUDIT_SCHEMA_VERSION,
      severity,
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
      metadata: {
        debtScore,
        weightedDebtScore,
        labelMultiplier,
        oldestAgeDays,
        openIssuesCount: repoExtras.openIssuesCount,
        dominantLabels,
      },
    });
  }

  return out;
};

/**
 * Walk the sampled issue labels, look each one up in LABEL_WEIGHTS
 * case-insensitively, and take the maximum multiplier (multi-match → max).
 * Untyped issues default to 1.0. The result is capped at MAX_LABEL_MULTIPLIER
 * so a stray weight bump in the table can't blow past the documented ceiling.
 *
 * `dominantLabels` is the subset of label names that produced the maximum
 * multiplier — used purely for downstream metadata visibility.
 */
function computeLabelMultiplier(labels: ReadonlyArray<{ name: string; color: string | null }>): {
  multiplier: number;
  dominantLabels: string[];
} {
  let max = 1;
  const matches: Array<{ name: string; weight: number }> = [];
  for (const label of labels) {
    const key = label.name.toLowerCase();
    const weight = LABEL_WEIGHTS[key];
    if (typeof weight !== 'number') continue;
    matches.push({ name: label.name, weight });
    if (weight > max) max = weight;
  }
  const capped = Math.min(max, MAX_LABEL_MULTIPLIER);
  const dominantLabels = matches.filter((m) => m.weight === capped).map((m) => m.name);
  return { multiplier: capped, dominantLabels };
}
