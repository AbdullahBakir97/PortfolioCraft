import { describe, expect, it } from 'vitest';
import { renderUniMarkdown } from '../src/summary-uni.js';
import { caseStudy, uniSummary } from './summary-fixtures.js';

describe('renderUniMarkdown', () => {
  it('renders "# Software development background" as the top heading', () => {
    const out = renderUniMarkdown(uniSummary());
    expect(out).toContain('# Software development background');
  });

  it('renders learningTrajectory chronologically (ascending year)', () => {
    const out = renderUniMarkdown(uniSummary());
    const i2022 = out.indexOf('**2022**');
    const i2023 = out.indexOf('**2023**');
    const i2024 = out.indexOf('**2024**');
    expect(i2022).toBeGreaterThan(-1);
    expect(i2023).toBeGreaterThan(-1);
    expect(i2024).toBeGreaterThan(-1);
    expect(i2022).toBeLessThan(i2023);
    expect(i2023).toBeLessThan(i2024);
  });

  it('renders topProjects with full description and topics clause when topics.length >= 1', () => {
    const out = renderUniMarkdown(
      uniSummary({
        topProjects: [
          caseStudy({
            description: 'A backend API server in Python.',
            topics: ['django', 'rest', 'backend'],
          }),
        ],
      }),
    );
    expect(out).toContain('A backend API server in Python.');
    expect(out).toContain('with primary topics: django, rest, backend');
  });

  it('renders selfDirectedScope with rounded percent for openSourceShare', () => {
    // 5/6 → 83% after Math.round.
    const out = renderUniMarkdown(uniSummary());
    expect(out).toContain('83%');
    // The longest-project months and most-starred clauses should also surface.
    expect(out).toContain('24 months');
    expect(out).toContain('octolearn/api-server');
  });

  it('renders the all-open-source phrasing when openSourceShare === 1', () => {
    const out = renderUniMarkdown(
      uniSummary({
        selfDirectedScope: {
          totalReposScanned: 3,
          openSourceShare: 1,
          longestProjectMonths: 5,
          mostStarredRepo: 'octolearn/api-server',
        },
      }),
    );
    expect(out).toContain('all of which are open-source');
    expect(out).not.toContain('100% are open-source');
  });

  it('produces byte-identical output across two consecutive renders', () => {
    const uni = uniSummary();
    const a = renderUniMarkdown(uni);
    const b = renderUniMarkdown(uni);
    expect(a).toBe(b);
  });
});
