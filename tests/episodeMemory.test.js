'use strict';

const {
  addEpisodeToMemory,
  formatMemoryForPrompt,
} = require('../src/episodeMemory');

// ─────────────────────────────────────────────
// addEpisodeToMemory
// ─────────────────────────────────────────────

describe('addEpisodeToMemory()', () => {
  const makeRecord = (date) => ({
    date,
    summary: `Summary for ${date}`,
    keyTopics: ['Topic A', 'Topic B'],
  });

  test('prepends new record to front of array', () => {
    const memory = { episodes: [makeRecord('2026-02-19')] };
    const result = addEpisodeToMemory(memory, makeRecord('2026-02-20'));
    expect(result.episodes[0].date).toBe('2026-02-20');
    expect(result.episodes[1].date).toBe('2026-02-19');
  });

  test('handles empty episodes array (first run)', () => {
    const memory = { episodes: [] };
    const result = addEpisodeToMemory(memory, makeRecord('2026-02-20'));
    expect(result.episodes).toHaveLength(1);
    expect(result.episodes[0].date).toBe('2026-02-20');
  });

  test('trims to 14 entries when over limit', () => {
    const episodes = Array.from({ length: 14 }, (_, i) => makeRecord(`2026-01-${String(i + 1).padStart(2, '0')}`));
    const memory = { episodes };
    const result = addEpisodeToMemory(memory, makeRecord('2026-02-20'));
    expect(result.episodes).toHaveLength(14);
    expect(result.episodes[0].date).toBe('2026-02-20');
  });

  test('replaces existing record for same date (idempotent upsert)', () => {
    const old = { date: '2026-02-20', summary: 'Old summary', keyTopics: [] };
    const memory = { episodes: [old, makeRecord('2026-02-19')] };
    const updated = { date: '2026-02-20', summary: 'New summary', keyTopics: ['Topic X'] };
    const result = addEpisodeToMemory(memory, updated);
    expect(result.episodes).toHaveLength(2);
    expect(result.episodes[0].summary).toBe('New summary');
  });

  test('does not mutate the input object', () => {
    const memory = { episodes: [makeRecord('2026-02-19')] };
    const original = JSON.stringify(memory);
    addEpisodeToMemory(memory, makeRecord('2026-02-20'));
    expect(JSON.stringify(memory)).toBe(original);
  });
});

// ─────────────────────────────────────────────
// formatMemoryForPrompt
// ─────────────────────────────────────────────

describe('formatMemoryForPrompt()', () => {
  // Pin "today" so date-window tests are deterministic
  const FIXED_TODAY = new Date('2026-02-20T12:00:00Z');
  let originalDateNow;

  beforeEach(() => {
    originalDateNow = global.Date;
    // Override Date so new Date() returns FIXED_TODAY, but new Date(string) still parses
    global.Date = class extends Date {
      constructor(...args) {
        if (args.length === 0) {
          super(FIXED_TODAY);
        } else {
          super(...args);
        }
      }
    };
  });

  afterEach(() => {
    global.Date = originalDateNow;
  });

  test('returns empty string when episodes array is empty', () => {
    expect(formatMemoryForPrompt({ episodes: [] })).toBe('');
  });

  test('returns empty string when all episodes are outside the window', () => {
    const memory = {
      episodes: [{ date: '2026-02-01', summary: 'Old news', keyTopics: [] }],
    };
    expect(formatMemoryForPrompt(memory, 7)).toBe('');
  });

  test('includes episodes within the date window', () => {
    const memory = {
      episodes: [{ date: '2026-02-18', summary: 'Recent episode', keyTopics: ['AI news'] }],
    };
    const result = formatMemoryForPrompt(memory, 7);
    expect(result).toContain('2026-02-18');
    expect(result).toContain('Recent episode');
  });

  test('filters out episodes older than N days', () => {
    const memory = {
      episodes: [
        { date: '2026-02-19', summary: 'Yesterday', keyTopics: [] },
        { date: '2026-01-01', summary: 'Long ago', keyTopics: [] },
      ],
    };
    const result = formatMemoryForPrompt(memory, 7);
    expect(result).toContain('Yesterday');
    expect(result).not.toContain('Long ago');
  });

  test('formats topics when present', () => {
    const memory = {
      episodes: [{
        date: '2026-02-19',
        summary: 'Big day in AI',
        keyTopics: ['Databricks release', 'OpenAI update'],
      }],
    };
    const result = formatMemoryForPrompt(memory, 7);
    expect(result).toContain('[Topics: Databricks release, OpenAI update]');
  });

  test('handles episodes with empty keyTopics array gracefully', () => {
    const memory = {
      episodes: [{ date: '2026-02-19', summary: 'No topics extracted', keyTopics: [] }],
    };
    const result = formatMemoryForPrompt(memory, 7);
    expect(result).toContain('No topics extracted');
    expect(result).not.toContain('[Topics:');
  });

  test('respects the days parameter', () => {
    const memory = {
      episodes: [
        { date: '2026-02-19', summary: 'Yesterday', keyTopics: [] },
        { date: '2026-02-15', summary: 'Five days ago', keyTopics: [] },
      ],
    };
    // With days=3, only yesterday should appear
    const result = formatMemoryForPrompt(memory, 3);
    expect(result).toContain('Yesterday');
    expect(result).not.toContain('Five days ago');
  });

  test('each entry appears on its own line', () => {
    const memory = {
      episodes: [
        { date: '2026-02-19', summary: 'First', keyTopics: [] },
        { date: '2026-02-18', summary: 'Second', keyTopics: [] },
      ],
    };
    const result = formatMemoryForPrompt(memory, 7);
    const lines = result.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('2026-02-19');
    expect(lines[1]).toContain('2026-02-18');
  });
});
