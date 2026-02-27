/**
 * Content Fetcher
 *
 * Fetches content from AI/ML news sources, sports, newsletters, and other configured sources
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { fetchSurflineConditions } = require('./surfConditions');
const { areOlympicsActive, fetchOlympicsUpdates } = require('./olympics');
const { isWorldCupActive, fetchWorldCupUpdates } = require('./worldcup');
const { hasArticleBeenCovered } = require('./episodeMemory');

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

// Initialize Gemini
const genAI = process.env.GOOGLE_API_KEY ? new GoogleGenerativeAI(process.env.GOOGLE_API_KEY) : null;
const modelFlash = genAI ? genAI.getGenerativeModel({ model: "gemini-flash-latest" }) : null;

// ============================================================================
// REAL ESTATE SOURCES
// ============================================================================

/**
 * Fetch and summarize real estate news
 */
async function fetchRealEstateNews(config) {
  console.log('Fetching Real Estate news...');

  // Use feeds from config if provided, otherwise fall back to defaults
  const feeds = config?.feeds || [
    { url: 'https://www.zillow.com/research/feed/', name: 'Zillow Research' },
    { url: 'https://www.redfin.com/news/feed/', name: 'Redfin News' }
  ];

  const allItems = [];
  for (const feed of feeds) {
    const items = await fetchRSSFeed(feed.url, feed.name, 3);
    allItems.push(...items);
  }

  if (!modelFlash || allItems.length === 0) {
    return { items: allItems, usage: null };
  }

  console.log('  Summarizing Real Estate news with Gemini Flash...');

  // Build prompt with dynamic target markets and price range from config
  const targetMarkets = config?.targetMarkets?.join(', ') || 'California, Chicago (specifically north shore suburbs), and Montana';
  const priceRange = config?.priceRange || '$600k–$1.5m';

  const prompt = `
Act as a real estate data analyst and article summarizer. Analyze the provided RSS feed text and extract information strictly related to the following categories to be used in a short podcast segment on market conditions.

Extraction Categories:
1. Mortgage Rates: Any specific percentages, year-over-year changes, or forecasted movements.
2. Target Price Bracket (${priceRange}): Any mention of 'mid-to-high tier,' 'luxury,' or specific data points involving these price ranges.
3. Geographic Specifics: Explicit data for ${targetMarkets}.
4. Market Dynamics: Evidence of buyer leverage (e.g., inventory levels, price cuts, concessions) and emerging national trends.

Strict Constraints:
- No Inference: Only report what is explicitly stated in the text. If a category is not mentioned, explicitly state 'No data available for this topic.'

Output: Transform the extracted facts into a summary that will be used to build a conversational podcast script segment. If data for a category is missing, skip it in the script rather than speculating.

RSS Content:
${allItems.map(i => `Title: ${i.title}\nSummary: ${i.summary}`).join('\n\n')}
`;

  try {
    const result = await modelFlash.generateContent(prompt);
    const response = await result.response;
    const summary = response.text();
    const usage = response.usageMetadata;

    return {
      items: [{
        title: 'Real Estate Market Analysis',
        summary: summary,
        date: new Date().toLocaleDateString(),
        source: 'Real Estate Analysis'
      }],
      usage: usage ? { geminiFlash: { promptTokens: usage.promptTokenCount, candidatesTokens: usage.candidatesTokenCount } } : null
    };
  } catch (error) {
    console.error('Error summarizing Real Estate news:', error.message);
    return { items: allItems, usage: null };
  }
}

// ============================================================================
// SPORTS SOURCES
// ============================================================================

/**
 * Get YYYYMMDD for yesterday
 */
function getYesterdayDate() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Fetch and summarize Warriors game
 */
async function fetchWarriorsGame() {
  const date = getYesterdayDate();
  console.log(`Fetching Warriors game for ${date}...`);

  try {
    const scoreboardUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${date}`;
    const { data: scoreboard } = await axios.get(scoreboardUrl);

    const event = scoreboard.events?.find(e => 
      e.competitions[0].competitors.some(c => c.team.name === 'Warriors')
    );

    if (!event) {
      console.log('  No Warriors game found for yesterday.');
      return { items: [], usage: null };
    }

    const summaryUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${event.id}`;
    const { data: summaryData } = await axios.get(summaryUrl);

    if (!modelFlash) return { items: [{ title: `Warriors Game: ${event.name}`, summary: event.status.type.detail, source: 'ESPN' }], usage: null };

    console.log('  Summarizing Warriors game with Gemini Flash...');
    const prompt = `Analyze the provided NBA game JSON data to write a concise narrative of the event. Identify the winner, final score, and game flow. Highlight top performers and those who struggled (using efficiency and +/-). Describe the game's style (e.g., defensive struggle, shootout) based on shooting percentages and turnover counts (specify counts for both teams). Note any notable stat lines or major lead swings.\n\nJSON Data:\n${JSON.stringify(summaryData)}`;

    const result = await modelFlash.generateContent(prompt);
    const response = await result.response;
    const usage = response.usageMetadata;

    return {
      items: [{
        title: `Warriors Recap: ${event.name}`,
        summary: response.text(),
        date: new Date().toLocaleDateString(),
        source: 'ESPN Warriors'
      }],
      usage: usage ? { geminiFlash: { promptTokens: usage.promptTokenCount, candidatesTokens: usage.candidatesTokenCount } } : null
    };
  } catch (error) {
    console.error('Error fetching Warriors game:', error.message);
    return { items: [], usage: null };
  }
}

/**
 * Fetch and summarize SF Giants game
 */
async function fetchGiantsGame() {
  const date = getYesterdayDate();
  console.log(`Fetching SF Giants game for ${date}...`);

  try {
    const scoreboardUrl = `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${date}`;
    const { data: scoreboard } = await axios.get(scoreboardUrl);

    const event = scoreboard.events?.find(e => 
      e.competitions[0].competitors.some(c => c.team.name === 'San Francisco Giants')
    );

    if (!event) {
      console.log('  No SF Giants game found for yesterday.');
      return { items: [], usage: null };
    }

    const summaryUrl = `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard/summary?event=${event.id}`;
    const { data: summaryData } = await axios.get(summaryUrl);

    if (!modelFlash) return { items: [{ title: `Giants Game: ${event.name}`, summary: event.status.type.detail, source: 'ESPN' }], usage: null };

    console.log('  Summarizing SF Giants game with Gemini Flash...');
    const prompt = `Analyze the provided MLB game JSON data to write a (no more than 5 sentence) concise narrative of the event. Identify the winner, final score, and game flow. Highlight top performers and those who struggled (ERA, at bats). Describe the game's style.\n\nJSON Data:\n${JSON.stringify(summaryData)}`;

    const result = await modelFlash.generateContent(prompt);
    const response = await result.response;
    const usage = response.usageMetadata;

    return {
      items: [{
        title: `Giants Recap: ${event.name}`,
        summary: response.text(),
        date: new Date().toLocaleDateString(),
        source: 'ESPN Giants'
      }],
      usage: usage ? { geminiFlash: { promptTokens: usage.promptTokenCount, candidatesTokens: usage.candidatesTokenCount } } : null
    };
  } catch (error) {
    console.error('Error fetching SF Giants game:', error.message);
    return { items: [], usage: null };
  }
}

