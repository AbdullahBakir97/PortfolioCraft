import { AUDIT_SCHEMA_VERSION, type AuditCheck, type AuditFinding, findingId } from '../schemas.js';

/**
 * docsCheck — flags non-archived, non-fork repositories whose default branch
 * has no README.md at the root.
 */
export const docsCheck: AuditCheck = (ctx): AuditFinding[] => {
  const { snapshot, extras, now } = ctx;
  const out: AuditFinding[] = [];

  for (const repo of snapshot.repositories) {
    if (repo.isArchived || repo.isFork) continue;
    const repoExtras = extras.perRepo.get(repo.nameWithOwner);
    if (!repoExtras) continue;
    if (repoExtras.hasReadme) continue;

    const [owner, name] = repo.nameWithOwner.split('/');

    out.push({
      id: findingId('docs', repo.nameWithOwner, 'no-readme'),
      schemaVersion: AUDIT_SCHEMA_VERSION,
      severity: 'medium',
      category: 'docs',
      repo: {
        owner: owner ?? '',
        name: name ?? repo.name,
        url: repo.url,
      },
      title: `No README: ${repo.nameWithOwner}`,
      message:
        "A missing README hides the repo's purpose from visitors and search engines. Even a 5-line description compounds discoverability and trust.",
      evidence: [
        {
          url: repo.url,
          label: 'Repo root',
        },
      ],
      suggestedAction: 'Add a README.md with at minimum a one-line description and a quickstart.',
      detectedAt: now.toISOString(),
      metadata: {},
    });
  }

  return out;
};
