import { describe, expect, it } from 'vitest';

describe('@portfoliocraft/action smoke', () => {
  it('resolves the action entrypoint module without crashing', async () => {
    // Importing the module evaluates only top-level bindings; the run() call
    // is gated behind main() which only executes when GITHUB_ACTIONS env vars
    // are present and inputs are set. This is a simple ESM-graph guard.
    const mod = await import('../src/inputs.js');
    expect(typeof mod.readInputs).toBe('function');
  });
});
