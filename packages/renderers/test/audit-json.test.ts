import { describe, expect, it } from 'vitest';
import { renderAuditJson, renderAuditJsonObject } from '../src/audit-json.js';
import { finding, report } from './audit-fixtures.js';

describe('renderAuditJson', () => {
  it('round-trips: JSON.parse(renderAuditJson(report)) deep-equals the input', () => {
    const r = report({
      findings: [finding({ id: '0123456789abcdef' })],
      summary: {
        totalFindings: 1,
        bySeverity: { critical: 0, high: 0, medium: 1, low: 0, info: 0 },
        byCategory: {
          stale: 1,
          license: 0,
          docs: 0,
          tests: 0,
          'pr-rot': 0,
          'bug-debt': 0,
          archived: 0,
          'archive-suggestion': 0,
          'unverified-employer-context': 0,
        },
        bugDebtScore: 0,
        reposScanned: 1,
        reposWithFindings: 1,
        verifiedSignatureRatio: null,
      },
    });
    const serialized = renderAuditJson(r);
    const parsed = JSON.parse(serialized);
    expect(parsed).toEqual(r);
  });

  it('appends a trailing newline', () => {
    const r = report({ findings: [] });
    const out = renderAuditJson(r);
    expect(out.endsWith('\n')).toBe(true);
    // Exactly one newline at the end (no double).
    expect(out.endsWith('\n\n')).toBe(false);
  });

  it('throws on a malformed report (missing required field)', () => {
    const r = report({ findings: [] });
    // Strip a required top-level field; cast through unknown to satisfy TS-strict.
    const malformed = { ...r } as unknown as Record<string, unknown>;
    malformed.user = undefined;
    expect(() => renderAuditJson(malformed as never)).toThrow();
  });

  it('throws on a finding with an invalid id length', () => {
    const r = report({
      findings: [finding({ id: 'too-short' })],
    });
    expect(() => renderAuditJson(r)).toThrow();
  });

  it('renderAuditJsonObject returns a parsed object equal to the input', () => {
    const r = report({ findings: [] });
    const obj = renderAuditJsonObject(r) as typeof r;
    expect(obj).toEqual(r);
  });

  it('produces byte-identical serialization on repeat calls', () => {
    const r = report({ findings: [finding()] });
    const a = renderAuditJson(r);
    const b = renderAuditJson(r);
    expect(a).toBe(b);
  });

  it('round-trips a non-null verifiedSignatureRatio (e.g. 0.73)', () => {
    const r = report({
      findings: [],
      summary: {
        totalFindings: 0,
        bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        byCategory: {
          stale: 0,
          license: 0,
          docs: 0,
          tests: 0,
          'pr-rot': 0,
          'bug-debt': 0,
          archived: 0,
          'archive-suggestion': 0,
          'unverified-employer-context': 0,
        },
        bugDebtScore: 0,
        reposScanned: 1,
        reposWithFindings: 0,
        verifiedSignatureRatio: 0.73,
      },
    });
    const parsed = JSON.parse(renderAuditJson(r)) as typeof r;
    expect(parsed.summary.verifiedSignatureRatio).toBe(0.73);
    expect(parsed).toEqual(r);
  });
});
