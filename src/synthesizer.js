/**
 * Script Synthesizer
 *
 * Uses Claude API to generate a spoken-word audio script with Austin weather integration
 */

const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');

/**
 * Fetch current Austin, TX weather from Open-Meteo API (free, no key needed)
 */
async function fetchAustinWeather() {
  const url = 'https://api.open-meteo.com/v1/forecast'
    + '?latitude=30.2672&longitude=-97.7431'
    + '&current=temperature_2m,weathercode,windspeed_10m'
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max'
    + '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FChicago&forecast_days=1';

  const { data } = await axios.get(url);
  const c = data.current;
  const d = data.daily;

  // WMO weather code → human description
  const conditions = {
    0: 'clear skies', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
    45: 'foggy', 48: 'icy fog', 51: 'light drizzle', 61: 'light rain',
    63: 'moderate rain', 65: 'heavy rain', 71: 'light snow', 80: 'rain showers',
    95: 'thunderstorms',
  };
  const description = conditions[c.weathercode] ?? 'mixed conditions';

  return {
    current: Math.round(c.temperature_2m),
    high: Math.round(d.temperature_2m_max[0]),
    low: Math.round(d.temperature_2m_min[0]),
    precip: d.precipitation_probability_max[0],
    description,
    wind: Math.round(c.windspeed_10m),
  };
}

/**
 * Synthesize audio script from content bundle
 */
async function synthesizeScript(contentBundle) {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  });

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Chicago',
  });

  // Fetch Austin weather
  const weather = await fetchAustinWeather();
  const weatherSummary = `${weather.description}, currently ${weather.current}°F, `
    + `high of ${weather.high}°F, low of ${weather.low}°F, `
    + `${weather.precip}% chance of rain, winds at ${weather.wind} mph`;

  const prompt = `
You are the host of "The Data & AI Daily," a personal morning podcast for Tyler.
Today is ${today}. Tyler is based in Austin, Texas.

Austin weather right now: ${weatherSummary}

Below is the raw content gathered from Databricks sources (blog, newsroom, release notes, exec social posts)
and core AI/ML news sources (major tech outlets, foundation model lab blogs, startup/funding news).

YOUR TASK:
Produce a complete, ready-to-record podcast script for an 8–12 minute episode.

═══════════════════════════════════════════════
STRUCTURE (follow this exactly):
═══════════════════════════════════════════════

[COLD OPEN — 15–30 seconds]
- Greet Tyler by name.
- One sentence on what today's episode covers (the "headline of headlines").
- Weave in the Austin weather forecast naturally (not as a weather report — more like what a friend would say: "it's looking like a scorcher out there" or "grab a jacket this morning").

[THEME SEGMENTS — 3 to 6 segments, each ~1–2 minutes]
Cluster today's news into 3–6 named themes. Choose theme names that fit the actual news.
Good examples: "Databricks Product & Platform", "Lakehouse Ecosystem & Partners",
"LLM & Agent Breakthroughs", "Regulation & Policy", "Startup & Funding Moves",
"Open Source & Research". Discard low-signal or redundant items — not everything needs coverage.

For each theme segment:
- Open with a punchy 1-sentence framing of the theme.
- Explain what happened, why it matters, and who it impacts (call out data engineers,
  ML practitioners, founders, or infra teams specifically when relevant).
- Where relevant, connect Databricks-specific news to the broader AI landscape.
- Add light, confident commentary — you have opinions. Examples of the right tone:
  "This puts real pressure on Snowflake's AI roadmap."
  "Honestly, this is great news for early-stage teams with lean data stacks."
  "I think this is being undersold — here's why it matters."
- Use first-person ("I think", "what I find interesting here is", "we've been watching this").
- Address Tyler by name once or twice across the whole episode — not every segment.
- Transitions between segments should feel natural, not formulaic.

[WRAP-UP — 15–30 seconds]
- Quick recap sentence of the 1–2 biggest themes from today.
- Preview: what Tyler should keep an eye on over the coming days in Databricks and AI.
- Sign off warmly and personally.

═══════════════════════════════════════════════
STYLE RULES:
═══════════════════════════════════════════════
- Write for the ear, not the eye. Short sentences. Active voice. No bullet points, no URLs, no markdown in the script.
- Conversational and smart — like a well-informed colleague who's genuinely excited about this space.
- Do NOT pad with filler. If today is a slow news day, say so honestly and go deeper on fewer items.
- Target word count: 1,200–1,800 words (8–12 minutes at a natural speaking pace).
- Do NOT include stage directions, segment headers, or any bracketed labels in the output —
  just the raw spoken script from start to finish.

═══════════════════════════════════════════════
RAW CONTENT:
═══════════════════════════════════════════════
${JSON.stringify(contentBundle, null, 2)}

Return ONLY the spoken script. No labels, no headers, no stage directions, no markdown.
`;

  console.log('Synthesizing script with Claude Sonnet 4.6...');

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }],
    });

    const script = message.content[0].text;
    const wordCount = script.split(/\s+/).length;

    console.log(`  Generated script: ${wordCount} words`);
    return script;

  } catch (error) {
    console.error('Error synthesizing script:', error.message);
    throw error;
  }
}

module.exports = { synthesizeScript, fetchAustinWeather };
