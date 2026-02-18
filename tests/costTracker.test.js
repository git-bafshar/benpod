'use strict';

const { CostTracker, RATES } = require('../src/costTracker');

// ─────────────────────────────────────────────
// Initial state
// ─────────────────────────────────────────────

describe('CostTracker — initial state', () => {
  test('all costs start at zero', () => {
    const tracker = new CostTracker();
    expect(tracker.costs.claude).toBe(0);
    expect(tracker.costs.tts).toBe(0);
    expect(tracker.costs.twitter).toBe(0);
    expect(tracker.costs.total).toBe(0);
  });

  test('all usage counters start at zero', () => {
    const tracker = new CostTracker();
    expect(tracker.usage.claudeInputTokens).toBe(0);
    expect(tracker.usage.claudeOutputTokens).toBe(0);
    expect(tracker.usage.ttsCharacters).toBe(0);
    expect(tracker.usage.twitterCalls).toBe(0);
  });
});

// ─────────────────────────────────────────────
// trackClaude
// ─────────────────────────────────────────────

describe('CostTracker.trackClaude()', () => {
  test('calculates input cost at $3 per million tokens', () => {
    const tracker = new CostTracker();
    const result = tracker.trackClaude(1_000_000, 0);
    expect(result.inputCost).toBeCloseTo(3.00);
  });

  test('calculates output cost at $15 per million tokens', () => {
    const tracker = new CostTracker();
    const result = tracker.trackClaude(0, 1_000_000);
    expect(result.outputCost).toBeCloseTo(15.00);
  });

  test('totalCost equals inputCost + outputCost', () => {
    const tracker = new CostTracker();
    const result = tracker.trackClaude(500_000, 200_000);
    expect(result.totalCost).toBeCloseTo(result.inputCost + result.outputCost);
  });

  test('realistic token counts produce expected cost', () => {
    const tracker = new CostTracker();
    // 10,000 input + 2,000 output
    const result = tracker.trackClaude(10_000, 2_000);
    const expectedInput = 10_000 * RATES.claude.input;
    const expectedOutput = 2_000 * RATES.claude.output;
    expect(result.inputCost).toBeCloseTo(expectedInput);
    expect(result.outputCost).toBeCloseTo(expectedOutput);
    expect(result.totalCost).toBeCloseTo(expectedInput + expectedOutput);
  });

  test('updates costs.claude and costs.total', () => {
    const tracker = new CostTracker();
    const { totalCost } = tracker.trackClaude(10_000, 2_000);
    expect(tracker.costs.claude).toBeCloseTo(totalCost);
    expect(tracker.costs.total).toBeCloseTo(totalCost);
  });

  test('accumulates correctly across multiple calls', () => {
    const tracker = new CostTracker();
    const first = tracker.trackClaude(10_000, 2_000);
    const second = tracker.trackClaude(5_000, 1_000);
    expect(tracker.costs.claude).toBeCloseTo(first.totalCost + second.totalCost);
    expect(tracker.costs.total).toBeCloseTo(first.totalCost + second.totalCost);
    expect(tracker.usage.claudeInputTokens).toBe(15_000);
    expect(tracker.usage.claudeOutputTokens).toBe(3_000);
  });

  test('returns the token counts in the result', () => {
    const tracker = new CostTracker();
    const result = tracker.trackClaude(1234, 567);
    expect(result.inputTokens).toBe(1234);
    expect(result.outputTokens).toBe(567);
  });
});

// ─────────────────────────────────────────────
// trackTTS
// ─────────────────────────────────────────────

