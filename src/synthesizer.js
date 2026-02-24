/**
 * Script Synthesizer
 *
 * Uses Gemini API (or Claude API) to generate a spoken-word audio script with Chicago weather integration
 */

// const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

/**
 * Fetch current Chicago, IL weather from Open-Meteo API (free, no key needed)
 */
async function fetchChicagoWeather() {
  const url = 'https://api.open-meteo.com/v1/forecast'
    + '?latitude=41.8781&longitude=-87.6298'
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
 * Synthesize audio script from content bundle using Gemini
 */
async function synthesizeScriptGemini(contentBundle, episodeMemory = null) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY not found in environment');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelPro = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
  const modelFlash = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Chicago',
  });

  // Fetch Chicago weather
  const weather = await fetchChicagoWeather();
  const weatherSummary = `${weather.description}, currently ${weather.current}°F, `
    + `high of ${weather.high}°F, low of ${weather.low}°F, `
    + `${weather.precip}% chance of rain, winds at ${weather.wind} mph`;

  const memoryContext = episodeMemory
    ? `═══════════════════════════════════════════════
RECENT EPISODE CONTEXT (last 7 days):
═══════════════════════════════════════════════
The following summaries capture what this podcast covered recently. Use this context to create natural continuity — for example, noting when a story has developed since a previous episode, or briefly recapping something relevant before diving deeper. Only reference prior coverage when it genuinely adds value. Never force connections that aren't there.

${episodeMemory}

`
    : '';

  const prompt = `
You are writing the script for "The Daily Briefing," a two-host personal morning podcast for Ben.
Today is ${today}. Ben is based in Chicago, Illinois.

Chicago weather right now: ${weatherSummary}

${memoryContext}The show has two hosts:
- HOST: The primary anchor. Drives the agenda, delivers the main stories, and keeps the episode moving.
- COHOST: The color commentator. Adds reactions, counterpoints, follow-up questions, and personal takes.

Below is the raw content gathered from several sources:
1. AI/ML news (major tech outlets, foundation model labs, startup/funding news, research)
2. Axios newsletters (Chicago, Future of Energy, AI, Daily Essentials, PM, Finish Line)
3. Additional Sourcing:
   - Real Estate Market Analysis (Zillow/Redfin data)
   - SF Sports Recaps (Warriors/Giants game results)
   - International Relations (Iran-centered news)

YOUR TASK:
Produce a complete, ready-to-record two-speaker podcast script for an 8–15 minute episode.

═══════════════════════════════════════════════
FORMAT RULES (critical):
═══════════════════════════════════════════════
- Every speaker turn MUST start with a speaker tag on its own line: [HOST] or [COHOST]
- The spoken text for that turn follows on the next line(s).
- Alternate between speakers naturally. Not every exchange needs to be equal length.
- Example:

[HOST]
Good morning, Tyler! Big day in the data world.

[COHOST]
No kidding. I saw the Databricks news drop last night and almost spilled my coffee.

[HOST]
Let's get right into it.

═══════════════════════════════════════════════
STRUCTURE (follow this exactly):
═══════════════════════════════════════════════

[COLD OPEN — 15–30 seconds]
- HOST greets Ben by name.
- One sentence on what today's episode covers (the "headline of headlines").
- COHOST reacts and weaves in the Chicago weather naturally.

[THEME SEGMENTS — 4 to 8 segments, each ~1–2 minutes]
Cluster today's news into themes. Choose names that fit the actual news.
Mandatory Themes (if data exists):
- "AI & Tech Briefing": Coverage of major AI/ML news.
- "Real Estate Report": Market analysis based on Zillow/Redfin summaries.
- "Sports Desk": Quick recaps of Warriors or Giants games from yesterday.
- "Global Affairs": International relations updates, specifically centered on Iran.
- "Local & Regional": Chicago news from Axios.
- "Energy & Policy": Future of Energy and politics.

For each theme segment:
- HOST introduces the theme, then delivers the core story.
- COHOST adds reactions, follow-up questions, or "why it matters" color.
- Together they explain what happened, why it matters, and who it impacts.
- Use first-person ("I think", "what I find interesting here is").
- Address Ben by name once or twice across the whole episode.
- Transitions between segments should feel natural.

[WRAP-UP — 15–30 seconds]
- HOST gives a quick recap of the 1–2 biggest themes.
- COHOST adds what Ben should keep an eye on over the coming days.
- Both sign off warmly and personally.

═══════════════════════════════════════════════
STYLE RULES:
═══════════════════════════════════════════════
- Write for the ear, not the eye. Short sentences. Active voice. No bullet points, no URLs, no markdown in the script.
- Conversational and smart — like two well-informed colleagues riffing on the news.
- The banter should feel natural, not forced. Don't overdo the back-and-forth — let each host make substantive points.
- Do NOT pad with filler. If today is a slow news day, say so honestly and go deeper on fewer items.
- Target word count: 1,200–1,800 words (8–12 minutes at a natural speaking pace).
- The ONLY bracketed labels allowed are [HOST] and [COHOST] at the start of each speaker turn.
  No other stage directions, segment headers, or bracketed labels.

═══════════════════════════════════════════════
RAW CONTENT:
═══════════════════════════════════════════════
${JSON.stringify(contentBundle, null, 2)}

Return ONLY the two-speaker script with [HOST] and [COHOST] tags. No other labels, headers, stage directions, or markdown.
`;

  console.log('Synthesizing script with Gemini Pro...');

  try {
    const result = await modelPro.generateContent(prompt);
    const response = await result.response;
    const script = response.text();

    if (!script) {
      throw new Error('Empty response from Gemini API');
    }

    const wordCount = script.split(/\s+/).length;
    console.log(`  Generated script: ${wordCount} words`);

    // Generate a short summary for the episode description
    console.log('  Generating episode summary with Gemini Flash...');
    const summaryPrompt = `In 2-3 sentences, summarize the key topics covered in this podcast episode. Write it as a listener-facing description — informative and engaging, no host names or personal references.\n\nScript:\n${script}`;
    
    const summaryResult = await modelFlash.generateContent(summaryPrompt);
    const summaryResponse = await summaryResult.response;
    const summary = summaryResponse.text().trim();

    // Usage details (Gemini SDK usage object structure)
    const usage = response.usageMetadata;
    const summaryUsage = summaryResponse.usageMetadata;

    return {
      script,
      summary,
      usage: {
        geminiPro: {
          promptTokens: usage.promptTokenCount || 0,
          candidatesTokens: usage.candidatesTokenCount || 0
        },
        geminiFlash: {
          promptTokens: summaryUsage.promptTokenCount || 0,
          candidatesTokens: summaryUsage.candidatesTokenCount || 0
        }
      },
    };

  } catch (error) {
    console.error('Error synthesizing script with Gemini:', error.message);
    throw error;
  }
}

