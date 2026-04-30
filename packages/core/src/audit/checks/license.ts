import { AUDIT_SCHEMA_VERSION, type AuditCheck, type AuditFinding, findingId } from '../schemas.js';

/**
 * licenseCheck — flags non-archived, non-fork repositories whose `licenseSpdx`
 * is null, meaning GitHub did not detect a recognized OSS license.
 */
export const licenseCheck: AuditCheck = (ctx): AuditFinding[] => {
  const { snapshot, extras, now } = ctx;
  const out: AuditFinding[] = [];

  for (const repo of snapshot.repositories) {
    if (repo.isArchived || repo.isFork) continue;
    const repoExtras = extras.perRepo.get(repo.nameWithOwner);
    if (!repoExtras) continue;
    if (repoExtras.licenseSpdx !== null) continue;

    const [owner, name] = repo.nameWithOwner.split('/');

    out.push({
      id: findingId('license', repo.nameWithOwner, 'no-license'),
      schemaVersion: AUDIT_SCHEMA_VERSION,
      severity: 'high',
      category: 'license',
      repo: {
        owner: owner ?? '',
        name: name ?? repo.name,
        url: repo.url,
      },
      title: `No LICENSE: ${repo.nameWithOwner}`,
      message:
        'An unlicensed repo cannot be reused legally; downstream contributors and employers will treat it as all-rights-reserved by default. Pick MIT or Apache-2.0 for permissive open source.',
      evidence: [
        {
          url: `${repo.url}/community`,
          label: 'Repo community profile',
        },
      ],
      suggestedAction: 'Add a LICENSE file (MIT or Apache-2.0 are common defaults).',
      detectedAt: now.toISOString(),
      metadata: {},
    });
  }

  return out;
};
