import { describe, expect, it } from 'vitest';
import { applyFilters, keptRepos } from '../src/filters.js';
import { repo } from './fixtures.js';

const RULES = {
  exclude_archived: true,
  exclude_forks: true,
  exclude_topics: ['tutorial', 'exercise', 'homework'],
  min_stars: 0,
};

describe('filters', () => {
  it('drops archived repositories with reason', () => {
    const r = repo({ isArchived: true });
    const [d] = applyFilters([r], RULES);
    expect(d?.kept).toBe(false);
    expect(d?.reasons).toContain('archived');
  });

  it('drops forks with reason', () => {
    const r = repo({ isFork: true });
    const [d] = applyFilters([r], RULES);
    expect(d?.kept).toBe(false);
    expect(d?.reasons).toContain('fork');
  });

  it('drops repos whose name contains tutorial-shaped hints', () => {
    const r = repo({ name: 'react-tutorial' });
    const [d] = applyFilters([r], RULES);
    expect(d?.kept).toBe(false);
    expect(d?.reasons).toContain('tutorial-shaped-name');
  });

  it('respects min_stars threshold', () => {
    const r = repo({ stargazerCount: 1 });
    const [d] = applyFilters([r], { ...RULES, min_stars: 10 });
    expect(d?.kept).toBe(false);
    expect(d?.reasons).toContain('stars<10');
  });

  it('excludes by topic', () => {
    const r = repo({ topics: ['Tutorial'] });
    const [d] = applyFilters([r], RULES);
    expect(d?.kept).toBe(false);
    expect(d?.reasons).toContain('topic:tutorial');
  });

  it('keptRepos returns only the kept', () => {
    const decisions = applyFilters(
      [repo({ name: 'keep' }), repo({ name: 'drop', isArchived: true })],
      RULES,
    );
    const kept = keptRepos(decisions);
    expect(kept.map((r) => r.name)).toEqual(['keep']);
  });
});
