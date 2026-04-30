import type { AuditFinding, AuditReport, Severity } from '@portfoliocraft/core';

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

const SEVERITY_ROWS: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

/**
 * Render an `AuditReport` as deterministic Markdown.
 *
 * Pure function: same input always produces the same output. Findings are
 * sorted by severity desc, then category, then repo (owner/name), then id so
 * the diff between two runs is minimal when nothing changed.
 */
export function renderAuditMarkdown(report: AuditReport): string {
  const date = formatDate(report.generatedAt);
  const lines: string[] = [];

  lines.push('## Audit');
  lines.push('');

  if (report.findings.length === 0) {
    lines.push(`_Generated ${date}. No findings — repos look healthy._`);
    return `${lines.join('\n')}\n`;
  }

  const { totalFindings, reposScanned, reposWithFindings } = report.summary;
  lines.push(
    `_Generated ${date}. ${totalFindings} findings across ${reposScanned} repos (${reposWithFindings} flagged)._`,
  );
  lines.push('');

  lines.push('| Severity | Count |');
  lines.push('| --- | --- |');
  for (const sev of SEVERITY_ROWS) {
    const count = report.summary.bySeverity[sev] ?? 0;
    lines.push(`| ${sev} | ${count} |`);
  }
  lines.push('');

  lines.push('### Findings');
  lines.push('');

  const sorted = [...report.findings].sort(compareFindings);
  for (const finding of sorted) {
    lines.push(...renderFinding(finding));
  }

  // Trim trailing blank line off the last finding block, then append a single
  // newline so the document ends cleanly.
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return `${lines.join('\n')}\n`;
}

function renderFinding(finding: AuditFinding): string[] {
  const out: string[] = [];
  out.push(`- **[${finding.severity}]** \`${finding.category}\` — ${finding.title}`);
  out.push(`  - ${finding.message}`);
  if (finding.evidence.length > 0) {
    const links = finding.evidence.map((ev) => `[${ev.label}](${ev.url})`).join(', ');
    out.push(`  - Evidence: ${links}`);
  }
  out.push(`  - **Action:** ${finding.suggestedAction}`);
  out.push('');
  return out;
}

function compareFindings(a: AuditFinding, b: AuditFinding): number {
  const sevDelta = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  if (sevDelta !== 0) return sevDelta;

  if (a.category !== b.category) {
    return a.category < b.category ? -1 : 1;
  }

  const repoA = repoKey(a);
  const repoB = repoKey(b);
  if (repoA !== repoB) {
    return repoA < repoB ? -1 : 1;
  }

  if (a.id !== b.id) {
    return a.id < b.id ? -1 : 1;
  }
  return 0;
}

function repoKey(finding: AuditFinding): string {
  return finding.repo ? `${finding.repo.owner}/${finding.repo.name}` : '';
}

function formatDate(iso: string): string {
  // ISO-8601 datetimes always start with YYYY-MM-DD; slicing keeps the
  // formatter locale-independent and avoids the Date-parse round-trip cost.
  return iso.slice(0, 10);
}
