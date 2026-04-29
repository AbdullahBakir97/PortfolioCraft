import { describe, expect, it } from 'vitest';
import { END_MARKER, START_MARKER, applyMarkers } from '../src/markers.js';

describe('applyMarkers', () => {
  it('replaces only the marker block', () => {
    const before = `# Hi\n\n${START_MARKER}\nold\n${END_MARKER}\n\nfooter`;
    const result = applyMarkers(before, 'NEW');
    expect(result.changed).toBe(true);
    expect(result.hasMarkers).toBe(true);
    expect(result.content).toBe(`# Hi\n\n${START_MARKER}\nNEW\n${END_MARKER}\n\nfooter`);
  });

  it('returns unchanged with hasMarkers=false when markers are missing', () => {
    const before = '# Hi\n\nNo markers here';
    const result = applyMarkers(before, 'NEW');
    expect(result.changed).toBe(false);
    expect(result.hasMarkers).toBe(false);
    expect(result.content).toBe(before);
  });

  it('is idempotent on repeated runs with the same content', () => {
    const before = `# Hi\n\n${START_MARKER}\n${END_MARKER}\n`;
    const a = applyMarkers(before, 'X');
    const b = applyMarkers(a.content, 'X');
    expect(b.changed).toBe(false);
    expect(b.content).toBe(a.content);
  });
});
