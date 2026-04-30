import { AUDIT_SCHEMA_VERSION, type AuditCheck, type AuditFinding, findingId } from '../schemas.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TWELVE_MONTHS_MS = 12 * 30 * MS_PER_DAY;

/**
 * archiveSuggestionCheck — composite signal that a repo is dormant and not
 * portfolio-grade: not archived, last push >12 months ago, no open issues, no
 * detected license, and not pinned. Pinned repos are always skipped to avoid
 * noisy suggestions on intentionally curated work.
 */
export const archiveSuggestionCheck: AuditCheck = (ctx): AuditFinding[] => {
  const { snapshot, extras, now } = ctx;
  const out: AuditFinding[] = [];
  const cutoff = now.getTime() - TWELVE_MONTHS_MS;

  for (const repo of snapshot.repositories) {
    if (repo.isArchived) continue;
    if (repo.isPinned) continue;
    if (repo.isFork) continue;

    const repoExtras = extras.perRepo.get(repo.nameWithOwner);
    if (!repoExtras) continue;
    if (repoExtras.openIssuesCount !== 0) continue;
    if (repoExtras.licenseSpdx !== null) continue;

    const pushedAtMs = Date.parse(repo.pushedAt);
    if (!Number.isFinite(pushedAtMs)) continue;
    if (pushedAtMs >= cutoff) continue;

    const lastPushDate = repo.pushedAt.split('T')[0] ?? repo.pushedAt;
    const [owner, name] = repo.nameWithOwner.split('/');

    out.push({
      id: findingId('archive-suggestion', repo.nameWithOwner, 'composite-dormant'),
      schemaVersion: AUDIT_SCHEMA_VERSION,
      severity: 'info',
      category: 'archive-suggestion',
      repo: {
        owner: owner ?? '',
        name: name ?? repo.name,
        url: repo.url,
      },
      title: `Consider archiving: ${repo.nameWithOwner}`,
      message: `Composite signal — no recent push (${lastPushDate}), no open issues, no license, not pinned — suggests this repo is dormant and not portfolio-grade. Archiving declutters your profile without losing the code.`,
      evidence: [
        {
          url: repo.url,
          label: `Last push: ${lastPushDate}`,
        },
      ],
      suggestedAction:
        'If unmaintained, archive to declutter your portfolio. Pinned repos are excluded automatically.',
      detectedAt: now.toISOString(),
      metadata: {},
    });
  }

  return out;
};