/**
 * Synthesize audio script from content bundle
 */
async function synthesizeScript(contentBundle, episodeMemory = null) {
  /*
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: 60 * 1000, // 60 seconds
  });

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Chicago',
  });

  // Fetch Chicago weather
  const weather = await fetchChicagoWeather();
  const weatherSummary = `${weather.description}, currently ${weather.current}°F, `
    + `high of ${weather.high}°F, low of ${weather.low}°F, `
    + `${weather.precip}% chance of rain, winds at ${weather.wind} mph`;

  const memoryContext = episodeMemory
    ? `═══════════════════════════════════════════════
RECENT EPISODE CONTEXT (last 7 days):
═══════════════════════════════════════════════
The following summaries capture what this podcast covered recently. Use this context to create natural continuity — for example, noting when a story has developed since a previous episode, or briefly recapping something relevant before diving deeper. Only reference prior coverage when it genuinely adds value. Never force connections that aren't there.

${episodeMemory}

`
    : '';

  const prompt = `
You are writing the script for "The Daily Briefing," a two-host personal morning podcast for Ben.
Today is ${today}. Ben is based in Chicago, Illinois.

Chicago weather right now: ${weatherSummary}

${memoryContext}The show has two hosts:
- HOST: The primary anchor. Drives the agenda, delivers the main stories, and keeps the episode moving.
- COHOST: The color commentator. Adds reactions, counterpoints, follow-up questions, and personal takes.

Below is the raw content gathered from several sources:
1. AI/ML news (major tech outlets, foundation model labs, startup/funding news, research)
2. Axios newsletters (Chicago, Future of Energy, AI, Daily Essentials, PM, Finish Line)
3. Additional Sourcing:
   - Real Estate Market Analysis (Zillow/Redfin data)
   - SF Sports Recaps (Warriors/Giants game results)
   - International Relations (Iran-centered news)

YOUR TASK:
Produce a complete, ready-to-record two-speaker podcast script for an 8–15 minute episode.

═══════════════════════════════════════════════
FORMAT RULES (critical):
═══════════════════════════════════════════════
- Every speaker turn MUST start with a speaker tag on its own line: [HOST] or [COHOST]
- The spoken text for that turn follows on the next line(s).
- Alternate between speakers naturally. Not every exchange needs to be equal length.
- Example:

[HOST]
Good morning, Tyler! Big day in the data world.

[COHOST]
No kidding. I saw the Databricks news drop last night and almost spilled my coffee.

[HOST]
Let's get right into it.

═══════════════════════════════════════════════
STRUCTURE (follow this exactly):
═══════════════════════════════════════════════

[COLD OPEN — 15–30 seconds]
- HOST greets Ben by name.
- One sentence on what today's episode covers (the "headline of headlines").
- COHOST reacts and weaves in the Chicago weather naturally.

[THEME SEGMENTS — 4 to 8 segments, each ~1–2 minutes]
Cluster today's news into themes. Choose names that fit the actual news.
Mandatory Themes (if data exists):
- "AI & Tech Briefing": Coverage of major AI/ML news.
- "Real Estate Report": Market analysis based on Zillow/Redfin summaries.
- "Sports Desk": Quick recaps of Warriors or Giants games from yesterday.
- "Global Affairs": International relations updates, specifically centered on Iran.
- "Local & Regional": Chicago news from Axios.
- "Energy & Policy": Future of Energy and politics.

For each theme segment:
- HOST introduces the theme, then delivers the core story.
- COHOST adds reactions, follow-up questions, or "why it matters" color.
- Together they explain what happened, why it matters, and who it impacts.
- Use first-person ("I think", "what I find interesting here is").
- Address Ben by name once or twice across the whole episode.
- Transitions between segments should feel natural.

[WRAP-UP — 15–30 seconds]
- HOST gives a quick recap of the 1–2 biggest themes.
- COHOST adds what Ben should keep an eye on over the coming days.
- Both sign off warmly and personally.

═══════════════════════════════════════════════
STYLE RULES:
═══════════════════════════════════════════════
- Write for the ear, not the eye. Short sentences. Active voice. No bullet points, no URLs, no markdown in the script.
- Conversational and smart — like two well-informed colleagues riffing on the news.
- The banter should feel natural, not forced. Don't overdo the back-and-forth — let each host make substantive points.
- Do NOT pad with filler. If today is a slow news day, say so honestly and go deeper on fewer items.
- Target word count: 1,200–1,800 words (8–12 minutes at a natural speaking pace).
- The ONLY bracketed labels allowed are [HOST] and [COHOST] at the start of each speaker turn.
  No other stage directions, segment headers, or bracketed labels.

═══════════════════════════════════════════════
RAW CONTENT:
═══════════════════════════════════════════════
${JSON.stringify(contentBundle, null, 2)}

Return ONLY the two-speaker script with [HOST] and [COHOST] tags. No other labels, headers, stage directions, or markdown.
`;

  console.log('Synthesizing script with Claude Sonnet 4.6...');

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }],
    });

    if (!message.content || message.content.length === 0) {
      throw new Error('Empty response from Claude API');
    }
    const script = message.content[0].text;
    const wordCount = script.split(/\s+/).length;

    console.log(`  Generated script: ${wordCount} words`);

    // Generate a short summary for the episode description
    console.log('  Generating episode summary...');
    const summaryMessage = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      messages: [{
        role: 'user',
        content: `In 2-3 sentences, summarize the key topics covered in this podcast episode. Write it as a listener-facing description — informative and engaging, no host names or personal references.\n\nScript:\n${script}`,
      }],
    });
    const summary = summaryMessage.content[0].text.trim();

    // Return script, summary, and combined usage data for cost tracking
    return {
      script,
      summary,
      usage: {
        inputTokens: message.usage.input_tokens + summaryMessage.usage.input_tokens,
        outputTokens: message.usage.output_tokens + summaryMessage.usage.output_tokens,
      },
    };

  } catch (error) {
    console.error('Error synthesizing script:', error.message);
    throw error;
  }
  */
  return synthesizeScriptGemini(contentBundle, episodeMemory);
}

module.exports = { synthesizeScript, fetchChicagoWeather };