/**
 * Fetch and summarize 49ers game
 */
async function fetchNinersGame() {
  const date = getYesterdayDate();
  console.log(`Fetching 49ers game for ${date}...`);

  try {
    const scoreboardUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${date}`;
    const { data: scoreboard } = await axios.get(scoreboardUrl);

    const event = scoreboard.events?.find(e =>
      e.competitions[0].competitors.some(c => c.team.name === '49ers')
    );

    if (!event) {
      console.log('  No 49ers game found for yesterday.');
      return { items: [], usage: null };
    }

    const summaryUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${event.id}`;
    const { data: summaryData } = await axios.get(summaryUrl);

    if (!modelFlash) return { items: [{ title: `49ers Game: ${event.name}`, summary: event.status.type.detail, source: 'ESPN' }], usage: null };

    console.log('  Summarizing 49ers game with Gemini Flash...');
    const prompt = `Analyze the provided NFL game JSON data to write a concise narrative of the event. Identify the winner, final score, and game flow. Highlight top performers and those who struggled. Describe the game's style (e.g., defensive struggle, shootout) based on score and turnover counts. Note any notable stat lines or major lead swings.\n\nJSON Data:\n${JSON.stringify(summaryData)}`;

    const result = await modelFlash.generateContent(prompt);
    const response = await result.response;
    const usage = response.usageMetadata;

    return {
      items: [{
        title: `49ers Recap: ${event.name}`,
        summary: response.text(),
        date: new Date().toLocaleDateString(),
        source: 'ESPN 49ers'
      }],
      usage: usage ? { geminiFlash: { promptTokens: usage.promptTokenCount, candidatesTokens: usage.candidatesTokenCount } } : null
    };
  } catch (error) {
    console.error('Error fetching 49ers game:', error.message);
    return { items: [], usage: null };
  }
}

/**
 * Generic function to fetch and summarize a sports game by league
 */
async function fetchSportsGame(league, teamName, espnApiName) {
  const date = getYesterdayDate();
  console.log(`Fetching ${teamName} game for ${date}...`);

  try {
    const leagueMap = {
      'nba': { sport: 'basketball', league: 'nba' },
      'mlb': { sport: 'baseball', league: 'mlb' },
      'nfl': { sport: 'football', league: 'nfl' }
    };

    const leagueInfo = leagueMap[league.toLowerCase()];
    if (!leagueInfo) {
      console.error(`  Unknown league: ${league}`);
      return { items: [], usage: null };
    }

    const scoreboardUrl = `https://site.api.espn.com/apis/site/v2/sports/${leagueInfo.sport}/${leagueInfo.league}/scoreboard?dates=${date}`;
    const { data: scoreboard } = await axios.get(scoreboardUrl);

    const event = scoreboard.events?.find(e =>
      e.competitions[0].competitors.some(c =>
        c.team.name === teamName ||
        c.team.displayName === teamName ||
        c.team.shortDisplayName === teamName
      )
    );

    if (!event) {
      console.log(`  No ${teamName} game found for yesterday.`);
      return { items: [], usage: null };
    }

    let summaryUrl;
    if (league.toLowerCase() === 'mlb') {
      summaryUrl = `https://site.api.espn.com/apis/site/v2/sports/${leagueInfo.sport}/${leagueInfo.league}/scoreboard/summary?event=${event.id}`;
    } else {
      summaryUrl = `https://site.api.espn.com/apis/site/v2/sports/${leagueInfo.sport}/${leagueInfo.league}/summary?event=${event.id}`;
    }

    const { data: summaryData } = await axios.get(summaryUrl);

    if (!modelFlash) return { items: [{ title: `${teamName} Game: ${event.name}`, summary: event.status.type.detail, source: 'ESPN' }], usage: null };

    console.log(`  Summarizing ${teamName} game with Gemini Flash...`);

    let prompt;
    if (league.toLowerCase() === 'nba') {
      prompt = `Analyze the provided NBA game JSON data to write a concise narrative of the event. Identify the winner, final score, and game flow. Highlight top performers and those who struggled (using efficiency and +/-). Describe the game's style (e.g., defensive struggle, shootout) based on shooting percentages and turnover counts (specify counts for both teams). Note any notable stat lines or major lead swings.\n\nJSON Data:\n${JSON.stringify(summaryData)}`;
    } else if (league.toLowerCase() === 'mlb') {
      prompt = `Analyze the provided MLB game JSON data to write a (no more than 5 sentence) concise narrative of the event. Identify the winner, final score, and game flow. Highlight top performers and those who struggled (ERA, at bats). Describe the game's style.\n\nJSON Data:\n${JSON.stringify(summaryData)}`;
    } else if (league.toLowerCase() === 'nfl') {
      prompt = `Analyze the provided NFL game JSON data to write a concise narrative of the event. Identify the winner, final score, and game flow. Highlight top performers and those who struggled. Describe the game's style (e.g., defensive struggle, shootout) based on score and turnover counts. Note any notable stat lines or major lead swings.\n\nJSON Data:\n${JSON.stringify(summaryData)}`;
    }

    const result = await modelFlash.generateContent(prompt);
    const response = await result.response;
    const usage = response.usageMetadata;

    return {
      items: [{
        title: `${teamName} Recap: ${event.name}`,
        summary: response.text(),
        date: new Date().toLocaleDateString(),
        source: `ESPN ${teamName}`
      }],
      usage: usage ? { geminiFlash: { promptTokens: usage.promptTokenCount, candidatesTokens: usage.candidatesTokenCount } } : null
    };
  } catch (error) {
    console.error(`Error fetching ${teamName} game:`, error.message);
    return { items: [], usage: null };
  }
}

