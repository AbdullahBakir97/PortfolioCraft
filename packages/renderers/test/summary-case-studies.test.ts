import { describe, expect, it } from 'vitest';
import { renderCaseStudiesMarkdown } from '../src/summary-case-studies.js';
import { caseStudy } from './summary-fixtures.js';

describe('renderCaseStudiesMarkdown', () => {
  it('renders each project as "## {repo.name}" section', () => {
    const out = renderCaseStudiesMarkdown([
      caseStudy({
        repository: {
          owner: 'octolearn',
          name: 'api-server',
          url: 'https://github.com/octolearn/api-server',
          nameWithOwner: 'octolearn/api-server',
        },
      }),
      caseStudy({
        repository: {
          owner: 'octolearn',
          name: 'design-system',
          url: 'https://github.com/octolearn/design-system',
          nameWithOwner: 'octolearn/design-system',
        },
      }),
    ]);
    expect(out).toContain('## api-server');
    expect(out).toContain('## design-system');
  });

  it('Stack: line includes top 3 topLanguages (joined with ", ")', () => {
    const out = renderCaseStudiesMarkdown([
      caseStudy({
        topLanguages: ['Python', 'TypeScript', 'Dockerfile', 'Shell', 'HTML'],
        topics: [],
      }),
    ]);
    expect(out).toContain('**Stack:** Python, TypeScript, Dockerfile');
    // The 4th language should NOT leak into the stack line.
    expect(out).not.toContain('Python, TypeScript, Dockerfile, Shell');
  });

  it('Duration line uses "{Mon} {YYYY}" date format', () => {
    const out = renderCaseStudiesMarkdown([
      caseStudy({
        firstPushDate: '2022-03-15T00:00:00.000Z',
        lastPushDate: '2026-04-15T00:00:00.000Z',
        estimatedDurationMonths: 49,
      }),
    ]);
    // Match "**Duration:** Mar 2022–Apr 2026 (49 months)" via regex.
    const durationLine = /\*\*Duration:\*\*\s+[A-Z][a-z]{2}\s+\d{4}/;
    expect(durationLine.test(out)).toBe(true);
    expect(out).toContain('Mar 2022');
    expect(out).toContain('Apr 2026');
  });

  it('renders "_No projects yet._" placeholder when input array is empty', () => {
    const out = renderCaseStudiesMarkdown([]);
    expect(out).toContain('_No projects yet._');
    // The header should still be present.
    expect(out).toContain('# Project case studies');
  });

  it('produces byte-identical output across two consecutive renders', () => {
    const studies = [caseStudy()];
    const a = renderCaseStudiesMarkdown(studies);
    const b = renderCaseStudiesMarkdown(studies);
    expect(a).toBe(b);
  });
});
