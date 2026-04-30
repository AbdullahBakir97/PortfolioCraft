import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Snapshot } from '../schemas.js';

/**
 * Schema version stamped onto every audit artifact (finding + report). Bump
 * when the wire shape of these objects changes in a way downstream renderers
 * or consumers cannot ignore.
 */
export const AUDIT_SCHEMA_VERSION = '1.0.0' as const;

export const Severity = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export type Severity = z.infer<typeof Severity>;

export const Category = z.enum([
  'stale',
  'license',
  'docs',
  'tests',
  'pr-rot',
  'bug-debt',
  'archived',
  'archive-suggestion',
]);
export type Category = z.infer<typeof Category>;

/**
 * Severity ordering used by the renderer + composeFindings sort. Higher number
 * means more severe; sort descending by this rank.
 */
export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

export const FindingRepoRef = z.object({
  owner: z.string(),
  name: z.string(),
  url: z.string().url(),
});
export type FindingRepoRef = z.infer<typeof FindingRepoRef>;

export const FindingEvidence = z.object({
  url: z.string().url(),
  label: z.string(),
});
export type FindingEvidence = z.infer<typeof FindingEvidence>;

export const AuditFinding = z.object({
  id: z.string().length(16),
  schemaVersion: z.literal(AUDIT_SCHEMA_VERSION),
  severity: Severity,
  category: Category,
  // null for cross-cutting findings that are not tied to a single repo
  repo: FindingRepoRef.nullable(),
  title: z.string(),
  message: z.string(),
  evidence: z.array(FindingEvidence).default([]),
  suggestedAction: z.string(),
  detectedAt: z.string().datetime(),
  metadata: z.record(z.unknown()).default({}),
});
export type AuditFinding = z.infer<typeof AuditFinding>;

export const AuditThresholds = z.object({
  staleRepoMonths: z.number().int().positive().default(6),
  prRotDays: z.number().int().positive().default(30),
  bugDebtWarn: z.number().int().positive().default(365),
});
export type AuditThresholds = z.infer<typeof AuditThresholds>;

export const AuditIgnore = z.object({
  repos: z.array(z.string()).default([]),
  categories: z.array(Category).default([]),
});
export type AuditIgnore = z.infer<typeof AuditIgnore>;

export const AuditOutputs = z.object({
  markdown: z.string().default('audit.md'),
  json: z.string().default('audit.json'),
});
export type AuditOutputs = z.infer<typeof AuditOutputs>;

/**
 * `failOn` accepts the empty string to mean "never fail". Anything else is a
 * Severity floor — a finding at that severity or above will cause the runner
 * to exit non-zero.
 */
export const AuditFailOn = z.union([Severity, z.literal('')]);
export type AuditFailOn = z.infer<typeof AuditFailOn>;

export const AuditConfig = z.object({
  enabled: z.boolean().default(true),
  thresholds: AuditThresholds.default({
    staleRepoMonths: 6,
    prRotDays: 30,
    bugDebtWarn: 365,
  }),
  ignore: AuditIgnore.default({ repos: [], categories: [] }),
  outputs: AuditOutputs.default({ markdown: 'audit.md', json: 'audit.json' }),
  failOn: AuditFailOn.default(''),
});
export type AuditConfig = z.infer<typeof AuditConfig>;

export const AuditSummary = z.object({
  totalFindings: z.number().int().nonnegative(),
  bySeverity: z.record(Severity, z.number().int().nonnegative()),
  byCategory: z.record(Category, z.number().int().nonnegative()),
  bugDebtScore: z.number().nonnegative(),
  reposScanned: z.number().int().nonnegative(),
  reposWithFindings: z.number().int().nonnegative(),
});
export type AuditSummary = z.infer<typeof AuditSummary>;

export const AuditReport = z.object({
  schemaVersion: z.literal(AUDIT_SCHEMA_VERSION),
  generatedAt: z.string().datetime(),
  user: z.string(),
  summary: AuditSummary,
  findings: z.array(AuditFinding),
  thresholds: AuditThresholds,
});
export type AuditReport = z.infer<typeof AuditReport>;

// ---------------------------------------------------------------------------
// Check authoring contract — used by checks/*.ts and runAudit.
// AuditExtras lives in ./ingest.ts to keep the GraphQL boundary types close
// to the GraphQL fetcher; we re-import it here only as a type so each check
// gets a single typed argument.
// ---------------------------------------------------------------------------

import type { AuditExtras } from './ingest.js';

export interface AuditCheckContext {
  snapshot: Snapshot;
  extras: AuditExtras;
  thresholds: AuditThresholds;
  user: string;
  now: Date;
}

export type AuditCheck = (ctx: AuditCheckContext) => AuditFinding[];

/**
 * Build the deterministic 16-char id used to dedupe findings across runs.
 * Reuses the sha256-slice-16 pattern from `cache.ts#keyOf`.
 */
export function findingId(category: Category, repo: string | null, evidenceKey: string): string {
  const joined = `${category}|${repo ?? ''}|${evidenceKey}`;
  return createHash('sha256').update(joined).digest('hex').slice(0, 16);
}
