import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import * as core from '@actions/core';
import { exec, getExecOutput } from '@actions/exec';
import { context, getOctokit } from '@actions/github';
import {
  type ActionInputs,
  type AuditFinding,
  type AuditReport,
  buildCvSummary,
  buildReport,
  buildUniSummary,
  createGitHubClient,
  createLogger,
  ingestAuditExtras,
  ingestSnapshot,
  loadConfigFile,
  memoryCache,
  mergeConfigWithInputs,
  type PortfolioReport,
  runAudit,
  SEVERITY_RANK,
  type Severity,
} from '@portfoliocraft/core';
import {
  applyAuditMarkers,
  applyCaseStudiesMarkers,
  applyCvMarkers,
  applyMarkers,
  applyUniMarkers,
  renderAuditJson,
  renderAuditMarkdown,
  renderCaseStudiesMarkdown,
  renderCvMarkdown,
  renderJsonResume,
  renderMarkdown,
  renderPdf,
  renderUniMarkdown,
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
  /** v0.4 summary outputs. Empty string when the summary phase didn't run
   * or when the format gate excluded that artifact. */
  summaryCvPath: string;
  summaryUniPath: string;
  summaryCaseStudiesPath: string;
  /** Commit SHA pushed back to the repo, or '' when nothing was committed. */
  commitSha: string;
  /**
   * Why the commit step was skipped: '' when the commit happened, otherwise
   * one of: 'commit-disabled' | 'dry-run' | 'fork-pr' | 'no-changes' | 'no-paths'.
   */
  commitSkippedReason: string;
}

/** Dependencies a caller can inject to make the commit step testable. */
export interface RunDeps {
  exec?: typeof exec;
  getExecOutput?: typeof getExecOutput;
}

