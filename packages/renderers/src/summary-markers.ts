/**
 * Marker pairs for the v0.4 application-summary renderers. The shape mirrors
 * `audit-markers.ts` exactly so the writer in @portfoliocraft/action can use
 * the same idempotent replace-between-markers strategy for all three outputs.
 *
 * Three independent pairs so a single document can host any combination:
 *  - CV summary
 *  - University-application summary
 *  - Per-project case studies
 */

export const SUMMARY_CV_START_MARKER = '<!-- PORTFOLIOCRAFT-CV:START -->';
export const SUMMARY_CV_END_MARKER = '<!-- PORTFOLIOCRAFT-CV:END -->';

export const SUMMARY_UNI_START_MARKER = '<!-- PORTFOLIOCRAFT-UNI:START -->';
export const SUMMARY_UNI_END_MARKER = '<!-- PORTFOLIOCRAFT-UNI:END -->';

export const SUMMARY_CASE_STUDIES_START_MARKER = '<!-- PORTFOLIOCRAFT-CASE-STUDIES:START -->';
export const SUMMARY_CASE_STUDIES_END_MARKER = '<!-- PORTFOLIOCRAFT-CASE-STUDIES:END -->';

export interface ApplySummaryMarkersResult {
  content: string;
  changed: boolean;
  hasMarkers: boolean;
}

function applyMarkerPair(
  existing: string,
  generated: string,
  startMarker: string,
  endMarker: string,
): ApplySummaryMarkersResult {
  const startIdx = existing.indexOf(startMarker);
  const endIdx = existing.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    return { content: existing, changed: false, hasMarkers: false };
  }

  const before = existing.slice(0, startIdx + startMarker.length);
  const after = existing.slice(endIdx);
  const block = `\n${generated.trim()}\n`;
  const next = `${before}${block}${after}`;

  return { content: next, changed: next !== existing, hasMarkers: true };
}

export function applyCvMarkers(existing: string, generated: string): ApplySummaryMarkersResult {
  return applyMarkerPair(existing, generated, SUMMARY_CV_START_MARKER, SUMMARY_CV_END_MARKER);
}

export function applyUniMarkers(existing: string, generated: string): ApplySummaryMarkersResult {
  return applyMarkerPair(existing, generated, SUMMARY_UNI_START_MARKER, SUMMARY_UNI_END_MARKER);
}

export function applyCaseStudiesMarkers(
  existing: string,
  generated: string,
): ApplySummaryMarkersResult {
  return applyMarkerPair(
    existing,
    generated,
    SUMMARY_CASE_STUDIES_START_MARKER,
    SUMMARY_CASE_STUDIES_END_MARKER,
  );
}
