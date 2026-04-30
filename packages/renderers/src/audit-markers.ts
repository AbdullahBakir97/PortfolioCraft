export const AUDIT_START_MARKER = '<!-- PORTFOLIOCRAFT-AUDIT:START -->';
export const AUDIT_END_MARKER = '<!-- PORTFOLIOCRAFT-AUDIT:END -->';

export interface ApplyAuditMarkersResult {
  content: string;
  changed: boolean;
  hasMarkers: boolean;
}

export function applyAuditMarkers(existing: string, generated: string): ApplyAuditMarkersResult {
  const startIdx = existing.indexOf(AUDIT_START_MARKER);
  const endIdx = existing.indexOf(AUDIT_END_MARKER);

  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    return { content: existing, changed: false, hasMarkers: false };
  }

  const before = existing.slice(0, startIdx + AUDIT_START_MARKER.length);
  const after = existing.slice(endIdx);
  const block = `\n${generated.trim()}\n`;
  const next = `${before}${block}${after}`;

  return { content: next, changed: next !== existing, hasMarkers: true };
}
