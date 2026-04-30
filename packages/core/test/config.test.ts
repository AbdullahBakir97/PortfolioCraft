import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfigFile, mergeConfigWithInputs } from '../src/config.js';

describe('config', () => {
  it('returns defaults when file does not exist', async () => {
    const cfg = await loadConfigFile('/no/such/path/.portfoliocraft.yml');
    expect(cfg.locale).toBe('en');
  });

  it('parses a YAML config and validates it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dp-cfg-'));
    const path = join(dir, '.portfoliocraft.yml');
    writeFileSync(
      path,
      `sections: [header, projects]
locale: ar
filters:
  exclude_archived: false
  exclude_forks: true
  exclude_topics: [demo]
  min_stars: 5
projects:
  pinned_first: false
  max: 3
weights:
  loc: 0.4
  recency: 0.4
  maturity: 0.2
`,
      'utf8',
    );
    const cfg = await loadConfigFile(path);
    expect(cfg.locale).toBe('ar');
    expect(cfg.sections).toEqual(['header', 'projects']);
    expect(cfg.filters.min_stars).toBe(5);
    expect(cfg.projects.max).toBe(3);
  });

  it('merges inputs over file config', async () => {
    const file = await loadConfigFile(undefined);
    const merged = mergeConfigWithInputs(file, {
      sections: 'header,activity',
      locale: 'ar',
    });
    expect(merged.sections).toEqual(['header', 'activity']);
    expect(merged.locale).toBe('ar');
  });
});
