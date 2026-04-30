import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import * as core from '@actions/core';
import { context } from '@actions/github';
import {
  type ActionInputs,
  type AuditReport,
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
  applyAuditMarkers,
  applyMarkers,
  renderAuditJson,
  renderAuditMarkdown,
  renderJsonResume,
  renderMarkdown,
  renderPdf,
} from '@portfoliocraft/renderers';

export interface RunResult {
  readmeUpdated: boolean;
  jsonPath: string;
  pdfPath: string;
  cardsDir: string;
  summary: string;
  auditMdPath: string;
  auditJsonPath: string;
  auditFindingCount: number;
  auditFailOnResult: 'pass' | 'fail' | 'not-evaluated';
}

export async function run(inputs: ActionInputs): Promise<RunResult> {
  const logger = createLogger({ level: inputs.explain ? 'debug' : 'info' });
  const client = createGitHubClient({ token: inputs.token });
  const cache = memoryCache();

  const fileConfig = await loadConfigFile(inputs.configFile);
  const config = mergeConfigWithInputs(fileConfig, {
    sections: inputs.sections,
    locale: inputs.locale,
  });

  const userLogin = inputs.user || (await resolveTokenOwner(client));
  core.info(`Profiling github user: ${userLogin}`);

  const snapshot = await ingestSnapshot({ client, user: userLogin, cache, logger });

  // Branch on mode. 'portfolio' (default) preserves v0.1 behavior exactly;
  // 'audit' skips the portfolio outputs; 'both' runs both phases sequentially.
  const runPortfolio = inputs.mode === 'portfolio' || inputs.mode === 'both';
  const runAuditPhase = inputs.mode === 'audit' || inputs.mode === 'both';

  let readmeUpdated = false;
  let portfolioSummary = '';

  if (runPortfolio) {
    const report = buildReport({ config, snapshot });
    portfolioSummary = report.summary;

    if (inputs.explain) {
      core.startGroup('explain');
      core.info(
        JSON.stringify({ summary: report.summary, top: report.stack.slice(0, 5) }, null, 2),
      );
      core.endGroup();
    }

    if (inputs.outputReadme) {
      readmeUpdated = await writeReadme(inputs.outputReadme, report, config, inputs.dryRun);
    }

    if (inputs.outputJson) {
      const resume = renderJsonResume(report);
      if (!inputs.dryRun)
        await writeFileEnsured(inputs.outputJson, JSON.stringify(resume, null, 2));
    }

    if (inputs.outputPdf && !inputs.dryRun) {
      try {
        const buffer = await renderPdf({ report });
        await writeFileEnsured(inputs.outputPdf, buffer);
      } catch (err) {
        // React-PDF needs its built-in AFM font metrics on disk; some bundled
        // environments (notably ncc-bundled actions on Linux runners) strip
        // them. Skip the artifact rather than failing the whole run — the
        // README/JSON Resume outputs are independently useful.
        const message = err instanceof Error ? err.message : String(err);
        core.warning(
          `Skipping PDF: ${message}. See https://github.com/AbdullahBakir97/PortfolioCraft/issues for font-bundling status.`,
        );
      }
    }

    if (inputs.outputSvgDir && !inputs.dryRun) {
      core.info('SVG card rendering requires fonts; skipping when none provided.');
    }
  }

  let auditMdPath = '';
  let auditJsonPath = '';
  let auditFindingCount = 0;
  let auditFailOnResult: 'pass' | 'fail' | 'not-evaluated' = 'not-evaluated';

  if (runAuditPhase) {
    const extras = await ingestAuditExtras({ client, user: userLogin, snapshot, cache, logger });
    const report: AuditReport = await runAudit({
      snapshot,
      extras,
      config: config.audit,
      user: userLogin,
    });

    auditFindingCount = report.findings.length;

    if (inputs.explain) {
      core.startGroup('audit-explain');
      core.info(
        JSON.stringify({ summary: report.summary, top: report.findings.slice(0, 5) }, null, 2),
      );
      core.endGroup();
    }

    if (inputs.auditOutputMd) {
      const md = renderAuditMarkdown(report);
      // The audit Markdown is a STANDALONE file unless its target path matches
      // the portfolio README, in which case we splice it between the AUDIT
      // markers (`<!-- PORTFOLIOCRAFT-AUDIT:START -->` / `:END`).
      if (inputs.auditOutputMd === inputs.outputReadme) {
        let existing = '';
        try {
          existing = await readFile(inputs.auditOutputMd, 'utf8');
        } catch {
          existing = '';
        }
        const result = applyAuditMarkers(existing, md);
        if (!result.hasMarkers) {
          core.warning(
            `No PORTFOLIOCRAFT-AUDIT markers found in ${inputs.auditOutputMd}; nothing to update.`,
          );
        } else if (result.changed && !inputs.dryRun) {
          await writeFile(inputs.auditOutputMd, result.content, 'utf8');
        }
      } else if (!inputs.dryRun) {
        await writeFileEnsured(inputs.auditOutputMd, md);
      }
      auditMdPath = inputs.auditOutputMd;
    }

    if (inputs.auditOutputJson) {
      const json = renderAuditJson(report);
      if (!inputs.dryRun) await writeFileEnsured(inputs.auditOutputJson, json);
      auditJsonPath = inputs.auditOutputJson;
    }

    auditFailOnResult = evaluateFailOn(report, inputs.auditFailOn);
  }

  // Portfolio outputs (always emitted to preserve the v0.1 contract; values
  // become empty strings / false when portfolio mode is skipped).
  core.setOutput('readme-updated', readmeUpdated);
  core.setOutput('json-path', runPortfolio ? inputs.outputJson : '');
  core.setOutput('pdf-path', runPortfolio ? inputs.outputPdf : '');
  core.setOutput('cards-dir', runPortfolio ? inputs.outputSvgDir : '');
  core.setOutput('summary', portfolioSummary);

  // v0.2 audit outputs.
  core.setOutput('audit-md-path', auditMdPath);
  core.setOutput('audit-json-path', auditJsonPath);
  core.setOutput('audit-finding-count', auditFindingCount);
  core.setOutput('audit-fail-on-result', auditFailOnResult);

  if (auditFailOnResult === 'fail') {
    const threshold = inputs.auditFailOn as Severity;
    core.setFailed(
      `audit-fail-on=${threshold}: ${auditFindingCount} finding(s) at or above threshold.`,
    );
  }

  return {
    readmeUpdated,
    jsonPath: runPortfolio ? inputs.outputJson : '',
    pdfPath: runPortfolio ? inputs.outputPdf : '',
    cardsDir: runPortfolio ? inputs.outputSvgDir : '',
    summary: portfolioSummary,
    auditMdPath,
    auditJsonPath,
    auditFindingCount,
    auditFailOnResult,
  };
}

