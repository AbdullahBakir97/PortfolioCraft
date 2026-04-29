import { describe, expect, it } from 'vitest';
import { classifyRepository } from '../src/classification.js';
import { repo } from './fixtures.js';

describe('classification', () => {
  it('classifies a TypeScript+CSS+react repo as frontend', () => {
    const r = repo({
      primaryLanguage: 'TypeScript',
      languages: [
        { name: 'TypeScript', bytes: 80_000 },
        { name: 'CSS', bytes: 30_000 },
      ],
      topics: ['react', 'tailwind'],
    });
    expect(classifyRepository(r).domain).toBe('frontend');
  });

  it('classifies a Go+kubernetes repo as devops', () => {
    const r = repo({
      primaryLanguage: 'Go',
      languages: [{ name: 'Go', bytes: 200_000 }],
      topics: ['kubernetes', 'helm'],
    });
    expect(classifyRepository(r).domain).toBe('devops');
  });

  it('classifies a Python+pytorch repo as ml', () => {
    const r = repo({
      primaryLanguage: 'Python',
      languages: [{ name: 'Python', bytes: 150_000 }],
      topics: ['pytorch', 'machine-learning'],
    });
    expect(classifyRepository(r).domain).toBe('ml');
  });

  it('classifies a Swift repo as mobile', () => {
    const r = repo({
      primaryLanguage: 'Swift',
      languages: [{ name: 'Swift', bytes: 50_000 }],
      topics: ['ios'],
    });
    expect(classifyRepository(r).domain).toBe('mobile');
  });

  it('returns unknown when no signal is strong enough', () => {
    const r = repo({
      primaryLanguage: null,
      languages: [],
      topics: [],
    });
    expect(classifyRepository(r).domain).toBe('unknown');
  });
});
