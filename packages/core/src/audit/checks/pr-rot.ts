// v0.2 simplification: this check uses open-PR-age regardless of who's
// waiting on whom. v0.3 will introspect each PR's timeline to detect
// "awaiting author response" vs "awaiting reviewer" — but that requires
// a per-PR GraphQL query and a much larger API budget.
import { AUDIT_SCHEMA_VERSION, type AuditCheck, type AuditFinding, findingId } from '../schemas.js';

const MS_PER_DAY = 86_400_000;
const HIGH_SEVERITY_DAYS = 90;

/**
 * prRotCheck — flags the user's own open PRs that have been open longer than
 * the configured `prRotDays` threshold.
 */
export const prRotCheck: AuditCheck = (ctx): AuditFinding[] => {
  const { extras, thresholds, now } = ctx;
  const out: AuditFinding[] = [];

  for (const pr of extras.userOpenPRs) {
    const createdAtMs = Date.parse(pr.createdAt);
    if (!Number.isFinite(createdAtMs)) continue;
    const ageDays = Math.floor((now.getTime() - createdAtMs) / MS_PER_DAY);
    if (ageDays <= thresholds.prRotDays) continue;

    const severity = ageDays > HIGH_SEVERITY_DAYS ? 'high' : 'medium';
    const nameWithOwner = pr.repository;
    const [owner, name] = nameWithOwner.split('/');
    const repoUrl = `https://github.com/${nameWithOwner}`;

    out.push({
      id: findingId('pr-rot', nameWithOwner, String(pr.number)),
      schemaVersion: AUDIT_SCHEMA_VERSION,
      severity,
      category: 'pr-rot',
      repo: {
        owner: owner ?? '',
        name: name ?? '',
        url: repoUrl,
      },
      title: `Stale PR: ${nameWithOwner}#${pr.number}`,
      message: `This PR has been open for ${ageDays} days. Review or close at ${pr.url} to keep your contribution graph honest.`,
      evidence: [
        {
          url: pr.url,
          label: `Opened ${ageDays} days ago`,
        },
      ],
      suggestedAction: 'Update with a fresh comment, mark as draft, or close.',
      detectedAt: now.toISOString(),
      metadata: { ageDays },
    });
  }

  return out;
};