/**
 * Fetch team news from ESPN and filter for newsworthy items
 * @param {string} league - 'nba', 'mlb', or 'nfl'
 * @param {string} teamName - Team display name
 * @param {string} espnNewsId - ESPN team ID for news API
 */
async function fetchTeamNews(league, teamName, espnNewsId) {
  if (!espnNewsId) {
    return { items: [], usage: null };
  }

  try {
    // Map league to ESPN API sport path
    const sportPath = {
      'nba': 'basketball/nba',
      'mlb': 'baseball/mlb',
      'nfl': 'football/nfl'
    }[league];

    if (!sportPath) {
      console.error(`Unknown league: ${league}`);
      return { items: [], usage: null };
    }

    const url = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/news?team=${espnNewsId}&limit=10`;
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000
    });

    if (!data.articles || data.articles.length === 0) {
      return { items: [], usage: null };
    }

    // Extract article data for Gemini filtering
    const articles = data.articles.map(article => ({
      headline: article.headline,
      description: article.description,
      published: article.published
    }));

    if (!modelFlash) {
      return { items: [], usage: null };
    }

    // Use Gemini to identify truly newsworthy items
    const prompt = `You are filtering ${teamName} team news for a sports podcast. Review the following news headlines and descriptions.

ONLY include items that are genuinely newsworthy, such as:
- Trades (completed or rumored)
- Major signings or contract extensions
- Significant injuries to star players
- Major statements by ownership, coaches, or GMs about team direction
- Playoff implications or standings changes
- Roster moves of significant impact
- Controversial incidents or team drama

EXCLUDE:
- Game previews or routine game analysis
- Minor roster moves or practice squad changes, undrafted rookie signings
- Generic feature stories or player profiles
- Historical content or anniversary pieces

Return a JSON array of newsworthy items with this structure:
[
  {
    "headline": "original headline",
    "summary": "1-2 sentence summary explaining why this is newsworthy"
  }
]

If NO items are newsworthy, return an empty array: []

News items:
${JSON.stringify(articles, null, 2)}

Return ONLY valid JSON, no other text.`;

    const result = await modelFlash.generateContent(prompt);
    const response = await result.response;
    const usage = response.usageMetadata;

    let newsItems = [];
    try {
      const text = response.text().trim();
      // Remove markdown code fences if present
      const jsonText = text.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '');
      newsItems = JSON.parse(jsonText);
    } catch (parseError) {
      console.error(`Failed to parse team news JSON for ${teamName}:`, parseError.message);
      return { items: [], usage: usage ? { geminiFlash: { promptTokens: usage.promptTokenCount, candidatesTokens: usage.candidatesTokenCount } } : null };
    }

    if (!Array.isArray(newsItems) || newsItems.length === 0) {
      return { items: [], usage: usage ? { geminiFlash: { promptTokens: usage.promptTokenCount, candidatesTokens: usage.candidatesTokenCount } } : null };
    }

    console.log(`  Found ${newsItems.length} newsworthy ${teamName} items`);

    const formattedItems = newsItems.map(item => ({
      title: `${teamName}: ${item.headline}`,
      summary: item.summary,
      date: new Date().toLocaleDateString(),
      source: `ESPN ${teamName} News`
    }));

    return {
      items: formattedItems,
      usage: usage ? { geminiFlash: { promptTokens: usage.promptTokenCount, candidatesTokens: usage.candidatesTokenCount } } : null
    };

  } catch (error) {
    console.error(`Error fetching ${teamName} team news:`, error.message);
    return { items: [], usage: null };
  }
}

/**
 * Fetch narrative content from team-specific RSS feeds (fan sites, analysis blogs)
 * @param {string} teamName - Team display name
 * @param {string} rssFeedUrl - RSS feed URL
 * @param {number} maxItems - Maximum number of items to fetch (default 3)
 */
async function fetchTeamRSSFeed(teamName, rssFeedUrl, maxItems = 3) {
  if (!rssFeedUrl) {
    return { items: [], usage: null };
  }

  console.log(`Fetching ${teamName} RSS feed...`);

  try {
    const items = await fetchRSSFeed(rssFeedUrl, `${teamName} Fan Analysis`, maxItems);

    if (items.length === 0) {
      return { items: [], usage: null };
    }

    console.log(`  Found ${items.length} ${teamName} RSS items`);

    // If no Gemini available, return raw items
    if (!modelFlash) {
      const formattedItems = items.map(item => ({
        title: `${teamName} Analysis: ${item.title}`,
        summary: item.summary,
        date: item.date,
        source: item.source
      }));
      return { items: formattedItems, usage: null };
    }

    console.log(`  Analyzing ${teamName} fan sentiment with Gemini Flash...`);

    const prompt = `You are analyzing fan-generated content from ${teamName} fan sites. These are narrative pieces with strong fan perspective, not neutral journalism.

Extract the key storylines and fan sentiment from the following articles. For each noteworthy item:
1. Identify what happened (game results, player performance, team news, injuries, trades, etc.)
2. Capture the fan perspective and emotional tone (optimistic, frustrated, angry, excited, disappointed, etc.)
3. Note any specific criticisms or praise of players, coaches, or front office decisions

Important: This is FAN content, so expect bias, emotion, and strong opinions. Capture that authentic voice rather than neutralizing it.

Example outputs:
- "Warriors fans frustrated after dropping winnable game to Blazers. Young players showing inconsistency, Kuminga specifically called out for poor decision-making. Fanbase questioning rotation decisions."
- "Giants fans cautiously optimistic as pitching staff shows promise. Webb looking like ace material, but offense remains anemic. Calls for front office to make moves before deadline."
- "49ers faithful fired up after dominant defensive performance. Bosa and Warner playing at All-Pro level. Fanbase demanding more creative play-calling from offensive coordinator."

Return a JSON array of items with this structure:
[
  {
    "summary": "2-3 sentence summary capturing storyline and fan sentiment"
  }
]

If no items are relevant or newsworthy, return an empty array: []

RSS Articles:
${items.map(item => `Title: ${item.title}\nContent: ${item.summary}`).join('\n\n---\n\n')}

Return ONLY valid JSON, no other text.`;

    const result = await modelFlash.generateContent(prompt);
    const response = await result.response;
    const usage = response.usageMetadata;

    let analyzedItems = [];
    try {
      const text = response.text().trim();
      const jsonText = text.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '');
      analyzedItems = JSON.parse(jsonText);
    } catch (parseError) {
      console.error(`Failed to parse ${teamName} RSS analysis JSON:`, parseError.message);
      return { items: [], usage: usage ? { geminiFlash: { promptTokens: usage.promptTokenCount, candidatesTokens: usage.candidatesTokenCount } } : null };
    }

    if (!Array.isArray(analyzedItems) || analyzedItems.length === 0) {
      return { items: [], usage: usage ? { geminiFlash: { promptTokens: usage.promptTokenCount, candidatesTokens: usage.candidatesTokenCount } } : null };
    }

    console.log(`  Analyzed ${analyzedItems.length} ${teamName} fan narratives`);

    const formattedItems = analyzedItems.map(item => ({
      title: `${teamName} Fan Perspective`,
      summary: item.summary,
      date: new Date().toLocaleDateString(),
      source: `${teamName} Fan Analysis`
    }));

    return {
      items: formattedItems,
      usage: usage ? { geminiFlash: { promptTokens: usage.promptTokenCount, candidatesTokens: usage.candidatesTokenCount } } : null
    };

  } catch (error) {
    console.error(`Error fetching ${teamName} RSS feed:`, error.message);
    return { items: [], usage: null };
  }
}

// ============================================================================
// IRAN NEWS
// ============================================================================

/**
 * Fetch Iran international relations news
 */
async function fetchIranNews() {
  console.log('Fetching Iran international relations news...');
  try {
    const [fp] = await Promise.all([
      fetchRSSFeed('https://foreignpolicy.com/tag/iran/feed', 'Foreign Policy - Iran', 3)
    ]);
    return { items: [...fp], usage: null };
  } catch (error) {
    console.error('Error fetching Iran news:', error.message);
    return { items: [], usage: null };
  }
}

// ============================================================================
// GENERAL NEWS SOURCES
// ============================================================================

/**
 * Fetch and summarize general RSS news feeds
 * @param {Object} config - News configuration with feeds array
 */
async function fetchNewsFeeds(config) {
  console.log('Fetching general news feeds...');

  // Use feeds from config
  const feeds = config?.feeds || [];
  if (feeds.length === 0) {
    return { items: [], usage: null };
  }

  const maxItemsPerFeed = config?.maxItemsPerFeed || 5;
  const allItems = [];

  for (const feed of feeds) {
    const items = await fetchRSSFeed(feed.url, feed.name, maxItemsPerFeed);
    allItems.push(...items);
  }

  if (!modelFlash || allItems.length === 0) {
    return { items: allItems, usage: null };
  }

  console.log('  Summarizing news feeds with Gemini Flash...');

  // Build prompt with dynamic focus areas from config
  const feedDescriptions = feeds.map(f => `${f.name}${f.focus ? ` (${f.focus})` : ''}`).join(', ');

  const prompt = `
Act as a news analyst. Analyze the provided RSS feed text and extract the most newsworthy stories to be used in a short podcast segment.

Sources: ${feedDescriptions}

Extraction Guidelines:
1. Identify the top 3-5 most significant stories
2. For each story, provide:
   - Clear headline/title
   - Key facts and context (who, what, when, where, why)
   - Why it matters (impact, implications)
3. Skip: routine announcements, press releases without news value, opinion pieces without newsworthy content

Output Format:
Transform the extracted stories into a summary that will be used to build a conversational podcast script segment. Focus on facts and significance, not speculation.

RSS Content:
${allItems.map(i => `Title: ${i.title}\nSummary: ${i.summary}\nSource: ${i.source}`).join('\n\n')}
`;

  try {
    const result = await modelFlash.generateContent(prompt);
    const response = await result.response;
    const summary = response.text();
    const usage = response.usageMetadata;

    return {
      items: [{
        title: 'News Update',
        summary: summary,
        date: new Date().toLocaleDateString(),
        source: 'News Feeds'
      }],
      usage: usage ? { geminiFlash: { promptTokens: usage.promptTokenCount, candidatesTokens: usage.candidatesTokenCount } } : null
    };
  } catch (error) {
    console.error('Error summarizing news feeds:', error.message);
    return { items: allItems, usage: null };
  }
}

// ============================================================================
// DATABRICKS SOURCES
// ============================================================================

/**
 * Fetch recent Databricks release notes
 
async function fetchDatabricksReleaseNotes() {
  console.log('Fetching Databricks release notes...');

  try {
    const { data } = await axios.get('https://docs.databricks.com/en/release-notes/index.html', {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000
    });

    const $ = cheerio.load(data);
    const items = [];

    $('article').slice(0, 5).each((_, el) => {
      const title = $(el).find('h1, h2, h3').first().text().trim();
      const summary = $(el).find('p').first().text().trim().slice(0, 300);
      const date = $(el).find('time, .date').text().trim();

      if (title) {
        items.push({ title, summary, date, source: 'Databricks Release Notes' });
      }
    });

    console.log(`  Found ${items.length} release notes`);
    return items;
  } catch (error) {
    console.error('Error fetching Databricks release notes:', error.message);
    return [];
  }
}
*/

/**
 * Fetch recent Databricks blog posts (RSS)
 
async function fetchDatabricksBlog() {
  console.log('Fetching Databricks blog posts...');

  try {
    const { data } = await axios.get('https://www.databricks.com/feed', {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000
    });

    const $ = cheerio.load(data, { xmlMode: true });
    const items = [];

    $('item').slice(0, 5).each((_, el) => {
      const title = $(el).find('title').text().trim();
      const description = $(el).find('description').text().trim()
        .replace(/<[^>]*>/g, '')
        .slice(0, 300);
      const pubDate = $(el).find('pubDate').text().trim();

      if (title) {
        items.push({ title, summary: description, date: pubDate, source: 'Databricks Blog' });
      }
    });

    console.log(`  Found ${items.length} blog posts`);
    return items;
  } catch (error) {
    console.error('Error fetching Databricks blog:', error.message);
    return [];
  }
}
*/
/**
 * Fetch Databricks newsroom (press releases & announcements)
 
async function fetchDatabricksNewsroom() {
  console.log('Fetching Databricks newsroom...');

  try {
    const { data } = await axios.get('https://www.databricks.com/company/newsroom', {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000
    });

    const $ = cheerio.load(data);
    const items = [];

    // Correct selectors based on actual page structure
    $('div[data-cy="CtaImageBlock"]').slice(0, 5).each((_, el) => {
      const title = $(el).find('h3.h3 a').text().trim();
      const date = $(el).find('p.h4').text().trim();
      const url = $(el).find('h3.h3 a').attr('href');

      if (title) {
        items.push({
          title,
          summary: title, // No separate summary on listing page
          date,
          source: 'Databricks Newsroom',
          url
        });
      }
    });

    console.log(`  Found ${items.length} newsroom items`);
    return items;
  } catch (error) {
    console.error('Error fetching Databricks newsroom:', error.message);
    return [];
  }
}
*/
/**
 * Fetch tweets from Databricks exec team
 * Includes: Ali Ghodsi (CEO), Reynold Xin (Chief Architect), Matei Zaharia (CTO)
 * Requires TWITTER_BEARER_TOKEN environment variable
 
async function fetchDatabricksExecTweets() {
  const token = process.env.TWITTER_BEARER_TOKEN;

  if (!token) {
    console.log('  Skipping Twitter (no TWITTER_BEARER_TOKEN set)');
    return { items: [], apiCalls: 0 };
  }

  console.log('Fetching Databricks exec tweets...');

  try {
    // Databricks co-founders and executive team Twitter handles
    const users = ['alighodsi', 'rxin', 'matei_zaharia'];
    const items = [];
    let apiCalls = 0;

    for (const username of users) {
      try {
        // Get user ID first
        const userRes = await axios.get(
          `https://api.twitter.com/2/users/by/username/${username}`,
          { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
        );
        apiCalls++; // Count user lookup API call

        if (!userRes.data?.data?.id) {
          console.warn(`  Warning: invalid Twitter response for @${username}, skipping`);
          continue;
        }
        const userId = userRes.data.data.id;

        // Get recent tweets
        const tweetsRes = await axios.get(
          `https://api.twitter.com/2/users/${userId}/tweets?max_results=10&tweet.fields=created_at`,
          { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
        );
        apiCalls++; // Count tweets fetch API call

        const tweets = tweetsRes.data.data || [];

        for (const tweet of tweets.slice(0, 3)) {
          items.push({
            title: `@${username}: ${tweet.text.slice(0, 100)}...`,
            summary: tweet.text.slice(0, 300),
            date: tweet.created_at,
            source: `Twitter (@${username})`
          });
        }
      } catch (err) {
        console.error(`  Error fetching tweets from @${username}:`, err.message);
      }
    }

    console.log(`  Found ${items.length} exec tweets (${apiCalls} API calls)`);
    return { items, apiCalls };
  } catch (error) {
    console.error('Error fetching exec tweets:', error.message);
    return { items: [], apiCalls: 0 };
  }
}
*/
// ============================================================================
// AI/ML NEWS SOURCES
// ============================================================================

