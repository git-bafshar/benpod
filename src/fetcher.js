/**
 * Content Fetcher
 *
 * Fetches content from Databricks and AI/ML news sources
 */

const axios = require('axios');
const cheerio = require('cheerio');

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

// ============================================================================
// DATABRICKS SOURCES
// ============================================================================

/**
 * Fetch recent Databricks release notes
 */
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

/**
 * Fetch recent Databricks blog posts (RSS)
 */
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

/**
 * Fetch Databricks newsroom (press releases & announcements)
 */
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

/**
 * Fetch tweets from Databricks exec team
 * Includes: Ali Ghodsi (CEO), Reynold Xin (Chief Architect), Matei Zaharia (CTO)
 * Requires TWITTER_BEARER_TOKEN environment variable
 */
async function fetchDatabricksExecTweets() {
  const token = process.env.TWITTER_BEARER_TOKEN;

  if (!token) {
    console.log('  Skipping Twitter (no TWITTER_BEARER_TOKEN set)');
    return [];
  }

  console.log('Fetching Databricks exec tweets...');

  try {
    // Databricks co-founders and executive team Twitter handles
    const users = ['alighodsi', 'rxin', 'matei_zaharia'];
    const items = [];

    for (const username of users) {
      try {
        // Get user ID first
        const userRes = await axios.get(
          `https://api.twitter.com/2/users/by/username/${username}`,
          { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
        );
        const userId = userRes.data.data.id;

        // Get recent tweets
        const tweetsRes = await axios.get(
          `https://api.twitter.com/2/users/${userId}/tweets?max_results=10&tweet.fields=created_at`,
          { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
        );

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

    console.log(`  Found ${items.length} exec tweets`);
    return items;
  } catch (error) {
    console.error('Error fetching exec tweets:', error.message);
    return [];
  }
}

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
 */
async function fetchArxivAI() {
  console.log('Fetching arXiv AI papers...');
  return fetchRSSFeed(
    'https://export.arxiv.org/rss/cs.AI',
    'arXiv CS.AI',
    3
  );
}

// ============================================================================
// MAIN EXPORT FUNCTIONS
// ============================================================================

/**
 * Fetch all Databricks content
 */
async function fetchDatabricksContent() {
  const [releaseNotes, blog, newsroom, execTweets] = await Promise.all([
    fetchDatabricksReleaseNotes(),
    fetchDatabricksBlog(),
    fetchDatabricksNewsroom(),
    fetchDatabricksExecTweets()
  ]);

  return [...releaseNotes, ...blog, ...newsroom, ...execTweets];
}

/**
 * Fetch all AI/ML news
 */
async function fetchAINews() {
  const [
    openai, anthropic, deepmind, meta,
    verge, techcrunch, venturebeat,
    hn, arxiv
  ] = await Promise.all([
    fetchOpenAIBlog(),
    fetchAnthropicNews(),
    fetchDeepMindBlog(),
    fetchMetaAIBlog(),
    fetchVergeAI(),
    fetchTechCrunchAI(),
    fetchVentureBeatAI(),
    fetchHackerNewsAI(),
    fetchArxivAI()
  ]);

  return [...openai, ...anthropic, ...deepmind, ...meta, ...verge, ...techcrunch, ...venturebeat, ...hn, ...arxiv];
}

module.exports = {
  fetchDatabricksReleaseNotes,
  fetchDatabricksBlog,
  fetchDatabricksContent,
  fetchAINews
};
