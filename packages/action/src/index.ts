import * as core from '@actions/core';
import { readInputs } from './inputs.js';
import { run } from './run.js';

async function main(): Promise<void> {
  try {
    const inputs = readInputs();
    const result = await run(inputs);
    core.info(result.summary);
  } catch (err) {
    if (err instanceof Error) {
      core.setFailed(err.message);
      if (err.stack) core.debug(err.stack);
    } else {
      core.setFailed('PortfolioCraft failed with an unknown error');
    }
  }
}

void main();