/**
 * Fetch from RSS feed helper
 */
async function fetchRSSFeed(url, sourceName, maxItems = 5) {
  try {
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000
    });

    const $ = cheerio.load(data, { xmlMode: true });
    const items = [];

    $('item').slice(0, maxItems).each((_, el) => {
      const title = $(el).find('title').text().trim();
      const description = $(el).find('description').text().trim()
        .replace(/<[^>]*>/g, '')
        .slice(0, 300);
      const pubDate = $(el).find('pubDate').text().trim();

      if (title) {
        items.push({ title, summary: description, date: pubDate, source: sourceName });
      }
    });

    return items;
  } catch (error) {
    console.error(`Error fetching ${sourceName}:`, error.message);
    return [];
  }
}

/**
 * Scrape blog posts from a page
 */
async function scrapeBlog(url, sourceName, selectors, maxItems = 5) {
  try {
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000
    });

    const $ = cheerio.load(data);
    const items = [];

    $(selectors.container).slice(0, maxItems).each((_, el) => {
      const title = $(el).find(selectors.title).first().text().trim();
      const summary = $(el).find(selectors.summary).first().text().trim().slice(0, 300);
      const date = $(el).find(selectors.date).first().text().trim();

      if (title) {
        items.push({ title, summary, date, source: sourceName });
      }
    });

    return items;
  } catch (error) {
    console.error(`Error scraping ${sourceName}:`, error.message);
    return [];
  }
}

