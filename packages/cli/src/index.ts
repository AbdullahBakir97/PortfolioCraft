#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  buildReport,
  createGitHubClient,
  createLogger,
  ingestSnapshot,
  loadConfigFile,
  memoryCache,
  mergeConfigWithInputs,
} from '@devportfolio/core';
import { applyMarkers, renderJsonResume, renderMarkdown } from '@devportfolio/renderers';
import { Command } from 'commander';

const program = new Command();

program
  .name('devportfolio')
  .description('Generate a living portfolio from your GitHub activity')
  .version('0.1.0');

program
  .command('generate')
  .description('Generate portfolio artifacts for a GitHub user')
  .requiredOption('--user <login>', 'GitHub login to profile')
  .option('--token <token>', 'GitHub token (falls back to GITHUB_TOKEN env var)')
  .option('--config <path>', 'Path to .devportfolio.yml', '.devportfolio.yml')
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

await program.parseAsync(process.argv);

function isFsNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'ENOENT'
  );
}
