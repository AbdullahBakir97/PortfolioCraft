#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  type AuditFinding,
  type AuditReport,
  type Category,
  SEVERITY_RANK,
  type Severity,
  buildReport,
  createGitHubClient,
  createLogger,
  ingestAuditExtras,
  ingestSnapshot,
  loadConfigFile,
  memoryCache,
  mergeConfigWithInputs,
  runAudit,
} from '@portfoliocraft/core';
import {
  applyMarkers,
  renderAuditJson,
  renderAuditMarkdown,
  renderJsonResume,
  renderMarkdown,
} from '@portfoliocraft/renderers';
import { Command } from 'commander';

const program = new Command();

program
  .name('portfoliocraft')
  .description('Generate a living portfolio from your GitHub activity')
  .version('0.2.0');

program
  .command('generate')
  .description('Generate portfolio artifacts for a GitHub user')
  .requiredOption('--user <login>', 'GitHub login to profile')
  .option('--token <token>', 'GitHub token (falls back to GITHUB_TOKEN env var)')
  .option('--config <path>', 'Path to .portfoliocraft.yml', '.portfoliocraft.yml')
  .option('--locale <locale>', 'Template locale (en|ar)', 'en')
  .option('--sections <list>', 'Comma-separated sections', 'header,stack,projects,activity')
  .option('--readme <path>', 'README to update between markers', 'README.md')
  .option('--json <path>', 'JSON Resume output path', 'profile.json')
  .option('--dry-run', 'Run without writing files', false)
  .option('--explain', 'Print scoring/classification reasoning', false)
  .action(async (opts) => {
    const token = (opts.token as string | undefined) ?? process.env.GITHUB_TOKEN;
    if (!token) {
      console.error('A token is required. Pass --token or set GITHUB_TOKEN.');
      process.exit(1);
    }

    const logger = createLogger({ level: opts.explain ? 'debug' : 'info', pretty: true });
    const client = createGitHubClient({ token });
    const cache = memoryCache();

    const fileConfig = await loadConfigFile(opts.config);
    const config = mergeConfigWithInputs(fileConfig, {
      sections: opts.sections,
      locale: opts.locale,
    });

    const snapshot = await ingestSnapshot({ client, user: opts.user, cache, logger });
    const report = buildReport({ config, snapshot });

    if (opts.explain) {
      console.error(
        JSON.stringify({ summary: report.summary, top: report.stack.slice(0, 5) }, null, 2),
      );
    }

    if (opts.readme) {
      try {
        const existing = await readFile(opts.readme, 'utf8');
        const md = await renderMarkdown({
          report,
          sections: config.sections,
          locale: config.locale,
        });
        const result = applyMarkers(existing, md);
        if (!result.hasMarkers) {
          console.warn(`No markers in ${opts.readme}; skipping README update.`);
        } else if (!opts.dryRun) {
          await writeFile(opts.readme, result.content, 'utf8');
        }
      } catch (err) {
        if (isFsNotFound(err)) {
          console.warn(`README not found at ${opts.readme}; skipping.`);
        } else throw err;
      }
    }

    if (opts.json && !opts.dryRun) {
      const resume = renderJsonResume(report);
      await mkdir(dirname(opts.json), { recursive: true });
      await writeFile(opts.json, JSON.stringify(resume, null, 2), 'utf8');
    }

    process.stdout.write(`${report.summary}\n`);
  });