/**
 * Fetch OpenAI blog
 */
async function fetchOpenAIBlog() {
  console.log('Fetching OpenAI blog...');
  return scrapeBlog(
    'https://openai.com/blog',
    'OpenAI Blog',
    { container: 'article, .post', title: 'h2, h3, .title', summary: 'p', date: 'time, .date' },
    5
  );
}

/**
 * Fetch Anthropic news
 */
async function fetchAnthropicNews() {
  console.log('Fetching Anthropic news...');

  try {
    const { data } = await axios.get('https://www.anthropic.com/news', {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000
    });

    const $ = cheerio.load(data);
    const items = [];

    // Correct selectors based on actual page structure
    $('a.PublicationList-module-scss-module__KxYrHG__listItem').slice(0, 5).each((_, el) => {
      const title = $(el).find('span.PublicationList-module-scss-module__KxYrHG__title').text().trim();
      const category = $(el).find('span.PublicationList-module-scss-module__KxYrHG__subject').text().trim();
      const date = $(el).find('time.PublicationList-module-scss-module__KxYrHG__date').text().trim();
      const url = $(el).attr('href');

      if (title) {
        items.push({
          title,
          summary: category ? `${category}: ${title}` : title,
          date,
          source: 'Anthropic News',
          url: url.startsWith('http') ? url : `https://www.anthropic.com${url}`
        });
      }
    });

    console.log(`  Found ${items.length} news items`);
    return items;
  } catch (error) {
    console.error('Error fetching Anthropic news:', error.message);
    return [];
  }
}

/**
 * Fetch Google DeepMind blog
 */
async function fetchDeepMindBlog() {
  console.log('Fetching DeepMind blog...');
  return scrapeBlog(
    'https://deepmind.google/discover/blog/',
    'Google DeepMind',
    { container: 'article, .blog-post', title: 'h2, h3, .title', summary: 'p', date: 'time, .date' },
    5
  );
}

/**
 * Fetch Meta AI blog
 */
async function fetchMetaAIBlog() {
  console.log('Fetching Meta AI blog...');
  return scrapeBlog(
    'https://ai.meta.com/blog/',
    'Meta AI',
    { container: 'article, .blog-item', title: 'h2, h3, .title', summary: 'p', date: 'time, .date' },
    5
  );
}

/**
 * Fetch The Verge AI RSS
 */
async function fetchVergeAI() {
  console.log('Fetching The Verge AI...');
  return fetchRSSFeed(
    'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
    'The Verge AI',
    5
  );
}

/**
 * Fetch TechCrunch AI RSS
 */
