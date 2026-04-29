import type { PortfolioReport } from '@devportfolio/core';
import { type CSSProperties, type ReactElement, type ReactNode, createElement } from 'react';
import satori from 'satori';

export interface RenderSvgOptions {
  report: PortfolioReport;
  fonts: Array<{
    name: string;
    data: ArrayBuffer;
    weight?: 400 | 700;
    style?: 'normal' | 'italic';
  }>;
}

export interface SvgCard {
  filename: string;
  svg: string;
}

export async function renderSvgCards({ report, fonts }: RenderSvgOptions): Promise<SvgCard[]> {
  const stackCard = await satori(stackJsx(report), { width: 480, height: 200, fonts });
  const projectsCard = await satori(projectsJsx(report), { width: 480, height: 200, fonts });
  const activityCard = await satori(activityJsx(report), { width: 480, height: 200, fonts });

  return [
    { filename: 'stack.svg', svg: stackCard },
    { filename: 'projects.svg', svg: projectsCard },
    { filename: 'activity.svg', svg: activityCard },
  ];
}

function div(style: CSSProperties, children: ReactNode): ReactElement {
  return createElement('div', { style }, children);
}

function stackJsx(report: PortfolioReport): ReactElement {
  const top = report.stack.slice(0, 5);
  return div(
    {
      width: 480,
      height: 200,
      display: 'flex',
      flexDirection: 'column',
      padding: 20,
      background: 'linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)',
      color: 'white',
      fontFamily: 'Inter',
    },
    [
      div({ fontSize: 20, fontWeight: 700, marginBottom: 12 }, 'Stack'),
      ...top.map((s, i) =>
        div(
          {
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 6,
          },
          [
            createElement('span', { key: `n-${i}`, style: { fontSize: 14 } }, s.language),
            createElement(
              'span',
              { key: `s-${i}`, style: { fontSize: 12, opacity: 0.8 } },
              `${s.tier} · ${s.score.toFixed(2)}`,
            ),
          ],
        ),
      ),
    ],
  );
}

function projectsJsx(report: PortfolioReport): ReactElement {
  return div(
    {
      width: 480,
      height: 200,
      display: 'flex',
      flexDirection: 'column',
      padding: 20,
      background: '#0f172a',
      color: 'white',
      fontFamily: 'Inter',
    },
    [
      div({ fontSize: 20, fontWeight: 700, marginBottom: 12 }, 'Highlighted projects'),
      ...report.projects.slice(0, 4).map((p, i) =>
        div(
          {
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 6,
          },
          [
            createElement('span', { key: `n-${i}`, style: { fontSize: 14 } }, p.repository.name),
            createElement(
              'span',
              { key: `s-${i}`, style: { fontSize: 12, opacity: 0.7 } },
              `${p.domain} · ★ ${p.repository.stargazerCount}`,
            ),
          ],
        ),
      ),
    ],
  );
}

function activityJsx(report: PortfolioReport): ReactElement {
  const c = report.snapshot.contributions;
  const cells: Array<[string, string]> = [
    ['Commits', String(c.totalCommits)],
    ['PRs', String(c.totalPRs)],
    ['Reviews', String(c.totalReviews)],
    ['Issues', String(c.totalIssues)],
  ];
  return div(
    {
      width: 480,
      height: 200,
      display: 'flex',
      flexDirection: 'column',
      padding: 20,
      background: '#111827',
      color: '#f9fafb',
      fontFamily: 'Inter',
    },
    [
      div({ fontSize: 20, fontWeight: 700, marginBottom: 16 }, 'Activity (last year)'),
      div(
        { display: 'flex', flexDirection: 'row', gap: 16 },
        cells.map(([label, value], i) =>
          div({ display: 'flex', flexDirection: 'column', flex: 1 }, [
            createElement(
              'span',
              {
                key: `v-${i}`,
                style: { fontSize: 28, fontWeight: 700, color: '#a78bfa' },
              },
              value,
            ),
            createElement('span', { key: `l-${i}`, style: { fontSize: 12, opacity: 0.7 } }, label),
          ]),
        ),
      ),
    ],
  );
}
