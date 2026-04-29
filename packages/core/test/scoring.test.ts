import { describe, expect, it } from 'vitest';
import { maturityScore, normalizeLoc, recencyScore, scoreStack, tierFor } from '../src/scoring.js';
import { repo } from './fixtures.js';

const NOW = new Date('2026-04-29T00:00:00.000Z');

describe('scoring', () => {
  it('recencyScore decays with age (half-life 1 year)', () => {
    const fresh = recencyScore(NOW.toISOString(), NOW);
    const oneYear = recencyScore('2025-04-29T00:00:00.000Z', NOW);
    const twoYears = recencyScore('2024-04-29T00:00:00.000Z', NOW);
    expect(fresh).toBeCloseTo(1, 5);
    expect(oneYear).toBeCloseTo(0.5, 2);
    expect(twoYears).toBeCloseTo(0.25, 2);
  });

  it('maturityScore mixes age and stars', () => {
    const young = maturityScore(repo({ createdAt: NOW.toISOString(), stargazerCount: 0 }), NOW);
    const mature = maturityScore(
      repo({ createdAt: '2022-01-01T00:00:00.000Z', stargazerCount: 100 }),
      NOW,
    );
    expect(mature).toBeGreaterThan(young);
    expect(mature).toBeLessThanOrEqual(1);
  });

  it('normalizeLoc is monotonic and bounded', () => {
    expect(normalizeLoc(0)).toBe(0);
    expect(normalizeLoc(100)).toBeGreaterThan(0);
    expect(normalizeLoc(1_000_000)).toBeLessThanOrEqual(1);
    expect(normalizeLoc(10_000)).toBeLessThan(normalizeLoc(1_000_000));
  });

  it('tierFor maps scores to tiers', () => {
    expect(tierFor(0.9)).toBe('expert');
    expect(tierFor(0.6)).toBe('proficient');
    expect(tierFor(0.4)).toBe('familiar');
    expect(tierFor(0.1)).toBe('exposed');
  });

  it('scoreStack ranks more recent + larger languages higher', () => {
    const repos = [
      repo({
        name: 'old-py',
        primaryLanguage: 'Python',
        languages: [{ name: 'Python', bytes: 50_000 }],
        pushedAt: '2022-01-01T00:00:00.000Z',
        createdAt: '2020-01-01T00:00:00.000Z',
      }),
      repo({
        name: 'new-ts',
        primaryLanguage: 'TypeScript',
        languages: [{ name: 'TypeScript', bytes: 200_000 }],
        pushedAt: '2026-04-20T00:00:00.000Z',
        createdAt: '2024-04-01T00:00:00.000Z',
        stargazerCount: 50,
      }),
    ];
    const stack = scoreStack(repos, {
      now: NOW,
      weights: { loc: 0.5, recency: 0.3, maturity: 0.2 },
    });
    expect(stack[0]?.language).toBe('TypeScript');
  });
});
