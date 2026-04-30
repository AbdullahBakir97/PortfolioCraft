import type { Snapshot } from '../schemas.js';
import { archiveSuggestionCheck } from './checks/archive-suggestion.js';
import { archivedCheck } from './checks/archived.js';
import { bugDebtCheck } from './checks/bug-debt.js';
import { docsCheck } from './checks/docs.js';
import { licenseCheck } from './checks/license.js';
import { prRotCheck } from './checks/pr-rot.js';
import { staleCheck } from './checks/stale.js';
import { testsCheck } from './checks/tests.js';
import type { AuditExtras } from './ingest.js';
import {
  AUDIT_SCHEMA_VERSION,
  type AuditCheck,
  type AuditCheckContext,
  type AuditConfig,
  type AuditFinding,
  type AuditIgnore,
  type AuditReport,
  type AuditSummary,
  type Category,
  SEVERITY_RANK,
  type Severity,
} from './schemas.js';

export interface RunAuditOptions {
  snapshot: Snapshot;
  extras: AuditExtras;
  config: AuditConfig;
  user: string;
  now?: Date;
}

/**
 * Top-level entry point for the audit feature. Composes the registered checks
 * against a snapshot + extras, applies ignore filters, sorts findings, and
 * computes summary aggregates into an `AuditReport`.
 *
 * The `checks` array is intentionally empty in this foundation drop — agent 2
 * will fill it in by importing each check from `./checks/*.ts`.
 */
export async function runAudit(opts: RunAuditOptions): Promise<AuditReport> {
  const { snapshot, extras, config, user } = opts;
  const now = opts.now ?? new Date();

  const ctx: AuditCheckContext = {
    snapshot,
    extras,
    thresholds: config.thresholds,
    user,
    now,
  };

  const checks: AuditCheck[] = [
    staleCheck,
    licenseCheck,
    docsCheck,
    testsCheck,
    prRotCheck,
    bugDebtCheck,
    archivedCheck,
    archiveSuggestionCheck,
  ];

  const findings = composeFindings(checks, ctx, config.ignore);
  const summary = summarize(findings, snapshot);

  return {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    user,
    summary,
    findings,
    thresholds: config.thresholds,
  };
}

/**
 * Compose findings from a set of checks: run each check, drop ignored repos /
 * categories, dedupe by id, then sort. Exported so subsequent layers (and
 * tests) can reuse the deterministic ordering without going through runAudit.
 */
export function composeFindings(
  checks: AuditCheck[],
  ctx: AuditCheckContext,
  ignore: AuditIgnore,
): AuditFinding[] {
  const ignoredCategories = new Set<Category>(ignore.categories);
  const repoMatchers = ignore.repos.map((p) => compileRepoGlob(p));

  const seen = new Set<string>();
  const out: AuditFinding[] = [];
  for (const check of checks) {
    const produced = check(ctx);
    for (const finding of produced) {
      if (ignoredCategories.has(finding.category)) continue;
      if (finding.repo && repoMatchers.some((m) => m(repoKey(finding.repo)))) {
        continue;
      }
      if (seen.has(finding.id)) continue;
      seen.add(finding.id);
      out.push(finding);
    }
  }

  out.sort(compareFindings);
  return out;
}

function repoKey(repo: AuditFinding['repo']): string {
  if (!repo) return '';
  return `${repo.owner}/${repo.name}`;
}

/**
 * Sort key: severity desc → category asc → repo asc ('' last) → id asc.
 * All inputs are strictly typed so this is deterministic.
 */
function compareFindings(a: AuditFinding, b: AuditFinding): number {
  const sev = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  if (sev !== 0) return sev;
  if (a.category !== b.category) return a.category < b.category ? -1 : 1;

  const aRepo = repoKey(a.repo);
  const bRepo = repoKey(b.repo);
  if (aRepo !== bRepo) {
    if (aRepo === '') return 1;
    if (bRepo === '') return -1;
    return aRepo < bRepo ? -1 : 1;
  }
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/**
 * Tiny minimatch-style glob: supports `*` as a within-segment wildcard, exact
 * match otherwise. Sufficient for `ignore.repos` patterns like
 * `legacy-*`, `octocat/*`, `octocat/secret-repo`. Returns a predicate so the
 * compiled RegExp is reused across every finding.
 */
function compileRepoGlob(pattern: string): (input: string) => boolean {
  if (!pattern.includes('*')) {
    return (input) => input === pattern;
  }
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escaped.replace(/\*/g, '[^/]*')}$`);
  return (input) => regex.test(input);
}

function summarize(findings: AuditFinding[], snapshot: Snapshot): AuditSummary {
  const bySeverity: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  const byCategory: Record<Category, number> = {
    stale: 0,
    license: 0,
    docs: 0,
    tests: 0,
    'pr-rot': 0,
    'bug-debt': 0,
    archived: 0,
    'archive-suggestion': 0,
  };

  const reposWithFindings = new Set<string>();
  let bugDebtScore = 0;

  for (const finding of findings) {
    bySeverity[finding.severity] += 1;
    byCategory[finding.category] += 1;
    if (finding.repo) {
      reposWithFindings.add(`${finding.repo.owner}/${finding.repo.name}`);
    }
    if (finding.category === 'bug-debt') {
      const raw = finding.metadata.debtScore;
      if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
        bugDebtScore += raw;
      }
    }
  }

  return {
    totalFindings: findings.length,
    bySeverity,
    byCategory,
    bugDebtScore,
    reposScanned: snapshot.repositories.length,
    reposWithFindings: reposWithFindings.size,
  };
}
