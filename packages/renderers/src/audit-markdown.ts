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
 *
 * v0.3 additions (additive — no existing line is removed):
 *  - "Verified signal" section between the severity table and findings, when
 *    `summary.verifiedSignatureRatio` is non-null.
 *  - Per-finding label-multiplier line for `bug-debt` findings whose metadata
 *    indicates the dominant labels boosted the weight above 1.
 *  - Per-finding "Awaiting" line for `pr-rot` findings exposing
 *    `metadata.lastActorRole`.
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

  // v0.3: verified-signal summary. Skip the section entirely when null so we
  // don't render a misleading "n/a" — the absence of the section is itself
  // the signal that no repos had usable signature stats.
  const ratio = report.summary.verifiedSignatureRatio;
  if (ratio !== null && ratio !== undefined) {
    lines.push('### Verified signal');
    lines.push('');
    lines.push(
      `- Signed-commit ratio: ${formatPercent(ratio)} (averaged across repos with commit history)`,
    );
    lines.push('');
  }

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

  // v0.3: bug-debt label multiplier surfacing. Only emit when a label match
  // actually boosted the weight (multiplier > 1) — multiplier === 1 means no
  // labels matched LABEL_WEIGHTS and the line would carry no information.
  if (finding.category === 'bug-debt') {
    const labelLine = renderBugDebtLabelLine(finding);
    if (labelLine !== null) out.push(labelLine);
  }

  // v0.3: pr-rot awaiting-role surfacing. Maps the machine role onto a
  // human-readable phrase so visitors of the audit don't have to learn the
  // 'author' / 'reviewer' / 'unknown' enum.
  if (finding.category === 'pr-rot') {
    const awaitingLine = renderPrRotAwaitingLine(finding);
    if (awaitingLine !== null) out.push(awaitingLine);
  }

  if (finding.evidence.length > 0) {
    const links = finding.evidence.map((ev) => `[${ev.label}](${ev.url})`).join(', ');
    out.push(`  - Evidence: ${links}`);
  }
  out.push(`  - **Action:** ${finding.suggestedAction}`);
  out.push('');
  return out;
}

function renderBugDebtLabelLine(finding: AuditFinding): string | null {
  const meta = finding.metadata;
  const rawMultiplier = meta.labelMultiplier;
  if (typeof rawMultiplier !== 'number' || !Number.isFinite(rawMultiplier)) return null;
  if (rawMultiplier <= 1) return null;

  const dominant = meta.dominantLabels;
  const labels = Array.isArray(dominant)
    ? dominant.filter((l): l is string => typeof l === 'string')
    : [];
  const multiplierText = formatMultiplier(rawMultiplier);
  if (labels.length === 0) {
    return `  - Label weight: × ${multiplierText}`;
  }
  return `  - Label weight: × ${multiplierText} (dominant labels: ${labels.join(', ')})`;
}

function renderPrRotAwaitingLine(finding: AuditFinding): string | null {
  const meta = finding.metadata;
  const role = meta.lastActorRole;
  if (typeof role !== 'string') return null;

  const ageRaw = meta.ageDays;
  const ageDays =
    typeof ageRaw === 'number' && Number.isFinite(ageRaw) && ageRaw >= 0
      ? Math.floor(ageRaw)
      : null;

  const human = humanizeAwaiting(role);
  if (human === null) return null;
  if (ageDays === null) {
    return `  - Awaiting: ${human}`;
  }
  return `  - Awaiting: ${human} (${ageDays} days)`;
}

function humanizeAwaiting(role: string): string | null {
  // 'author' = the audited user spoke last → the ball is in their court.
  // 'reviewer' = anyone else spoke last → waiting on a reviewer/maintainer.
  // 'unknown' = no usable timeline data; we still surface so the line stays
  // self-consistent rather than silently dropping.
  switch (role) {
    case 'author':
      return 'your response';
    case 'reviewer':
      return 'reviewer';
    case 'unknown':
      return 'unknown';
    default:
      return null;
  }
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

function formatPercent(ratio: number): string {
  // Clamp to [0, 1] defensively so a malformed input can't render a 1003%
  // ratio. Round half away from zero — Math.round handles that for positive
  // numbers, which is all this branch ever sees.
  const clamped = Math.max(0, Math.min(1, ratio));
  return `${Math.round(clamped * 100)}%`;
}

function formatMultiplier(value: number): string {
  // Whole multipliers render as "2", fractional ones as "1.5" — matching the
  // LABEL_WEIGHTS entries (0.5, 1, 2, 3, 4) without trailing zeros.
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, '');
}
