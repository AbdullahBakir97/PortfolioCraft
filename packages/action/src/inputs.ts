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
  };

  return ActionInputs.parse(raw);
}
