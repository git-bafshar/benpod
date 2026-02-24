/**
 * Content Fetcher
 *
 * Fetches content from Databricks and AI/ML news sources
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');

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
async function fetchRealEstateNews() {
  console.log('Fetching Real Estate news...');
  const feeds = [
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
  const prompt = `
Act as a real estate data analyst and article summarizer. Analyze the provided RSS feed text and extract information strictly related to the following categories to be used in a short podcast segment on market conditions.

Extraction Categories:
1. Mortgage Rates: Any specific percentages, year-over-year changes, or forecasted movements.
2. Target Price Bracket ($600k–$1.5m): Any mention of 'mid-to-high tier,' 'luxury,' or specific data points involving these price ranges.
3. Geographic Specifics: Explicit data for California, Chicago (specifically north shore suburbs), and Montana.
4. Market Dynamics: Evidence of buyer leverage (e.g., inventory levels, price cuts, concessions) and emerging national trends.

Strict Constraints:
- No Inference: Only report what is explicitly stated in the text. If a category (e.g., Montana or the $600k-$1.5m bracket) is not mentioned, explicitly state 'No data available for this topic.'

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
async function fetchKillTheNewsletter() {
  console.log('Fetching Axios newsletters (via Kill The Newsletter)...');

  try {
    const { data } = await axios.get(
      'https://kill-the-newsletter.com/feeds/fs23gw6u0bqlwqmjs3fj.xml',
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
 */
async function fetchAINews() {
  const [
    openai, anthropic, deepmind, meta,
    verge, techcrunch, venturebeat,
    hn
  ] = await Promise.all([
    fetchOpenAIBlog(),
    fetchAnthropicNews(),
    fetchDeepMindBlog(),
    fetchMetaAIBlog(),
    fetchVergeAI(),
    fetchTechCrunchAI(),
    fetchVentureBeatAI(),
    fetchHackerNewsAI()
  ]);

  return [...openai, ...anthropic, ...deepmind, ...meta, ...verge, ...techcrunch, ...venturebeat, ...hn];
}

/**
 * Fetch Axios newsletters (Chicago, Energy, AI, Politics, General)
 */
async function fetchNewsletters() {
  const killTheNewsletter = await fetchKillTheNewsletter();
  return killTheNewsletter;
}

/**
 * Fetch all additional sourcing (Sports, Real Estate, Iran)
 */
async function fetchAdditionalSourcing() {
  const [realEstate, warriors, niners, giants, iran] = await Promise.all([
    fetchRealEstateNews(),
    fetchWarriorsGame(),
    fetchNinersGame(),
    fetchGiantsGame(),
    fetchIranNews()
  ]);

  const items = {
    realEstate: realEstate.items,
    sports: [...warriors.items, ...niners.items, ...giants.items],
    iran: iran.items
  };

  // Combine usage
  const usage = {
    geminiFlash: {
      promptTokens: (realEstate.usage?.geminiFlash?.promptTokens || 0) +
                   (warriors.usage?.geminiFlash?.promptTokens || 0) +
                   (niners.usage?.geminiFlash?.promptTokens || 0) +
                   (giants.usage?.geminiFlash?.promptTokens || 0),
      candidatesTokens: (realEstate.usage?.geminiFlash?.candidatesTokens || 0) +
                       (warriors.usage?.geminiFlash?.candidatesTokens || 0) +
                       (niners.usage?.geminiFlash?.candidatesTokens || 0) +
                       (giants.usage?.geminiFlash?.candidatesTokens || 0)
    }
  };

  return { items, usage };
}

module.exports = {
  /**fetchDatabricksReleaseNotes,
  fetchDatabricksBlog,
  fetchDatabricksContent,*/
  fetchAINews,
  fetchNewsletters,
  fetchRealEstateNews,
  fetchWarriorsGame,
  fetchGiantsGame,
  fetchIranNews,
  fetchAdditionalSourcing
};
