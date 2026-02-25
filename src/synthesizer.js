/**
 * Script Synthesizer
 *
 * Uses Gemini API (or Claude API) to generate a spoken-word audio script with Chicago weather integration
 */

// const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

/**
 * Fetch current weather from Open-Meteo API (free, no key needed)
 * @param {Object} config - Podcast configuration with location data
 */
async function fetchWeather(config) {
  const { latitude, longitude, timezone, city, state } = config.location;
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${latitude}&longitude=${longitude}`
    + '&current=temperature_2m,weathercode,windspeed_10m'
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max'
    + `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=${encodeURIComponent(timezone)}&forecast_days=1`;

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
    location: `${city}, ${state}`,
  };
}

/**
 * Synthesize audio script from content bundle using Gemini
 * @param {Object} contentBundle - Content from all sources
 * @param {string|null} episodeMemory - Recent episode context
 * @param {Object} config - Podcast configuration
 */
async function synthesizeScriptGemini(contentBundle, episodeMemory = null, config) {
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
    timeZone: config.location.timezone,
  });

  // Fetch weather for configured location
  const weather = await fetchWeather(config);
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

  // Build content sources list dynamically
  const contentSources = [];
  let sourceCounter = 1;

  if (config.content.aiNews?.enabled) {
    const focus = config.content.aiNews.focus
      ? ` with a focus on ${config.content.aiNews.focus}`
      : '';
    contentSources.push(`${sourceCounter}. AI/ML news${focus} (major tech outlets, foundation model labs, startup/funding news, research)`);
    sourceCounter++;
  }

  if (config.content.newsletters?.enabled) {
    contentSources.push(`${sourceCounter}. Newsletters (via Kill The Newsletter RSS feed)`);
    sourceCounter++;
  }

  const additionalSources = [];
  if (config.content.realEstate?.enabled) {
    additionalSources.push('Real Estate Market Analysis (Zillow/Redfin data)');
  }
  if (config.content.sports?.enabled) {
    const teamNames = config.content.sports.teams?.map(t => t.name).join('/') || 'sports';
    additionalSources.push(`Sports Recaps (${teamNames} game results)`);
  }
  if (config.content.internationalRelations?.enabled) {
    const focus = config.content.internationalRelations.focus || 'international';
    additionalSources.push(`International Relations (${focus}-centered news)`);
  }
  if (config.content.news?.enabled) {
    const feedNames = config.content.news.feeds?.map(f => f.name).join(', ') || 'News feeds';
    additionalSources.push(`General News (${feedNames})`);
  }
  if (config.content.surfConditions?.enabled) {
    const location = config.content.surfConditions.location || 'local';
    additionalSources.push(`Surf Report (${location} conditions)`);
  }

  if (additionalSources.length > 0) {
    contentSources.push(`${sourceCounter}. Additional Sourcing:\n   - ${additionalSources.join('\n   - ')}`);
  }

  const contentSourcesText = contentSources.length > 0
    ? `Below is the raw content gathered from several sources:\n${contentSources.join('\n')}`
    : 'Below is the raw content gathered for today:';

  // Build mandatory themes list dynamically
  const mandatoryThemes = [];

  if (config.content.aiNews?.enabled) {
    mandatoryThemes.push('- "AI & Tech Briefing": Coverage of major AI/ML news.');
  }
  if (config.content.realEstate?.enabled) {
    mandatoryThemes.push('- "Real Estate Report": Market analysis based on Zillow/Redfin summaries.');
  }
  if (config.content.sports?.enabled) {
    const teamNames = config.content.sports.teams?.map(t => t.name).join(' or ') || 'team';
    mandatoryThemes.push(`- "Sports Desk": Quick recaps of ${teamNames} games from yesterday.`);
  }
  if (config.content.internationalRelations?.enabled) {
    const focus = config.content.internationalRelations.focus || 'international';
    mandatoryThemes.push(`- "Global Affairs": International relations updates, specifically centered on ${focus}.`);
  }
  if (config.content.news?.enabled) {
    const feedFocuses = config.content.news.feeds?.map(f => f.focus || f.name).join(', ') || 'general news';
    mandatoryThemes.push(`- "News Briefing": Coverage of ${feedFocuses}.`);
  }
  if (config.content.newsletters?.enabled) {
    mandatoryThemes.push(`- "Local & Regional": ${weather.location} news from newsletters.`);
    mandatoryThemes.push('- "Energy & Policy": Future of Energy and politics.');
  }
  if (config.content.surfConditions?.enabled) {
    const location = config.content.surfConditions.location || 'local';
    mandatoryThemes.push(`- "Surf Report": ${location} surf conditions and forecast.`);
  }
  if (config.content.sports?.events) {
    const eventTypes = config.content.sports.events
      .filter(e => e.enabled)
      .map(e => e.type.charAt(0).toUpperCase() + e.type.slice(1))
      .join(' or ');
    if (eventTypes) {
      mandatoryThemes.push(`- "${eventTypes} Coverage": Updates and highlights from ongoing ${eventTypes} events.`);
    }
  }

  const themesText = mandatoryThemes.length > 0
    ? `Mandatory Themes (if data exists):\n${mandatoryThemes.join('\n')}`
    : 'Create themes based on the content provided.';

  const prompt = `
You are writing the script for "${config.metadata.title}," a two-host personal morning podcast for Ben.
Today is ${today}. Ben is based in ${weather.location}.

${weather.location} weather right now: ${weatherSummary}

${memoryContext}The show has two hosts:
- HOST: The primary anchor. Drives the agenda, delivers the main stories, and keeps the episode moving.
- COHOST: The color commentator. Adds reactions, counterpoints, follow-up questions, and personal takes.

${contentSourcesText}

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
- COHOST reacts and weaves in the ${weather.location} weather naturally.

[THEME SEGMENTS — 4 to 8 segments, each ~1–2 minutes]
Cluster today's news into themes. Choose names that fit the actual news.
${themesText}

For each theme segment:
- HOST introduces the theme, then delivers the core story.
- COHOST adds reactions, follow-up questions, or "why it matters" color.
- Together they explain what happened, why it matters, and who it impacts.
- Use first-person ("I think", "what I find interesting here is").
- Address Ben by name once or twice across the whole episode.
- Transitions between segments should feel natural.

[ARTICLE DISCUSSION — 2–4 minutes] (ONLY if articles are provided in the content bundle)
- If articles are present, include a dedicated segment for in-depth discussion.
- HOST introduces the article discussion segment naturally (e.g., "Before we wrap, let's go deeper on something interesting I've been reading...")
- For each article:
  * HOST provides the article title and main thesis
  * COHOST engages with the key points, asking clarifying questions
  * Both hosts explore implications, counterarguments, and why it matters
  * Use the analysis provided in the article data to guide discussion
  * Make it conversational and thought-provoking, not a dry summary
- This should feel like a deeper dive, not rushed news coverage.
- If NO articles are provided, skip this section entirely.

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
 * Synthesize audio script from content bundle (wrapper)
 * @param {Object} contentBundle - Content from all sources
 * @param {string|null} episodeMemory - Recent episode context
 * @param {Object} config - Podcast configuration
 */
async function synthesizeScript(contentBundle, episodeMemory = null, config) {
  return synthesizeScriptGemini(contentBundle, episodeMemory, config);
}

module.exports = { synthesizeScript, fetchWeather };