export async function run(inputs: ActionInputs, deps: RunDeps = {}): Promise<RunResult> {
  const execFn = deps.exec ?? exec;
  const getExecOutputFn = deps.getExecOutput ?? getExecOutput;
  const logger = createLogger({ level: inputs.explain ? 'debug' : 'info' });
  const client = createGitHubClient({ token: inputs.token });
  const cache = memoryCache();

  // Track every artifact path actually written so the optional commit step
  // stages exactly what it needs to and nothing else. Empty when dry-run or
  // when an output is skipped via empty-string input.
  const writtenPaths: string[] = [];

  const fileConfig = await loadConfigFile(inputs.configFile);
  const config = mergeConfigWithInputs(fileConfig, {
    sections: inputs.sections,
    locale: inputs.locale,
  });

  const userLogin = inputs.user || (await resolveTokenOwner(client));
  core.info(`Profiling github user: ${userLogin}`);

  const snapshot = await ingestSnapshot({ client, user: userLogin, cache, logger });

  // Branch on mode. 'portfolio' (default) preserves v0.1 behaviour exactly;
  // 'audit' skips the portfolio outputs; 'both' runs portfolio + audit (v0.2);
  // 'summary' runs only the v0.4 application-summary phase; 'all' runs every
  // phase. Both `'both'` and the new `'all'` keep the v0.2/v0.3 audit semantics
  // unchanged — `'all'` is strictly additive.
  const runPortfolio =
    inputs.mode === 'portfolio' || inputs.mode === 'both' || inputs.mode === 'all';
  const runAuditPhase = inputs.mode === 'audit' || inputs.mode === 'both' || inputs.mode === 'all';
  const runSummaryPhase = inputs.mode === 'summary' || inputs.mode === 'all';

  // Hoist the portfolio report so the summary phase can reuse it without
  // re-running buildReport. `report` is assigned the first time either phase
  // needs it, then read by the second phase. When neither phase needs it
  // (mode === 'audit'), it stays undefined and buildReport never runs.
  let report: PortfolioReport | undefined;
  if (runPortfolio || runSummaryPhase) {
    report = buildReport({ config, snapshot });
  }

  let readmeUpdated = false;
  let portfolioSummary = '';

  if (runPortfolio && report) {
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
      if (readmeUpdated) writtenPaths.push(inputs.outputReadme);
    }

    if (inputs.outputJson) {
      const resume = renderJsonResume(report);
      if (!inputs.dryRun) {
        await writeFileEnsured(inputs.outputJson, JSON.stringify(resume, null, 2));
        writtenPaths.push(inputs.outputJson);
      }
    }

    if (inputs.outputPdf && !inputs.dryRun) {
      try {
        const buffer = await renderPdf({ report });
        await writeFileEnsured(inputs.outputPdf, buffer);
        writtenPaths.push(inputs.outputPdf);
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
          if (!writtenPaths.includes(inputs.auditOutputMd)) {
            writtenPaths.push(inputs.auditOutputMd);
          }
        }
      } else if (!inputs.dryRun) {
        await writeFileEnsured(inputs.auditOutputMd, md);
        writtenPaths.push(inputs.auditOutputMd);
      }
      auditMdPath = inputs.auditOutputMd;
    }

    if (inputs.auditOutputJson) {
      const json = renderAuditJson(report);
      if (!inputs.dryRun) {
        await writeFileEnsured(inputs.auditOutputJson, json);
        writtenPaths.push(inputs.auditOutputJson);
      }
      auditJsonPath = inputs.auditOutputJson;
    }

    auditFailOnResult = evaluateFailOn(report, inputs.auditFailOn);

    // v0.4 audit-check-run: post a GitHub Checks API summary so the run shows
    // up on the commit/PR's Checks tab. Best-effort — `core.warning` and
    // continue when the token lacks `checks: write`.
    if (inputs.auditCheckRun && !inputs.dryRun) {
      await postAuditCheckRun({
        token: inputs.token,
        findings: report.findings,
        summary: report.summary,
        failOnResult: auditFailOnResult,
      });
    }
  }

  // v0.4 summary phase: render CV / Uni / case-studies Markdown from the
  // already-built `report` (hoisted above so we never re-fetch). Each format
  // is gated by `summaryFormat` and writes either standalone or spliced
  // between markers when its target path equals `outputReadme`.
  let summaryCvPath = '';
  let summaryUniPath = '';
  let summaryCaseStudiesPath = '';

  if (runSummaryPhase && report) {
    const buildOpts = { projectsMax: inputs.summaryProjectsMax };
    const renderCv = inputs.summaryFormat === 'cv' || inputs.summaryFormat === 'all';
    const renderUni = inputs.summaryFormat === 'uni' || inputs.summaryFormat === 'all';
    const renderCases = inputs.summaryFormat === 'case-studies' || inputs.summaryFormat === 'all';

    if (renderCv && inputs.summaryOutputCv) {
      const cv = buildCvSummary(report, buildOpts);
      const md = renderCvMarkdown(cv);
      await writeOrSpliceSummary({
        target: inputs.summaryOutputCv,
        readme: inputs.outputReadme,
        generated: md,
        applyMarkersFn: applyCvMarkers,
        markerName: 'PORTFOLIOCRAFT-CV',
        dryRun: inputs.dryRun,
        writtenPaths,
      });
      summaryCvPath = inputs.summaryOutputCv;
    }

    if (renderUni && inputs.summaryOutputUni) {
      const uni = buildUniSummary(report, buildOpts);
      const md = renderUniMarkdown(uni);
      await writeOrSpliceSummary({
        target: inputs.summaryOutputUni,
        readme: inputs.outputReadme,
        generated: md,
        applyMarkersFn: applyUniMarkers,
        markerName: 'PORTFOLIOCRAFT-UNI',
        dryRun: inputs.dryRun,
        writtenPaths,
      });
      summaryUniPath = inputs.summaryOutputUni;
    }

    if (renderCases && inputs.summaryOutputCaseStudies) {
      // The CV summary's `selectedProjects` is the canonical
      // top-N-by-significance slice — exactly what the case-studies renderer
      // wants. Build it once, slice off `selectedProjects`, render.
      const cv = buildCvSummary(report, buildOpts);
      const md = renderCaseStudiesMarkdown(cv.selectedProjects);
      await writeOrSpliceSummary({
        target: inputs.summaryOutputCaseStudies,
        readme: inputs.outputReadme,
        generated: md,
        applyMarkersFn: applyCaseStudiesMarkers,
        markerName: 'PORTFOLIOCRAFT-CASE-STUDIES',
        dryRun: inputs.dryRun,
        writtenPaths,
      });
      summaryCaseStudiesPath = inputs.summaryOutputCaseStudies;
    }
  }

  // Optional commit step: stage written artifacts, commit + push when there
  // is a real diff. v0.1.0–v0.3.0 declared the `commit` input but never wired
  // it; this is the v0.3.1 fix.
  const { commitSha, commitSkippedReason } = await commitArtifacts({
    enabled: inputs.commit,
    dryRun: inputs.dryRun,
    paths: writtenPaths,
    message: inputs.commitMessage,
    exec: execFn,
    getExecOutput: getExecOutputFn,
  });

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

  // v0.4 summary outputs. Empty when the format gate excluded the artifact
  // or when summary phase didn't run at all.
  core.setOutput('summary-cv-path', summaryCvPath);
  core.setOutput('summary-uni-path', summaryUniPath);
  core.setOutput('summary-case-studies-path', summaryCaseStudiesPath);

  // v0.3.1 commit outputs.
  core.setOutput('commit-sha', commitSha);
  core.setOutput('commit-skipped-reason', commitSkippedReason);

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
    summaryCvPath,
    summaryUniPath,
    summaryCaseStudiesPath,
    commitSha,
    commitSkippedReason,
  };
}