async function fetchTechCrunchAI() {
  console.log('Fetching TechCrunch AI...');
  return fetchRSSFeed(
    'https://techcrunch.com/category/artificial-intelligence/feed/',
    'TechCrunch AI',
    5
  );
}

/**
 * Fetch VentureBeat AI RSS
 */
async function fetchVentureBeatAI() {
  console.log('Fetching VentureBeat AI...');
  return fetchRSSFeed(
    'https://venturebeat.com/category/ai/feed/',
    'VentureBeat AI',
    5
  );
}

/**
 * Fetch Hacker News AI stories
 */
async function fetchHackerNewsAI() {
  console.log('Fetching Hacker News AI stories...');

  try {
    const { data: topStories } = await axios.get(
      'https://hacker-news.firebaseio.com/v0/topstories.json',
      { timeout: 10000 }
    );

    const items = [];
    const aiKeywords = ['ai', 'ml', 'machine learning', 'deep learning', 'llm', 'gpt',
                        'neural', 'artificial intelligence', 'openai', 'anthropic', 'claude',
                        'databricks'];

    const storyPromises = topStories.slice(0, 30).map(id =>
      axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { timeout: 10000 })
        .then(res => res.data)
        .catch(() => null)
    );

    const stories = await Promise.all(storyPromises);

    for (const story of stories) {
      if (!story || !story.title) continue;

      const titleLower = story.title.toLowerCase();
      const isAIRelated = aiKeywords.some(kw => titleLower.includes(kw));

      if (isAIRelated && items.length < 5) {
        items.push({
          title: story.title,
          summary: story.title,
          date: new Date(story.time * 1000).toLocaleDateString(),
          source: 'Hacker News'
        });
      }
    }

    console.log(`  Found ${items.length} AI stories`);
    return items;
  } catch (error) {
    console.error('Error fetching Hacker News:', error.message);
    return [];
  }
}

/**
 * Fetch arXiv CS.AI papers (RSS)
 
async function fetchArxivAI() {
  console.log('Fetching arXiv AI papers...');
  return fetchRSSFeed(
    'https://export.arxiv.org/rss/cs.AI',
    'arXiv CS.AI',
    3
  );
}
*/
// ============================================================================
// AXIOS NEWSLETTERS (via Kill The Newsletter)
// ============================================================================

/**
 * Fetch Axios newsletters via Kill The Newsletter feed
 * Sources: Axios Chicago, Axios Future of Energy, Axios AI,
 *          Axios Daily Essentials, Axios PM, Axios Finish Line
 * Filters for items published/updated today
 */
async function fetchKillTheNewsletter(feedUrl) {
  console.log('Fetching Axios newsletters (via Kill The Newsletter)...');

  // Use provided URL or fall back to default
  const url = feedUrl || 'https://kill-the-newsletter.com/feeds/fs23gw6u0bqlwqmjs3fj.xml';

  try {
    const { data } = await axios.get(
      url,
      {
        headers: { 'User-Agent': USER_AGENT },
        timeout: 10000
      }
    );

    const $ = cheerio.load(data, { xmlMode: true });
    const items = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today

    $('item, entry').each((_, el) => {
      const title = $(el).find('title').text().trim();
      const description = $(el).find('description, summary, content').first().text().trim()
        .replace(/<[^>]*>/g, '')
        .slice(0, 300);

      // Try multiple date field names (RSS 2.0, Atom, custom)
      const pubDateText = $(el).find('pubDate, published, updated, date').first().text().trim();

      if (!title || !pubDateText) return;

      const pubDate = new Date(pubDateText);
      pubDate.setHours(0, 0, 0, 0);

      // Only include items from today
      if (pubDate.getTime() === today.getTime()) {
        items.push({
          title,
          summary: description || title,
          date: pubDateText,
          source: 'Axios Newsletters'
        });
      }
    });

    console.log(`  Found ${items.length} newsletter items from today`);
    return items;
  } catch (error) {
    console.error('Error fetching Axios newsletters:', error.message);
    return [];
  }
}

// ============================================================================
// MAIN EXPORT FUNCTIONS
// ============================================================================

/**
 * Fetch all Databricks content
 
async function fetchDatabricksContent() {
  const [releaseNotes, blog, newsroom, execTweets] = await Promise.all([
    fetchDatabricksReleaseNotes(),
    fetchDatabricksBlog(),
    fetchDatabricksNewsroom(),
    fetchDatabricksExecTweets()
  ]);

  return {
    items: [...releaseNotes, ...blog, ...newsroom, ...execTweets.items],
    twitterApiCalls: execTweets.apiCalls
  };
}
*/
/**
 * Fetch all AI/ML news
 * @param {Object} config - Configuration object with content.aiNews settings
 * @returns {Promise<Array>} Array of news items
 */
async function fetchAINews(config) {
  // Check if AI news is enabled
  if (config?.content?.aiNews?.enabled === false) {
    console.log('AI news fetching disabled by configuration');
    return [];
  }

  // Define source mapping
  const sourceMap = {
    'openai': fetchOpenAIBlog,
    'anthropic': fetchAnthropicNews,
    'deepmind': fetchDeepMindBlog,
    'meta': fetchMetaAIBlog,
    'verge': fetchVergeAI,
    'techcrunch': fetchTechCrunchAI,
    'venturebeat': fetchVentureBeatAI,
    'hackernews': fetchHackerNewsAI
  };

  // Get enabled sources from config, or use all by default
  const enabledSources = config?.content?.aiNews?.sources || Object.keys(sourceMap);

  // Build promise array for enabled sources
  const promises = enabledSources
    .filter(source => sourceMap[source.toLowerCase()])
    .map(source => sourceMap[source.toLowerCase()]());

  const results = await Promise.all(promises);

  return results.flat();
}

/**
 * Fetch Axios newsletters (Chicago, Energy, AI, Politics, General)
 * @param {Object} config - Configuration object with content.newsletters settings
 * @returns {Promise<Array>} Array of newsletter items
 */
async function fetchNewsletters(config) {
  // Check if newsletters are enabled
  if (config?.content?.newsletters?.enabled === false) {
    console.log('Newsletters fetching disabled by configuration');
    return [];
  }

  const killTheNewsletter = await fetchKillTheNewsletter(config?.content?.newsletters?.killTheNewsletterFeedUrl);
  return killTheNewsletter;
}

/**
 * Fetch article content from links in RSS feed and summarize with Gemini
 * @param {Object} config - Configuration object
 * @param {Object} episodeMemory - Episode memory to check for previously covered articles
 * @returns {Promise<Object>} Articles and usage data
 */
