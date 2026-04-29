import { describe, expect, it } from 'vitest';

describe('devportfolio CLI smoke', () => {
  it('imports core + renderers without runtime errors', async () => {
    const core = await import('@devportfolio/core');
    const renderers = await import('@devportfolio/renderers');
    expect(typeof core.buildReport).toBe('function');
    expect(typeof renderers.applyMarkers).toBe('function');
  });
});