/**
 * Stage the given paths, create a commit, and push to the source ref.
 *
 * Skips silently with a structured reason in any of the following cases:
 *   - `enabled: false` (the user opted out via `commit: false`)
 *   - `dryRun: true`
 *   - `paths.length === 0` (nothing to stage)
 *   - the PR was opened from a fork (push back is impossible)
 *   - `git diff --cached --quiet` reports no diff after staging
 *
 * Configures the commit identity to `github-actions[bot]`. Pushes to
 * `HEAD:${GITHUB_REF_NAME}` so the commit lands on the same branch that
 * triggered the run. Requires `permissions: contents: write` on the calling
 * workflow — documented in the README.
 */
export async function commitArtifacts(opts: {
  enabled: boolean;
  dryRun: boolean;
  paths: string[];
  message: string;
  exec: typeof exec;
  getExecOutput: typeof getExecOutput;
}): Promise<{ commitSha: string; commitSkippedReason: string }> {
  if (!opts.enabled) return { commitSha: '', commitSkippedReason: 'commit-disabled' };
  if (opts.dryRun) return { commitSha: '', commitSkippedReason: 'dry-run' };
  if (opts.paths.length === 0) return { commitSha: '', commitSkippedReason: 'no-paths' };

  // Detect fork PRs: the head repo's full_name differs from the base.
  // GITHUB_HEAD_REPOSITORY is set on pull_request events; if missing we're
  // on a push or workflow_dispatch where the push back is fine.
  const headRepo = process.env.GITHUB_HEAD_REPOSITORY ?? '';
  const baseRepo = process.env.GITHUB_REPOSITORY ?? `${context.repo.owner}/${context.repo.repo}`;
  if (headRepo && headRepo !== baseRepo) {
    core.warning(
      `Skipping commit: PR is from a fork (${headRepo}). The runner can't push back to the source repo.`,
    );
    return { commitSha: '', commitSkippedReason: 'fork-pr' };
  }

  // The branch we push to. On pull_request events GITHUB_REF_NAME is e.g.
  // `42/merge`, which is wrong; use GITHUB_HEAD_REF instead. On push /
  // workflow_dispatch / schedule, GITHUB_REF_NAME is the actual branch.
  const eventName = process.env.GITHUB_EVENT_NAME ?? '';
  const ref =
    eventName === 'pull_request' || eventName === 'pull_request_target'
      ? process.env.GITHUB_HEAD_REF
      : process.env.GITHUB_REF_NAME;
  if (!ref) {
    core.warning('Skipping commit: could not determine target branch (no GITHUB_REF_NAME).');
    return { commitSha: '', commitSkippedReason: 'no-paths' };
  }

  await opts.exec('git', ['config', 'user.name', 'github-actions[bot]']);
  await opts.exec('git', [
    'config',
    'user.email',
    '41898282+github-actions[bot]@users.noreply.github.com',
  ]);
  await opts.exec('git', ['add', '--', ...opts.paths]);

  const diffResult = await opts.getExecOutput('git', ['diff', '--cached', '--quiet'], {
    ignoreReturnCode: true,
  });
  if (diffResult.exitCode === 0) {
    return { commitSha: '', commitSkippedReason: 'no-changes' };
  }

  await opts.exec('git', ['commit', '-m', opts.message]);

  const shaResult = await opts.getExecOutput('git', ['rev-parse', 'HEAD']);
  const commitSha = shaResult.stdout.trim();

  await opts.exec('git', ['push', 'origin', `HEAD:${ref}`]);

  return { commitSha, commitSkippedReason: '' };
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
 * Shared write/splice helper for the v0.4 summary phase. Mirrors the
 * audit-Markdown branch in the audit phase: when the configured target path
 * matches `outputReadme`, splice the generated block between the relevant
 * marker pair using the supplied `applyMarkersFn`; otherwise write the file
 * standalone. In every successful write the path is appended to
 * `writtenPaths` (deduped), so the existing commit step picks it up.
 */
async function writeOrSpliceSummary(opts: {
  target: string;
  readme: string;
  generated: string;
  applyMarkersFn: (
    existing: string,
    generated: string,
  ) => { content: string; changed: boolean; hasMarkers: boolean };
  markerName: string;
  dryRun: boolean;
  writtenPaths: string[];
}): Promise<void> {
  if (opts.target === opts.readme) {
    let existing = '';
    try {
      existing = await readFile(opts.target, 'utf8');
    } catch {
      existing = '';
    }
    const result = opts.applyMarkersFn(existing, opts.generated);
    if (!result.hasMarkers) {
      core.warning(`No ${opts.markerName} markers found in ${opts.target}; nothing to update.`);
      return;
    }
    if (result.changed && !opts.dryRun) {
      await writeFile(opts.target, result.content, 'utf8');
      if (!opts.writtenPaths.includes(opts.target)) {
        opts.writtenPaths.push(opts.target);
      }
    }
    return;
  }

  if (opts.dryRun) return;
  await writeFileEnsured(opts.target, opts.generated);
  if (!opts.writtenPaths.includes(opts.target)) {
    opts.writtenPaths.push(opts.target);
  }
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

/**
 * Post a GitHub Checks API summary for the audit run. Best-effort: never
 * fails the workflow — most users won't have `permissions: checks: write`
 * configured initially, so a 403 here just downgrades to a `core.warning`.
 *
 * The run target is `GITHUB_SHA`, which is the merge commit on
 * `pull_request` and the head commit on `push`/`workflow_dispatch`.
 */
async function postAuditCheckRun(opts: {
  token: string;
  findings: AuditFinding[];
  summary: AuditReport['summary'];
  failOnResult: 'pass' | 'fail' | 'not-evaluated';
}): Promise<void> {
  const repoEnv = process.env.GITHUB_REPOSITORY;
  if (!repoEnv) {
    core.warning('Skipping audit Check Run: GITHUB_REPOSITORY not set.');
    return;
  }
  const [owner, repo] = repoEnv.split('/');
  if (!owner || !repo) return;

  const headSha = process.env.GITHUB_SHA;
  if (!headSha) {
    core.warning('Skipping audit Check Run: GITHUB_SHA not set.');
    return;
  }

  // Map fail-on result -> check conclusion. 'not-evaluated' = neutral so
  // green/red status matches user expectations for an explicit threshold.
  const conclusion: 'success' | 'neutral' | 'failure' =
    opts.failOnResult === 'fail' ? 'failure' : opts.failOnResult === 'pass' ? 'success' : 'neutral';

  const summaryMd = renderCheckSummary(opts.findings, opts.summary, opts.failOnResult);

  try {
    const octokit = getOctokit(opts.token);
    await octokit.rest.checks.create({
      owner,
      repo,
      head_sha: headSha,
      name: 'PortfolioCraft Audit',
      status: 'completed',
      conclusion,
      output: {
        title: `${opts.findings.length} finding(s) - ${conclusion}`,
        summary: summaryMd,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    core.warning(
      `Could not post audit Check Run: ${msg}. Add 'permissions: checks: write' to enable.`,
    );
  }
}

/**
 * Render the Check Run summary body — totals table + top 10 findings inline
 * so the GitHub-rendered Check Run page is self-contained without needing
 * the audit.md artifact.
 */
export function renderCheckSummary(
  findings: AuditFinding[],
  summary: AuditReport['summary'],
  failOnResult: string,
): string {
  const lines = [
    `**Total findings:** ${summary.totalFindings}`,
    ``,
    `| Severity | Count |`,
    `| --- | --- |`,
    `| critical | ${summary.bySeverity.critical ?? 0} |`,
    `| high | ${summary.bySeverity.high ?? 0} |`,
    `| medium | ${summary.bySeverity.medium ?? 0} |`,
    `| low | ${summary.bySeverity.low ?? 0} |`,
    `| info | ${summary.bySeverity.info ?? 0} |`,
    ``,
    `**Fail-on result:** ${failOnResult}`,
    ``,
  ];
  const top = findings.slice(0, 10);
  if (top.length > 0) {
    lines.push(`### Top findings`);
    lines.push(``);
    for (const f of top) {
      const repoLabel = f.repo ? `${f.repo.owner}/${f.repo.name}` : '(user-level)';
      lines.push(`- **[${f.severity}]** \`${f.category}\` - ${f.title} (${repoLabel})`);
    }
  }
  return lines.join('\n');
}