describe('CostTracker.trackTTS()', () => {
  test('uses wavenet rate by default', () => {
    const tracker = new CostTracker();
    const result = tracker.trackTTS(1_000_000);
    expect(result.cost).toBeCloseTo(16.00);
    expect(result.voiceType).toBe('wavenet');
  });

  test('uses wavenet rate when explicitly specified', () => {
    const tracker = new CostTracker();
    const result = tracker.trackTTS(1_000_000, 'wavenet');
    expect(result.cost).toBeCloseTo(RATES.tts.wavenet * 1_000_000);
  });

  test('uses standard rate when specified', () => {
    const tracker = new CostTracker();
    const result = tracker.trackTTS(1_000_000, 'standard');
    expect(result.cost).toBeCloseTo(4.00);
    expect(result.voiceType).toBe('standard');
  });

  test('wavenet costs 4x more than standard per character', () => {
    const tracker = new CostTracker();
    const wavenet = tracker.trackTTS(100_000, 'wavenet');

    const tracker2 = new CostTracker();
    const standard = tracker2.trackTTS(100_000, 'standard');

    expect(wavenet.cost).toBeCloseTo(standard.cost * 4);
  });

  test('updates costs.tts and costs.total', () => {
    const tracker = new CostTracker();
    const { cost } = tracker.trackTTS(500_000, 'wavenet');
    expect(tracker.costs.tts).toBeCloseTo(cost);
    expect(tracker.costs.total).toBeCloseTo(cost);
  });

  test('accumulates ttsCharacters across multiple calls', () => {
    const tracker = new CostTracker();
    tracker.trackTTS(1000, 'wavenet');
    tracker.trackTTS(2000, 'wavenet');
    expect(tracker.usage.ttsCharacters).toBe(3000);
  });
});

// ─────────────────────────────────────────────
// trackTwitter
// ─────────────────────────────────────────────

describe('CostTracker.trackTwitter()', () => {
  test('returns per-call rate and total cost', () => {
    const tracker = new CostTracker();
    const result = tracker.trackTwitter(5);
    expect(result.costPerCall).toBe(RATES.twitter.perCall);
    expect(result.totalCost).toBeCloseTo(5 * RATES.twitter.perCall);
  });

  test('records the number of calls', () => {
    const tracker = new CostTracker();
    const result = tracker.trackTwitter(7);
    expect(result.calls).toBe(7);
  });

  test('adds to costs.twitter and costs.total', () => {
    const tracker = new CostTracker();
    tracker.trackTwitter(10);
    const expected = 10 * RATES.twitter.perCall;
    expect(tracker.costs.twitter).toBeCloseTo(expected);
    expect(tracker.costs.total).toBeCloseTo(expected);
  });

  test('accumulates twitterCalls', () => {
    const tracker = new CostTracker();
    tracker.trackTwitter(3);
    tracker.trackTwitter(4);
    expect(tracker.usage.twitterCalls).toBe(7);
  });
});

// ─────────────────────────────────────────────
// costs.total accumulates across service types
// ─────────────────────────────────────────────

describe('CostTracker — combined cost accumulation', () => {
  test('costs.total is sum of Claude and TTS costs', () => {
    const tracker = new CostTracker();
    const { totalCost: claudeCost } = tracker.trackClaude(10_000, 2_000);
    const { cost: ttsCost } = tracker.trackTTS(500_000, 'wavenet');
    expect(tracker.costs.total).toBeCloseTo(claudeCost + ttsCost);
  });

  test('costs.total includes Twitter pay-per-use cost', () => {
    const tracker = new CostTracker();
    const { totalCost: claudeCost } = tracker.trackClaude(10_000, 2_000);
    const { totalCost: twitterCost } = tracker.trackTwitter(5);
    expect(tracker.costs.total).toBeCloseTo(claudeCost + twitterCost);
  });
});

// ─────────────────────────────────────────────
// getSummary
// ─────────────────────────────────────────────

describe('CostTracker.getSummary()', () => {
  test('returns costs and usage objects', () => {
    const tracker = new CostTracker();
    const summary = tracker.getSummary();
    expect(summary).toHaveProperty('costs');
    expect(summary).toHaveProperty('usage');
  });

  test('includes a timestamp ISO string', () => {
    const tracker = new CostTracker();
    const summary = tracker.getSummary();
    expect(summary).toHaveProperty('timestamp');
    expect(() => new Date(summary.timestamp)).not.toThrow();
    expect(new Date(summary.timestamp).toISOString()).toBe(summary.timestamp);
  });

  test('summary reflects accumulated costs', () => {
    const tracker = new CostTracker();
    tracker.trackClaude(10_000, 2_000);
    tracker.trackTTS(500_000, 'wavenet');
    const summary = tracker.getSummary();
    expect(summary.costs.total).toBeCloseTo(tracker.costs.total);
    expect(summary.usage.claudeInputTokens).toBe(10_000);
    expect(summary.usage.ttsCharacters).toBe(500_000);
  });
});
