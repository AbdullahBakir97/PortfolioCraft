import { AuditReport } from '@portfoliocraft/core';
import type { AuditReport as AuditReportType } from '@portfoliocraft/core';

/**
 * Validate the report through the Zod schema (which also strips unknown
 * fields) and return the canonical JSON serialization with a trailing
 * newline so the file plays nicely with POSIX tooling and git.
 */
export function renderAuditJson(report: AuditReportType): string {
  const validated = AuditReport.parse(report);
  return `${JSON.stringify(validated, null, 2)}\n`;
}

/**
 * Same validation pass as `renderAuditJson`, but returns the parsed object
 * rather than serializing it. Useful for callers that want to feed the
 * report into another structured sink (e.g. GitHub Actions `core.summary`).
 */
export function renderAuditJsonObject(report: AuditReportType): unknown {
  return AuditReport.parse(report);
}
