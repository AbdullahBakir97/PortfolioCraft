import { describe, expect, it } from 'vitest';

describe('portfoliocraft CLI smoke', () => {
  it('imports core + renderers without runtime errors', async () => {
    const core = await import('@portfoliocraft/core');
    const renderers = await import('@portfoliocraft/renderers');
    expect(typeof core.buildReport).toBe('function');
    expect(typeof renderers.applyMarkers).toBe('function');
  });
});