async function fetchArticles(config, episodeMemory) {
  if (!config?.content?.articles?.enabled) {
    return { items: [], usage: null };
  }

  console.log('Fetching articles from RSS feed...');

  try {
    const articlesConfig = config.content.articles;
    const maxPerEpisode = articlesConfig.maxPerEpisode || 2;

    // Build list of feed sources: legacy KTN URL + any direct feeds[]
    const feedSources = [];
    if (articlesConfig.killTheNewsletterFeedUrl) {
      feedSources.push({ url: articlesConfig.killTheNewsletterFeedUrl, name: 'Kill The Newsletter', maxItems: maxPerEpisode });
    }
    if (Array.isArray(articlesConfig.feeds)) {
      for (const feed of articlesConfig.feeds) {
        feedSources.push({ url: feed.url, name: feed.name || feed.url, maxItems: feed.maxItems ?? maxPerEpisode });
      }
    }

    if (feedSources.length === 0) {
      console.log('  No article feed sources configured');
      return { items: [], usage: null };
    }

    // Collect article links from all feed sources, respecting per-feed maxItems
    const allArticleLinks = [];

    for (const feedSource of feedSources) {
      let feedData;
      try {
        const response = await axios.get(feedSource.url, {
          headers: { 'User-Agent': USER_AGENT },
          timeout: 10000
        });
        feedData = response.data;
      } catch (feedError) {
        console.error(`  Failed to fetch feed "${feedSource.name}": ${feedError.message}`);
        continue;
      }

      const $ = cheerio.load(feedData, { xmlMode: true });
      let entries = $('item');
      let isAtom = false;

      if (entries.length === 0) {
        entries = $('entry');
        isAtom = true;
      }

      const feedLinks = [];
      entries.each((_, el) => {
        const title = $(el).find('title').text().trim();
        let link = '';

        if (isAtom) {
          // For Atom feeds, extract link from content HTML (handle entity-encoded quotes)
          const content = $(el).find('content').html() || '';
          const linkMatch = content.match(/href=(?:&quot;|["'])([^&"']+)(?:&quot;|["'])/);
          if (linkMatch) {
            link = linkMatch[1];
            link = link.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
          }
        } else {
          // For standard RSS feeds, get link element
          link = $(el).find('link').text().trim();
        }

        if (title && link && !link.includes('kill-the-newsletter.com/feeds')) {
          if (!hasArticleBeenCovered(episodeMemory, title, 30)) {
            feedLinks.push({ title, link, source: feedSource.name });
          } else {
            console.log(`  Skipping previously covered article: ${title}`);
          }
        }
      });

      // Apply per-feed cap before adding to global pool
      allArticleLinks.push(...feedLinks.slice(0, feedSource.maxItems));
    }

    if (allArticleLinks.length === 0) {
      console.log('  No new articles found');
      return { items: [], usage: null };
    }

    // Apply global cap across all sources
    const articlesToFetch = allArticleLinks.slice(0, maxPerEpisode);
    console.log(`  Found ${articlesToFetch.length} new article(s) to analyze`);

    if (!modelFlash) {
      console.log('  Gemini not available, skipping article analysis');
      return { items: [], usage: null };
    }

    // Fetch and summarize each article
    const articles = [];
    let totalPromptTokens = 0;
    let totalCandidatesTokens = 0;

    for (const { title, link, source: articleSource } of articlesToFetch) {
      try {
        console.log(`  Fetching article: ${title}`);

        // Fetch article web page
        const articleResponse = await axios.get(link, {
          headers: { 'User-Agent': USER_AGENT },
          timeout: 15000
        });

        // Extract article content
        const $page = cheerio.load(articleResponse.data);

        // Remove scripts, styles, nav, headers, footers
        $page('script, style, nav, header, footer, aside, .ad, .advertisement').remove();

        // Try to find article content (common selectors)
        let articleText = '';
        const contentSelectors = ['article', 'main', '.post-content', '.article-content', '.entry-content', 'body'];

        for (const selector of contentSelectors) {
          const content = $page(selector).first().text().trim();
          if (content.length > 500) {
            articleText = content;
            break;
          }
        }

        // Fallback to body if no content found
        if (!articleText) {
          articleText = $page('body').text().trim();
        }

        // Clean up whitespace
        articleText = articleText
          .replace(/\s+/g, ' ')
          .replace(/\n+/g, '\n')
          .trim()
          .slice(0, 15000); // Limit to ~15k chars to stay within context limits

        if (articleText.length < 200) {
          console.log(`  ⚠️  Article content too short, skipping: ${title}`);
          continue;
        }

        // Summarize with Gemini
        const prompt = `You are analyzing an article for in-depth discussion on a daily podcast.

Article Title: ${title}
Article URL: ${link}

Article Content:
${articleText}

Provide a comprehensive analysis including:
1. Main thesis or argument (2-3 sentences)
2. Key supporting points or evidence (3-4 bullet points)
3. Potential counterarguments or limitations
4. Why this matters / implications (1-2 sentences)
5. Discussion angles for podcast hosts (2-3 thought-provoking questions or angles)

Format as structured text (not JSON), keeping it conversational and suitable for podcast discussion.`;

        const result = await modelFlash.generateContent(prompt);
        const response = await result.response;
        const analysis = response.text().trim();
        const usage = response.usageMetadata;

        totalPromptTokens += usage.promptTokenCount || 0;
        totalCandidatesTokens += usage.candidatesTokenCount || 0;

        articles.push({
          title,
          link,
          analysis,
          source: articleSource || 'Curated Articles'
        });

        console.log(`  ✅ Analyzed: ${title}`);

      } catch (articleError) {
        console.error(`  ❌ Failed to fetch/analyze article "${title}":`, articleError.message);
        continue;
      }
    }

    return {
      items: articles,
      usage: articles.length > 0 ? {
        geminiFlash: {
          promptTokens: totalPromptTokens,
          candidatesTokens: totalCandidatesTokens
        }
      } : null
    };

  } catch (error) {
    console.error('Error fetching articles:', error.message);
    return { items: [], usage: null };
  }
}

/**
 * Fetch all additional sourcing (Sports, Real Estate, Iran, Surf, Olympics, World Cup)
 * @param {Object} config - Configuration object with content settings
 * @returns {Promise<Object>} Object with items and usage data
 */
