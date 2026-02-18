'use strict';

const { formatWeatherForSpeech } = require('../src/weather');

describe('formatWeatherForSpeech()', () => {
  // ─────────────────────────────────────────────
  // Error / unavailable weather
  // ─────────────────────────────────────────────

  test('returns unavailability message when weather.error is true', () => {
    const result = formatWeatherForSpeech({ error: true });
    expect(result).toBe('Weather data unavailable today');
  });

  // ─────────────────────────────────────────────
  // Normal weather — base output structure
  // ─────────────────────────────────────────────

  test('includes current temperature', () => {
    const result = formatWeatherForSpeech({
      temperature: '72',
      condition: 'Sunny',
      high: '80',
      low: '60',
      chanceOfRain: '10',
    });
    expect(result).toContain("It's currently 72 degrees");
  });

  test('includes condition in lowercase', () => {
    const result = formatWeatherForSpeech({
      temperature: '72',
      condition: 'Partly Cloudy',
      high: '80',
      low: '60',
      chanceOfRain: '0',
    });
    expect(result).toContain('and partly cloudy');
  });

  test('includes high and low temperatures', () => {
    const result = formatWeatherForSpeech({
      temperature: '72',
      condition: 'Clear',
      high: '85',
      low: '55',
      chanceOfRain: '0',
    });
    expect(result).toContain("Today's high will be 85 with a low of 55");
  });

  test('includes "in Austin" location reference', () => {
    const result = formatWeatherForSpeech({
      temperature: '72',
      condition: 'Sunny',
      high: '80',
      low: '60',
      chanceOfRain: '0',
    });
    expect(result).toContain('in Austin');
  });

  // ─────────────────────────────────────────────
  // Rain chance thresholds
  // ─────────────────────────────────────────────

  test('omits rain mention when chance is below threshold (10%)', () => {
    const result = formatWeatherForSpeech({
      temperature: '72',
      condition: 'Sunny',
      high: '80',
      low: '60',
      chanceOfRain: '10',
    });
    expect(result).not.toContain('percent chance of rain');
  });

  test('omits rain mention at exactly 30% (boundary — not > 30)', () => {
    const result = formatWeatherForSpeech({
      temperature: '72',
      condition: 'Cloudy',
      high: '75',
      low: '60',
      chanceOfRain: '30',
    });
    expect(result).not.toContain('percent chance of rain');
  });

  test('includes rain mention at 31% (just above boundary)', () => {
    const result = formatWeatherForSpeech({
      temperature: '68',
      condition: 'Overcast',
      high: '74',
      low: '58',
      chanceOfRain: '31',
    });
    expect(result).toContain('31 percent chance of rain');
  });

  test('includes rain mention when chance is high (80%)', () => {
    const result = formatWeatherForSpeech({
      temperature: '65',
      condition: 'Rainy',
      high: '70',
      low: '58',
      chanceOfRain: '80',
    });
    expect(result).toContain('80 percent chance of rain');
  });

  // ─────────────────────────────────────────────
  // Condition edge cases
  // ─────────────────────────────────────────────

  test('omits condition phrase when condition is "unknown"', () => {
    const result = formatWeatherForSpeech({
      temperature: '70',
      condition: 'unknown',
      high: '78',
      low: '62',
      chanceOfRain: '0',
    });
    expect(result).not.toContain('and unknown');
  });

  test('omits condition phrase regardless of case when condition is "Unknown"', () => {
    const result = formatWeatherForSpeech({
      temperature: '70',
      condition: 'Unknown',
      high: '78',
      low: '62',
      chanceOfRain: '0',
    });
    expect(result).not.toContain('and');
  });
});
