// v0.3 timeline-aware: classifies by who's awaiting whom via the per-PR
// timeline fetched in extras.userOpenPRs[].timeline. Falls back to v0.2
// age-only when timeline data is unavailable.
import {
  AUDIT_SCHEMA_VERSION,
  type AuditCheck,
  type AuditFinding,
  findingId,
  type Severity,
} from '../schemas.js';

const MS_PER_DAY = 86_400_000;
const HIGH_SEVERITY_DAYS = 90;

/**
 * prRotCheck — flags the user's own open PRs that need attention. v0.3 reads
 * each PR's timeline summary to decide whether the ball is in the author's
 * court (emit medium/high based on age since last activity), in a reviewer's
 * court (emit low — informational, not the author's problem), or unknown
 * (fall back to v0.2 age-since-createdAt heuristic).
 */
export const prRotCheck: AuditCheck = (ctx): AuditFinding[] => {
  const { extras, thresholds, now } = ctx;
  const out: AuditFinding[] = [];
  const nowMs = now.getTime();

  for (const pr of extras.userOpenPRs) {
    const nameWithOwner = pr.repository;
    const [owner, name] = nameWithOwner.split('/');
    const repoUrl = `https://github.com/${nameWithOwner}`;

    // No timeline — preserve v0.2 age-only behavior.
    if (pr.timeline === null) {
      const finding = buildAgeOnlyFinding({
        prNumber: pr.number,
        prUrl: pr.url,
        nameWithOwner,
        owner: owner ?? '',
        name: name ?? '',
        repoUrl,
        createdAt: pr.createdAt,
        nowMs,
        prRotDays: thresholds.prRotDays,
        nowIso: now.toISOString(),
        lastActorRole: 'unknown',
        lastEventAt: null,
      });
      if (finding) out.push(finding);
      continue;
    }

    const { lastActorRole, lastEventAt } = pr.timeline;

    if (lastActorRole === 'reviewer') {
      // Reviewer was last to act — the audited user is waiting on someone
      // else. Surface as low severity for visibility, not as a problem the
      // author needs to fix.
      const lastEventMs = Date.parse(lastEventAt);
      const ageDays = Number.isFinite(lastEventMs)
        ? Math.floor((nowMs - lastEventMs) / MS_PER_DAY)
        : 0;
      const lastEventDate = lastEventAt.split('T')[0] ?? lastEventAt;
      out.push({
        id: findingId('pr-rot', nameWithOwner, String(pr.number)),
        schemaVersion: AUDIT_SCHEMA_VERSION,
        severity: 'low',
        category: 'pr-rot',
        repo: {
          owner: owner ?? '',
          name: name ?? '',
          url: repoUrl,
        },
        title: `Awaiting reviewer: ${nameWithOwner}#${pr.number}`,
        message: `A reviewer was the last to act on this PR and hasn't replied since ${lastEventDate}. This isn't your problem to push on — it's logged for awareness.`,
        evidence: [
          {
            url: pr.url,
            label: `Last activity: ${lastEventDate}`,
          },
        ],
        suggestedAction: 'Reach out to the reviewer or convert to draft.',
        detectedAt: now.toISOString(),
        metadata: {
          lastActorRole,
          ageDays,
          lastEventAt,
        },
      });
      continue;
    }

    if (lastActorRole === 'author') {
      const lastEventMs = Date.parse(lastEventAt);
      if (!Number.isFinite(lastEventMs)) continue;
      const ageDays = Math.floor((nowMs - lastEventMs) / MS_PER_DAY);
      if (ageDays <= thresholds.prRotDays) continue;

      const severity: Severity = ageDays > HIGH_SEVERITY_DAYS ? 'high' : 'medium';
      const lastEventDate = lastEventAt.split('T')[0] ?? lastEventAt;
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
        title: `Stale PR (awaiting your response): ${nameWithOwner}#${pr.number}`,
        message: `You were the last to act ${ageDays} days ago. The ball is in your court — push a fresh commit, reply to feedback, or close the PR.`,
        evidence: [
          {
            url: pr.url,
            label: `Last activity: ${lastEventDate}`,
          },
        ],
        suggestedAction: 'Update with a fresh comment, mark as draft, or close.',
        detectedAt: now.toISOString(),
        metadata: {
          lastActorRole,
          ageDays,
          lastEventAt,
        },
      });
      continue;
    }

    // lastActorRole === 'unknown' — fall back to v0.2 age-since-createdAt
    // semantics so we still surface obviously-rotting PRs.
    const finding = buildAgeOnlyFinding({
      prNumber: pr.number,
      prUrl: pr.url,
      nameWithOwner,
      owner: owner ?? '',
      name: name ?? '',
      repoUrl,
      createdAt: pr.createdAt,
      nowMs,
      prRotDays: thresholds.prRotDays,
      nowIso: now.toISOString(),
      lastActorRole: 'unknown',
      lastEventAt,
    });
    if (finding) out.push(finding);
  }

  return out;
};

interface AgeOnlyArgs {
  prNumber: number;
  prUrl: string;
  nameWithOwner: string;
  owner: string;
  name: string;
  repoUrl: string;
  createdAt: string;
  nowMs: number;
  prRotDays: number;
  nowIso: string;
  lastActorRole: 'unknown';
  lastEventAt: string | null;
}

function buildAgeOnlyFinding(args: AgeOnlyArgs): AuditFinding | null {
  const createdAtMs = Date.parse(args.createdAt);
  if (!Number.isFinite(createdAtMs)) return null;
  const ageDays = Math.floor((args.nowMs - createdAtMs) / MS_PER_DAY);
  if (ageDays <= args.prRotDays) return null;

  const severity: Severity = ageDays > HIGH_SEVERITY_DAYS ? 'high' : 'medium';

  return {
    id: findingId('pr-rot', args.nameWithOwner, String(args.prNumber)),
    schemaVersion: AUDIT_SCHEMA_VERSION,
    severity,
    category: 'pr-rot',
    repo: {
      owner: args.owner,
      name: args.name,
      url: args.repoUrl,
    },
    title: `Stale PR: ${args.nameWithOwner}#${args.prNumber}`,
    message: `This PR has been open for ${ageDays} days. Review or close at ${args.prUrl} to keep your contribution graph honest.`,
    evidence: [
      {
        url: args.prUrl,
        label: `Opened ${ageDays} days ago`,
      },
    ],
    suggestedAction: 'Update with a fresh comment, mark as draft, or close.',
    detectedAt: args.nowIso,
    metadata: {
      lastActorRole: args.lastActorRole,
      ageDays,
      lastEventAt: args.lastEventAt,
    },
  };
}