async function fetchAdditionalSourcing(config) {
  const promises = [];
  const results = {};

  // Fetch Real Estate if enabled
  if (config?.content?.realEstate?.enabled) {
    promises.push(
      fetchRealEstateNews(config.content.realEstate).then(res => {
        results.realEstate = res;
      })
    );
  }

  // Fetch Sports if enabled
  if (config?.content?.sports?.enabled) {
    const teams = config.content.sports.teams || [];

    // Fetch game recaps
    const sportsPromises = teams.map(team => fetchSportsGame(team.league, team.name, team.espnApiName));
    promises.push(
      Promise.all(sportsPromises).then(sportsResults => {
        results.sports = sportsResults;
      })
    );

    // Fetch team news if enabled
    if (config.content.sports.includeTeamNews) {
      const teamNewsPromises = teams
        .filter(team => team.espnNewsId)
        .map(team => fetchTeamNews(team.league, team.name, team.espnNewsId));

      promises.push(
        Promise.all(teamNewsPromises).then(newsResults => {
          results.teamNews = newsResults;
        })
      );
    }

    // Fetch team RSS feeds if provided (narrative/analysis content)
    const teamsWithRSS = teams.filter(team => team.rssFeedUrl);
    if (teamsWithRSS.length > 0) {
      const teamRSSPromises = teamsWithRSS.map(team =>
        fetchTeamRSSFeed(team.name, team.rssFeedUrl, 3)
      );

      promises.push(
        Promise.all(teamRSSPromises).then(rssResults => {
          results.teamRSS = rssResults;
        })
      );
    }
  }

  // Fetch Iran international relations if enabled
  if (config?.content?.internationalRelations?.enabled) {
    promises.push(
      fetchIranNews().then(res => {
        results.iran = res;
      })
    );
  }

  // Fetch general news feeds if enabled
  if (config?.content?.news?.enabled) {
    promises.push(
      fetchNewsFeeds(config.content.news).then(res => {
        results.news = res;
      })
    );
  }

  // Fetch Surf Conditions if enabled
  if (config?.content?.surfConditions?.enabled) {
    promises.push(
      fetchSurflineConditions(
        config.content.surfConditions.spotIds,
        config.content.surfConditions.location
      ).then(res => {
        results.surf = res;
      })
    );
  }

  // Fetch Olympics if enabled and active
  if (config?.content?.sports?.events) {
    const olympicsEvent = config.content.sports.events.find(e => e.type === 'olympics');
    if (olympicsEvent?.enabled) {
      const olympicsStatus = areOlympicsActive();
      if (!olympicsEvent.onlyDuringEvent || olympicsStatus.active) {
        promises.push(
          fetchOlympicsUpdates().then(res => {
            results.olympics = res;
          })
        );
      }
    }
  }

  // Fetch World Cup if enabled and active
  if (config?.content?.sports?.events) {
    const worldcupEvent = config.content.sports.events.find(e => e.type === 'worldcup');
    if (worldcupEvent?.enabled) {
      const worldcupStatus = isWorldCupActive();
      if (!worldcupEvent.onlyDuringEvent || worldcupStatus.active) {
        promises.push(
          fetchWorldCupUpdates().then(res => {
            results.worldcup = res;
          })
        );
      }
    }
  }

  // Wait for all promises to resolve
  await Promise.all(promises);

  // Build items object
  const items = {
    realEstate: results.realEstate?.items || [],
    sports: [],
    iran: results.iran?.items || [],
    news: results.news?.items || [],
    surf: results.surf ? [{ title: 'Surf Conditions', summary: results.surf.summary, source: 'Surfline' }] : [],
    olympics: results.olympics ? [{ title: 'Olympics Update', summary: results.olympics.summary, source: 'Olympics' }] : [],
    worldcup: results.worldcup ? [{ title: 'World Cup Update', summary: results.worldcup.summary, source: 'World Cup' }] : []
  };

  // Flatten sports game results
  if (results.sports) {
    for (const sportResult of results.sports) {
      items.sports.push(...(sportResult.items || []));
    }
  }

  // Flatten team news results
  if (results.teamNews) {
    for (const newsResult of results.teamNews) {
      items.sports.push(...(newsResult.items || []));
    }
  }

  // Flatten team RSS results
  if (results.teamRSS) {
    for (const rssResult of results.teamRSS) {
      items.sports.push(...(rssResult.items || []));
    }
  }

  // Combine usage
  const usage = {
    geminiFlash: {
      promptTokens: 0,
      candidatesTokens: 0
    }
  };

  // Add real estate usage
  if (results.realEstate?.usage?.geminiFlash) {
    usage.geminiFlash.promptTokens += results.realEstate.usage.geminiFlash.promptTokens || 0;
    usage.geminiFlash.candidatesTokens += results.realEstate.usage.geminiFlash.candidatesTokens || 0;
  }

  // Add sports usage
  if (results.sports) {
    for (const sportResult of results.sports) {
      if (sportResult.usage?.geminiFlash) {
        usage.geminiFlash.promptTokens += sportResult.usage.geminiFlash.promptTokens || 0;
        usage.geminiFlash.candidatesTokens += sportResult.usage.geminiFlash.candidatesTokens || 0;
      }
    }
  }

  // Add team news usage
  if (results.teamNews) {
    for (const newsResult of results.teamNews) {
      if (newsResult.usage?.geminiFlash) {
        usage.geminiFlash.promptTokens += newsResult.usage.geminiFlash.promptTokens || 0;
        usage.geminiFlash.candidatesTokens += newsResult.usage.geminiFlash.candidatesTokens || 0;
      }
    }
  }

  // Add team RSS usage
  if (results.teamRSS) {
    for (const rssResult of results.teamRSS) {
      if (rssResult.usage?.geminiFlash) {
        usage.geminiFlash.promptTokens += rssResult.usage.geminiFlash.promptTokens || 0;
        usage.geminiFlash.candidatesTokens += rssResult.usage.geminiFlash.candidatesTokens || 0;
      }
    }
  }

  // Add news feeds usage
  if (results.news?.usage?.geminiFlash) {
    usage.geminiFlash.promptTokens += results.news.usage.geminiFlash.promptTokens || 0;
    usage.geminiFlash.candidatesTokens += results.news.usage.geminiFlash.candidatesTokens || 0;
  }

  return { items, usage };
}

module.exports = {
  fetchAINews,
  fetchNewsletters,
  fetchAdditionalSourcing,
  fetchArticles,
  // Legacy functions kept for backward compatibility
  fetchRealEstateNews,
  fetchWarriorsGame,
  fetchGiantsGame,
  fetchNinersGame,
  fetchIranNews,
  fetchSportsGame,
  fetchTeamNews,
  fetchNewsFeeds
};
