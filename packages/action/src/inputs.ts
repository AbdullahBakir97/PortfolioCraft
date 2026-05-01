import * as core from '@actions/core';
import { ActionInputs } from '@portfoliocraft/core';

export function readInputs(): ActionInputs {
  const raw = {
    token: core.getInput('token', { required: true }),
    user: core.getInput('user'),
    sections: core.getInput('sections') || 'header,stack,projects,activity',
    locale: (core.getInput('locale') || 'en') as 'en' | 'ar',
    outputReadme: core.getInput('output-readme'),
    outputJson: core.getInput('output-json'),
    outputPdf: core.getInput('output-pdf'),
    outputSvgDir: core.getInput('output-svg-dir'),
    configFile: core.getInput('config-file') || '.portfoliocraft.yml',
    commit: core.getBooleanInput('commit'),
    commitMessage: core.getInput('commit-message') || 'chore: refresh portfolio',
    dryRun: core.getBooleanInput('dry-run'),
    explain: core.getBooleanInput('explain'),
    mode: core.getInput('mode') || 'portfolio',
    auditOutputMd: core.getInput('audit-output-md') || 'audit.md',
    auditOutputJson: core.getInput('audit-output-json') || 'audit.json',
    auditFailOn: core.getInput('audit-fail-on') || '',
    // v0.4 audit-check-run: default true when the input is omitted entirely.
    // `core.getBooleanInput` throws on empty input, so guard with try/catch.
    auditCheckRun: readBooleanWithDefault('audit-check-run', true),
    // v0.4 summary-mode inputs. Empty string falls through to the schema
    // default, so a workflow that doesn't set `mode: summary | all` is
    // unaffected even if it never sets these.
    summaryFormat: core.getInput('summary-format') || 'all',
    summaryOutputCv: core.getInput('summary-output-cv') || 'summary-cv.md',
    summaryOutputUni: core.getInput('summary-output-uni') || 'summary-uni.md',
    summaryOutputCaseStudies:
      core.getInput('summary-output-case-studies') || 'summary-case-studies.md',
    summaryProjectsMax: Number(core.getInput('summary-projects-max') || '6'),
  };

  return ActionInputs.parse(raw);
}

/**
 * Wrapper around `core.getBooleanInput` that returns `fallback` when the input
 * is absent or empty. `core.getBooleanInput` throws TypeError for empty input
 * and only accepts the YAML 1.2 truthy/falsy literals — keep that strict
 * parsing for explicit values, fall back to `fallback` otherwise.
 */
function readBooleanWithDefault(name: string, fallback: boolean): boolean {
  const raw = core.getInput(name);
  if (raw === '') return fallback;
  try {
    return core.getBooleanInput(name);
  } catch {
    return fallback;
  }
}