program
  .command('audit')
  .description('Run the self-awareness audit on a GitHub user')
  .requiredOption('--user <login>', 'GitHub login to audit')
  .option('--token <token>', 'GitHub token (falls back to GITHUB_TOKEN env var)')
  .option('--config <path>', 'Path to .portfoliocraft.yml', '.portfoliocraft.yml')
  .option('--md <path>', 'Markdown audit output path', 'audit.md')
  .option('--json <path>', 'JSON audit output path', 'audit.json')
  .option('--severity <level>', 'Minimum severity to include (info|low|medium|high|critical)', '')
  .option('--dry-run', 'Run without writing files', false)
  .option('--explain', 'Print summary and top findings to stderr', false)
  .action(async (opts) => {
    const token = (opts.token as string | undefined) ?? process.env.GITHUB_TOKEN;
    if (!token) {
      console.error('A token is required. Pass --token or set GITHUB_TOKEN.');
      process.exit(1);
    }

    const logger = createLogger({ level: opts.explain ? 'debug' : 'info', pretty: true });
    const client = createGitHubClient({ token });
    const cache = memoryCache();

    const fileConfig = await loadConfigFile(opts.config);
    const snapshot = await ingestSnapshot({ client, user: opts.user, cache, logger });
    const extras = await ingestAuditExtras({
      client,
      user: opts.user,
      snapshot,
      cache,
      logger,
    });

    const baseReport = await runAudit({
      snapshot,
      extras,
      config: fileConfig.audit,
      user: opts.user,
    });

    // --severity filters in-place on the rendered report (post-orchestrator)
    // rather than being plumbed into runAudit. Reason: the orchestrator's
    // ignore filter is concept-level (categories/repos), while --severity is
    // a presentation knob; filtering on the way out keeps the JSON artifact
    // and the Markdown summary internally consistent without re-running
    // checks or mutating runAudit's contract.
    const report = filterReportBySeverity(baseReport, opts.severity as Severity | '');

    if (opts.explain) {
      printExplain(report);
    }

    if (opts.md && !opts.dryRun) {
      const md = renderAuditMarkdown(report);
      await mkdir(dirname(opts.md), { recursive: true });
      await writeFile(opts.md, md, 'utf8');
    }

    if (opts.json && !opts.dryRun) {
      const json = renderAuditJson(report);
      await mkdir(dirname(opts.json), { recursive: true });
      await writeFile(opts.json, json, 'utf8');
    }

    process.stdout.write(
      `audit: ${report.summary.totalFindings} finding(s) across ${report.summary.reposScanned} repo(s)\n`,
    );
  });

await program.parseAsync(process.argv);

function isFsNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'ENOENT'
  );
}

/**
 * Drop findings whose severity rank is below the threshold and re-aggregate
 * `summary.bySeverity`/`summary.byCategory` so the rendered + serialized
 * outputs agree. An empty threshold returns the report unchanged.
 */
function filterReportBySeverity(report: AuditReport, threshold: Severity | ''): AuditReport {
  if (threshold === '') return report;
  const floor = SEVERITY_RANK[threshold];
  const findings = report.findings.filter((f: AuditFinding) => SEVERITY_RANK[f.severity] >= floor);

  const bySeverity: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  const byCategory: Record<Category, number> = {
    stale: 0,
    license: 0,
    docs: 0,
    tests: 0,
    'pr-rot': 0,
    'bug-debt': 0,
    archived: 0,
    'archive-suggestion': 0,
  };
  const reposWithFindings = new Set<string>();
  let bugDebtScore = 0;
  for (const f of findings) {
    bySeverity[f.severity] += 1;
    byCategory[f.category] += 1;
    if (f.repo) reposWithFindings.add(`${f.repo.owner}/${f.repo.name}`);
    if (f.category === 'bug-debt') {
      const raw = f.metadata.debtScore;
      if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
        bugDebtScore += raw;
      }
    }
  }

  return {
    ...report,
    findings,
    summary: {
      ...report.summary,
      totalFindings: findings.length,
      bySeverity,
      byCategory,
      bugDebtScore,
      reposWithFindings: reposWithFindings.size,
    },
  };
}

function printExplain(report: AuditReport): void {
  const sev = report.summary.bySeverity;
  console.error(
    `audit: ${report.summary.totalFindings} finding(s) — ` +
      `critical=${sev.critical ?? 0} high=${sev.high ?? 0} ` +
      `medium=${sev.medium ?? 0} low=${sev.low ?? 0} info=${sev.info ?? 0}`,
  );
  console.error(
    `scanned ${report.summary.reposScanned} repo(s); ${report.summary.reposWithFindings} with findings`,
  );
  const topCategories = Object.entries(report.summary.byCategory)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([cat, count]) => `${cat}=${count}`)
    .join(' ');
  console.error(`top categories: ${topCategories || '(none)'}`);
  const top = report.findings.slice(0, 5);
  for (const f of top) {
    const repo = f.repo ? `${f.repo.owner}/${f.repo.name}` : '-';
    console.error(`  [${f.severity}] ${f.category} ${repo}: ${f.title}`);
  }
}
