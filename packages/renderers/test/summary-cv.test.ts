import { describe, expect, it } from 'vitest';
import { renderCvMarkdown } from '../src/summary-cv.js';
import { caseStudy, cvSummary, skills, user } from './summary-fixtures.js';

describe('renderCvMarkdown', () => {
  it('renders "## {name}" heading when user.name is non-null', () => {
    const out = renderCvMarkdown(cvSummary({ user: user({ name: 'Octo Learner' }) }));
    expect(out).toContain('## Octo Learner');
    expect(out).not.toContain('## octolearn');
  });

  it('falls back to login as heading when user.name is null', () => {
    const out = renderCvMarkdown(cvSummary({ user: user({ name: null, login: 'octolearn' }) }));
    expect(out).toContain('## octolearn');
  });

  it('emits the "Strong:" tier line only when skills.strong is non-empty', () => {
    const withStrong = renderCvMarkdown(
      cvSummary({ skills: skills({ strong: ['TypeScript'], working: [], familiar: [] }) }),
    );
    expect(withStrong).toContain('**Strong:** TypeScript');

    const withoutStrong = renderCvMarkdown(
      cvSummary({ skills: skills({ strong: [], working: ['Python'], familiar: [] }) }),
    );
    expect(withoutStrong).not.toContain('**Strong:**');
  });

  it('emits "Working knowledge:" only when skills.working is non-empty', () => {
    const withWorking = renderCvMarkdown(
      cvSummary({ skills: skills({ strong: [], working: ['Python'], familiar: [] }) }),
    );
    expect(withWorking).toContain('**Working knowledge:** Python');

    const withoutWorking = renderCvMarkdown(
      cvSummary({ skills: skills({ strong: ['TypeScript'], working: [], familiar: [] }) }),
    );
    expect(withoutWorking).not.toContain('**Working knowledge:**');
  });

  it('emits "Familiar with:" only when skills.familiar is non-empty', () => {
    const withFamiliar = renderCvMarkdown(
      cvSummary({ skills: skills({ strong: [], working: [], familiar: ['Go'] }) }),
    );
    expect(withFamiliar).toContain('**Familiar with:** Go');

    const withoutFamiliar = renderCvMarkdown(
      cvSummary({ skills: skills({ strong: ['TypeScript'], working: [], familiar: [] }) }),
    );
    expect(withoutFamiliar).not.toContain('**Familiar with:**');
  });

  it('per-project meta line includes top 3 languages joined with ", "', () => {
    const out = renderCvMarkdown(
      cvSummary({
        selectedProjects: [
          caseStudy({
            topLanguages: ['Python', 'TypeScript', 'Dockerfile', 'Shell', 'HTML'],
          }),
        ],
      }),
    );
    // Only 3 languages should appear in the meta line.
    expect(out).toContain('Python, TypeScript, Dockerfile');
    expect(out).not.toContain('Python, TypeScript, Dockerfile, Shell');
  });

  it('per-project meta line includes "{N}★" when stargazerCount > 0; omits when 0', () => {
    const stars = renderCvMarkdown(
      cvSummary({ selectedProjects: [caseStudy({ stargazerCount: 42 })] }),
    );
    expect(stars).toContain('42★');

    const zeroStars = renderCvMarkdown(
      cvSummary({ selectedProjects: [caseStudy({ stargazerCount: 0 })] }),
    );
    expect(zeroStars).not.toContain('★');
  });

  it('appends " · pinned" / " · archived" to the meta line for those flags', () => {
    const pinned = renderCvMarkdown(
      cvSummary({
        selectedProjects: [caseStudy({ isPinned: true, isArchived: false })],
      }),
    );
    expect(pinned).toContain('pinned');

    const archived = renderCvMarkdown(
      cvSummary({
        selectedProjects: [caseStudy({ isPinned: false, isArchived: true })],
      }),
    );
    expect(archived).toContain('archived');

    const neither = renderCvMarkdown(
      cvSummary({
        selectedProjects: [caseStudy({ isPinned: false, isArchived: false })],
      }),
    );
    expect(neither).not.toContain(' · pinned');
    expect(neither).not.toContain(' · archived');
  });

  it('writes the PortfolioCraft attribution as the footer line', () => {
    const out = renderCvMarkdown(cvSummary());
    expect(out).toContain(
      '_Generated from GitHub history by [PortfolioCraft](https://github.com/marketplace/actions/portfoliocraft-action)._',
    );
    // The footer should be the last line (followed only by the trailing newline).
    expect(out.trimEnd().endsWith('._')).toBe(true);
  });

  it('produces byte-identical output across two consecutive renders', () => {
    const cv = cvSummary();
    const a = renderCvMarkdown(cv);
    const b = renderCvMarkdown(cv);
    expect(a).toBe(b);
  });
});
