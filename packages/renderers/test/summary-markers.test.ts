import { describe, expect, it } from 'vitest';
import { AUDIT_END_MARKER, AUDIT_START_MARKER } from '../src/audit-markers.js';
import {
  END_MARKER as PORTFOLIO_END_MARKER,
  START_MARKER as PORTFOLIO_START_MARKER,
} from '../src/markers.js';
import {
  applyCaseStudiesMarkers,
  applyCvMarkers,
  applyUniMarkers,
  SUMMARY_CASE_STUDIES_END_MARKER,
  SUMMARY_CASE_STUDIES_START_MARKER,
  SUMMARY_CV_END_MARKER,
  SUMMARY_CV_START_MARKER,
  SUMMARY_UNI_END_MARKER,
  SUMMARY_UNI_START_MARKER,
} from '../src/summary-markers.js';

describe('applyCvMarkers', () => {
  it('replaces only between CV markers, not the audit or portfolio markers', () => {
    const before = [
      '# Hi',
      '',
      PORTFOLIO_START_MARKER,
      'portfolio content',
      PORTFOLIO_END_MARKER,
      '',
      AUDIT_START_MARKER,
      'audit content',
      AUDIT_END_MARKER,
      '',
      SUMMARY_CV_START_MARKER,
      'old cv',
      SUMMARY_CV_END_MARKER,
    ].join('\n');
    const result = applyCvMarkers(before, '## CV\n\nNEW');
    expect(result.changed).toBe(true);
    expect(result.hasMarkers).toBe(true);
    // Sibling marker blocks must be untouched.
    expect(result.content).toContain(
      `${PORTFOLIO_START_MARKER}\nportfolio content\n${PORTFOLIO_END_MARKER}`,
    );
    expect(result.content).toContain(`${AUDIT_START_MARKER}\naudit content\n${AUDIT_END_MARKER}`);
    // CV block is replaced.
    expect(result.content).toContain(
      `${SUMMARY_CV_START_MARKER}\n## CV\n\nNEW\n${SUMMARY_CV_END_MARKER}`,
    );
    expect(result.content).not.toContain('old cv');
  });

  it('reports hasMarkers: false when CV markers are absent', () => {
    const before = '# Hi\n\nNo summary markers here.';
    const result = applyCvMarkers(before, 'NEW');
    expect(result.hasMarkers).toBe(false);
    expect(result.changed).toBe(false);
    expect(result.content).toBe(before);
  });

  it('reports changed: false when generated content equals existing block', () => {
    const initial = `${SUMMARY_CV_START_MARKER}\n${SUMMARY_CV_END_MARKER}\n`;
    const first = applyCvMarkers(initial, 'X');
    const second = applyCvMarkers(first.content, 'X');
    expect(second.changed).toBe(false);
    expect(second.content).toBe(first.content);
  });
});

describe('applyUniMarkers', () => {
  it('replaces only between UNI markers, not other marker pairs', () => {
    const before = [
      SUMMARY_CV_START_MARKER,
      'cv content',
      SUMMARY_CV_END_MARKER,
      '',
      SUMMARY_UNI_START_MARKER,
      'old uni',
      SUMMARY_UNI_END_MARKER,
      '',
      AUDIT_START_MARKER,
      'audit content',
      AUDIT_END_MARKER,
    ].join('\n');
    const result = applyUniMarkers(before, '# Uni\n\nNEW');
    expect(result.changed).toBe(true);
    expect(result.hasMarkers).toBe(true);
    expect(result.content).toContain(
      `${SUMMARY_CV_START_MARKER}\ncv content\n${SUMMARY_CV_END_MARKER}`,
    );
    expect(result.content).toContain(`${AUDIT_START_MARKER}\naudit content\n${AUDIT_END_MARKER}`);
    expect(result.content).not.toContain('old uni');
  });

  it('reports hasMarkers: false when UNI markers are absent', () => {
    const before = `${SUMMARY_CV_START_MARKER}\n${SUMMARY_CV_END_MARKER}`;
    const result = applyUniMarkers(before, 'NEW');
    expect(result.hasMarkers).toBe(false);
    expect(result.changed).toBe(false);
  });

  it('reports changed: false when generated content equals existing block', () => {
    const initial = `${SUMMARY_UNI_START_MARKER}\n${SUMMARY_UNI_END_MARKER}\n`;
    const first = applyUniMarkers(initial, 'X');
    const second = applyUniMarkers(first.content, 'X');
    expect(second.changed).toBe(false);
    expect(second.content).toBe(first.content);
  });
});

describe('applyCaseStudiesMarkers', () => {
  it('replaces only between CASE-STUDIES markers, not other marker pairs', () => {
    const before = [
      SUMMARY_CV_START_MARKER,
      'cv content',
      SUMMARY_CV_END_MARKER,
      '',
      SUMMARY_UNI_START_MARKER,
      'uni content',
      SUMMARY_UNI_END_MARKER,
      '',
      SUMMARY_CASE_STUDIES_START_MARKER,
      'old cs',
      SUMMARY_CASE_STUDIES_END_MARKER,
    ].join('\n');
    const result = applyCaseStudiesMarkers(before, '## Case studies\n\nNEW');
    expect(result.changed).toBe(true);
    expect(result.hasMarkers).toBe(true);
    expect(result.content).toContain(
      `${SUMMARY_CV_START_MARKER}\ncv content\n${SUMMARY_CV_END_MARKER}`,
    );
    expect(result.content).toContain(
      `${SUMMARY_UNI_START_MARKER}\nuni content\n${SUMMARY_UNI_END_MARKER}`,
    );
    expect(result.content).not.toContain('old cs');
  });

  it('reports hasMarkers: false when CASE-STUDIES markers are absent', () => {
    const before = `${SUMMARY_UNI_START_MARKER}\n${SUMMARY_UNI_END_MARKER}`;
    const result = applyCaseStudiesMarkers(before, 'NEW');
    expect(result.hasMarkers).toBe(false);
    expect(result.changed).toBe(false);
  });

  it('reports changed: false when generated content equals existing block', () => {
    const initial = `${SUMMARY_CASE_STUDIES_START_MARKER}\n${SUMMARY_CASE_STUDIES_END_MARKER}\n`;
    const first = applyCaseStudiesMarkers(initial, 'X');
    const second = applyCaseStudiesMarkers(first.content, 'X');
    expect(second.changed).toBe(false);
    expect(second.content).toBe(first.content);
  });
});
