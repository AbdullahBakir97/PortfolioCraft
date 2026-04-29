export const START_MARKER = '<!-- DEVPORTFOLIO:START -->';
export const END_MARKER = '<!-- DEVPORTFOLIO:END -->';

export interface ApplyMarkersResult {
  content: string;
  changed: boolean;
  hasMarkers: boolean;
}

export function applyMarkers(existing: string, generated: string): ApplyMarkersResult {
  const startIdx = existing.indexOf(START_MARKER);
  const endIdx = existing.indexOf(END_MARKER);

  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    return { content: existing, changed: false, hasMarkers: false };
  }

  const before = existing.slice(0, startIdx + START_MARKER.length);
  const after = existing.slice(endIdx);
  const block = `\n${generated.trim()}\n`;
  const next = `${before}${block}${after}`;

  return { content: next, changed: next !== existing, hasMarkers: true };
}
