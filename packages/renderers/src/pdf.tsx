import type { PortfolioReport } from '@portfoliocraft/core';
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 11, lineHeight: 1.4, color: '#1f2937' },
  header: { marginBottom: 16 },
  name: { fontSize: 22, fontWeight: 'bold', color: '#111827' },
  bio: { fontSize: 11, color: '#4b5563', marginTop: 4 },
  section: { marginTop: 16 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#7c3aed',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  small: { fontSize: 9, color: '#6b7280' },
});

export interface RenderPdfOptions {
  report: PortfolioReport;
}

export async function renderPdf({ report }: RenderPdfOptions): Promise<Buffer> {
  const u = report.snapshot.user;
  const doc = createElement(
    Document,
    null,
    createElement(
      Page,
      { size: 'A4', style: styles.page },
      createElement(
        View,
        { style: styles.header },
        createElement(Text, { style: styles.name }, u.name ?? u.login),
        u.bio ? createElement(Text, { style: styles.bio }, u.bio) : null,
        createElement(
          Text,
          { style: styles.small },
          `${u.publicRepos} public repositories · ${u.followers} followers · github.com/${u.login}`,
        ),
      ),
      createElement(
        View,
        { style: styles.section },
        createElement(Text, { style: styles.sectionTitle }, 'Stack'),
        ...report.stack
          .slice(0, 8)
          .map((s, i) =>
            createElement(
              View,
              { style: styles.row, key: `stack-${i}` },
              createElement(Text, null, `${s.language}`),
              createElement(
                Text,
                { style: styles.small },
                `${s.tier} · score ${s.score.toFixed(2)}`,
              ),
            ),
          ),
      ),
      createElement(
        View,
        { style: styles.section },
        createElement(Text, { style: styles.sectionTitle }, 'Highlighted projects'),
        ...report.projects.map((p, i) =>
          createElement(
            View,
            { key: `proj-${i}`, style: { marginBottom: 8 } },
            createElement(Text, { style: { fontWeight: 'bold' } }, p.repository.name),
            createElement(
              Text,
              { style: styles.small },
              `${p.domain} · ★ ${p.repository.stargazerCount}`,
            ),
            p.repository.description ? createElement(Text, null, p.repository.description) : null,
          ),
        ),
      ),
      createElement(
        View,
        { style: styles.section },
        createElement(Text, { style: styles.sectionTitle }, 'Activity'),
        createElement(
          Text,
          null,
          `${report.snapshot.contributions.totalCommits} commits · ${report.snapshot.contributions.totalPRs} PRs · ${report.snapshot.contributions.totalReviews} reviews · contributed to ${report.snapshot.contributions.reposContributedTo} repositories`,
        ),
      ),
    ),
  );

  return renderToBuffer(doc);
}
