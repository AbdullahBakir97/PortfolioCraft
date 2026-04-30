import { describe, expect, it } from 'vitest';
import { AUDIT_END_MARKER, AUDIT_START_MARKER, applyAuditMarkers } from '../src/audit-markers.js';
import {
  END_MARKER as PORTFOLIO_END_MARKER,
  START_MARKER as PORTFOLIO_START_MARKER,
} from '../src/markers.js';

describe('applyAuditMarkers', () => {
  it('replaces only between AUDIT markers, not portfolio markers', () => {
    const before = [
      '# Hi',
      '',
      PORTFOLIO_START_MARKER,
      'portfolio content',
      PORTFOLIO_END_MARKER,
      '',
      AUDIT_START_MARKER,
      'old audit',
      AUDIT_END_MARKER,
      '',
      'footer',
    ].join('\n');

    const result = applyAuditMarkers(before, '## Audit\n\nNEW');
    expect(result.changed).toBe(true);
    expect(result.hasMarkers).toBe(true);
    // Portfolio block is untouched.
    expect(result.content).toContain(
      `${PORTFOLIO_START_MARKER}\nportfolio content\n${PORTFOLIO_END_MARKER}`,
    );
    // Audit block is replaced.
    expect(result.content).toContain(`${AUDIT_START_MARKER}\n## Audit\n\nNEW\n${AUDIT_END_MARKER}`);
    // Old payload is gone.
    expect(result.content).not.toContain('old audit');
  });

  it('reports hasMarkers: false when audit markers are absent', () => {
    const before = '# Hi\n\nNo audit markers here.';
    const result = applyAuditMarkers(before, 'NEW');
    expect(result.hasMarkers).toBe(false);
    expect(result.changed).toBe(false);
    expect(result.content).toBe(before);
  });

  it('reports hasMarkers: false when only one of the two markers is present', () => {
    const before = `${AUDIT_START_MARKER}\nbody\n`;
    const result = applyAuditMarkers(before, 'NEW');
    expect(result.hasMarkers).toBe(false);
    expect(result.changed).toBe(false);
  });

  it('reports hasMarkers: false when END appears before START (malformed)', () => {
    const before = `${AUDIT_END_MARKER}\nstuff\n${AUDIT_START_MARKER}`;
    const result = applyAuditMarkers(before, 'NEW');
    expect(result.hasMarkers).toBe(false);
    expect(result.changed).toBe(false);
  });

  it('reports changed: false when generated content equals existing block', () => {
    const initial = `${AUDIT_START_MARKER}\n${AUDIT_END_MARKER}\n`;
    const first = applyAuditMarkers(initial, 'X');
    const second = applyAuditMarkers(first.content, 'X');
    expect(second.changed).toBe(false);
    expect(second.content).toBe(first.content);
  });

  it('trims surrounding whitespace from generated content before insertion', () => {
    const before = `${AUDIT_START_MARKER}\n${AUDIT_END_MARKER}`;
    const result = applyAuditMarkers(before, '   \nNEW\n   ');
    expect(result.content).toBe(`${AUDIT_START_MARKER}\nNEW\n${AUDIT_END_MARKER}`);
  });
});
