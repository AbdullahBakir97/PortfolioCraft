import { AUDIT_SCHEMA_VERSION, type AuditCheck, type AuditFinding, findingId } from '../schemas.js';

const TEST_DIR_NAMES = new Set(['test', 'tests', 'spec', '__tests__']);
const TEST_FILE_PATTERN = /\.(test|spec)\.[a-z]+$/i;

/**
 * testsCheck — heuristic detector that flags repos whose default-branch root
 * has no test directory and no top-level *.test.* / *.spec.* files. This is a
 * shallow signal; deeper detection (CI configs, package.json scripts) is
 * deferred to v0.3.
 */
export const testsCheck: AuditCheck = (ctx): AuditFinding[] => {
  const { snapshot, extras, now } = ctx;
  const out: AuditFinding[] = [];

  for (const repo of snapshot.repositories) {
    if (repo.isArchived || repo.isFork) continue;
    const repoExtras = extras.perRepo.get(repo.nameWithOwner);
    if (!repoExtras) continue;

    const entries = repoExtras.topLevelEntries;
    const hasTestDir = entries.some((entry) => TEST_DIR_NAMES.has(entry.toLowerCase()));
    const hasTestFile = entries.some((entry) => TEST_FILE_PATTERN.test(entry));
    if (hasTestDir || hasTestFile) continue;

    const [owner, name] = repo.nameWithOwner.split('/');

    out.push({
      id: findingId('tests', repo.nameWithOwner, 'no-test-dir'),
      schemaVersion: AUDIT_SCHEMA_VERSION,
      severity: 'low',
      category: 'tests',
      repo: {
        owner: owner ?? '',
        name: name ?? repo.name,
        url: repo.url,
      },
      title: `No tests detected: ${repo.nameWithOwner}`,
      message:
        'Heuristic detector based on top-level entries found no test directory or *.test/spec.* files. Even a single smoke test compounds confidence over time.',
      evidence: [
        {
          url: repo.url,
          label: 'Repo root contents',
        },
      ],
      suggestedAction: 'Add a tests directory with at least a smoke test for your main entrypoint.',
      detectedAt: now.toISOString(),
      metadata: {},
    });
  }

  return out;
};
