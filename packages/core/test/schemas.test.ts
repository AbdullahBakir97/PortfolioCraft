import { describe, expect, it } from 'vitest';
import { ActionInputs, PortfolioConfig, ScoreWeights } from '../src/schemas.js';

describe('schemas', () => {
  it('PortfolioConfig applies defaults from {}', () => {
    const cfg = PortfolioConfig.parse({});
    expect(cfg.locale).toBe('en');
    expect(cfg.sections).toEqual(['header', 'stack', 'projects', 'activity']);
    expect(cfg.weights.loc + cfg.weights.recency + cfg.weights.maturity).toBeCloseTo(1, 6);
    expect(cfg.filters.exclude_archived).toBe(true);
    expect(cfg.projects.max).toBe(6);
  });

  it('ScoreWeights rejects weights that do not sum to 1', () => {
    expect(() => ScoreWeights.parse({ loc: 0.5, recency: 0.5, maturity: 0.5 })).toThrow();
  });

  it('ActionInputs requires a token', () => {
    expect(() => ActionInputs.parse({ token: '' })).toThrow();
    const parsed = ActionInputs.parse({ token: 'gho_x' });
    expect(parsed.outputReadme).toBe('README.md');
    expect(parsed.dryRun).toBe(false);
  });
});