async function resolveTokenOwner(client: ReturnType<typeof createGitHubClient>): Promise<string> {
  const ctxOwner = context.repo?.owner;
  if (ctxOwner) return ctxOwner;
  const { data } = await client.rest.users.getAuthenticated();
  return data.login;
}

async function writeReadme(
  path: string,
  report: Awaited<ReturnType<typeof buildReport>>,
  config: Awaited<ReturnType<typeof loadConfigFile>>,
  dryRun: boolean,
): Promise<boolean> {
  let existing = '';
  try {
    existing = await readFile(path, 'utf8');
  } catch {
    return false;
  }

  const generated = await renderMarkdown({
    report,
    sections: config.sections,
    locale: config.locale,
  });
  const result = applyMarkers(existing, generated);

  if (!result.hasMarkers) {
    core.warning(`No PORTFOLIOCRAFT markers found in ${path}; nothing to update.`);
    return false;
  }
  if (!result.changed) return false;
  if (!dryRun) await writeFile(path, result.content, 'utf8');
  return true;
}

async function writeFileEnsured(
  path: string,
  contents: string | Buffer | Uint8Array,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

/**
 * Compare the report's findings against the configured severity floor.
 * Severity rank: critical=4, high=3, medium=2, low=1, info=0.
 * An empty `failOn` means "never fail" (returns 'not-evaluated').
 */
function evaluateFailOn(
  report: AuditReport,
  failOn: Severity | '',
): 'pass' | 'fail' | 'not-evaluated' {
  if (failOn === '') return 'not-evaluated';
  const threshold = SEVERITY_RANK[failOn];
  for (const finding of report.findings) {
    if (SEVERITY_RANK[finding.severity] >= threshold) return 'fail';
  }
  return 'pass';
}
