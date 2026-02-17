/**
 * Content Fetcher
 *
 * Fetches content from:
 * - Databricks release notes
 * - Databricks blog
 * - AI news sources (Hacker News, RSS feeds)
 */

const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Fetch recent Databricks release notes
 */
async function fetchDatabricksReleaseNotes() {
  console.log('Fetching Databricks release notes...');

  try {
    const { data } = await axios.get('https://docs.databricks.com/en/release-notes/index.html', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(data);
    const items = [];

    // Find recent release note entries
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
 * Fetch recent Databricks blog posts
 */
async function fetchDatabricksBlog() {
  console.log('Fetching Databricks blog posts...');

  try {
    // Databricks blog RSS feed
    const { data } = await axios.get('https://www.databricks.com/feed', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(data, { xmlMode: true });
    const items = [];

    // Parse RSS feed
    $('item').slice(0, 5).each((_, el) => {
      const title = $(el).find('title').text().trim();
      const description = $(el).find('description').text().trim()
        .replace(/<[^>]*>/g, '') // Strip HTML tags
        .slice(0, 300);
      const pubDate = $(el).find('pubDate').text().trim();

      if (title) {
        items.push({
          title,
          summary: description,
          date: pubDate,
          source: 'Databricks Blog'
        });
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
 * Fetch AI news from Hacker News
 */
async function fetchHackerNewsAI() {
  console.log('Fetching Hacker News AI stories...');

  try {
    // Get top stories
    const { data: topStories } = await axios.get(
      'https://hacker-news.firebaseio.com/v0/topstories.json'
    );

    const items = [];
    const aiKeywords = ['ai', 'ml', 'machine learning', 'deep learning', 'llm', 'gpt',
                        'neural', 'artificial intelligence', 'openai', 'anthropic', 'claude'];

    // Fetch details for top 30 stories
    const storyPromises = topStories.slice(0, 30).map(id =>
      axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
        .then(res => res.data)
        .catch(() => null)
    );

    const stories = await Promise.all(storyPromises);

    // Filter for AI-related stories
    for (const story of stories) {
      if (!story || !story.title) continue;

      const titleLower = story.title.toLowerCase();
      const isAIRelated = aiKeywords.some(kw => titleLower.includes(kw));

      if (isAIRelated && items.length < 5) {
        items.push({
          title: story.title,
          summary: story.title, // HN doesn't have summaries
          date: new Date(story.time * 1000).toLocaleDateString(),
          source: 'Hacker News',
          url: story.url || `https://news.ycombinator.com/item?id=${story.id}`
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
 * Fetch AI news from arXiv CS.AI RSS
 */
async function fetchArxivAI() {
  console.log('Fetching arXiv AI papers...');

  try {
    const { data } = await axios.get('http://export.arxiv.org/rss/cs.AI', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(data, { xmlMode: true });
    const items = [];

    // Parse RSS feed
    $('item').slice(0, 3).each((_, el) => {
      const title = $(el).find('title').text().trim();
      const description = $(el).find('description').text().trim()
        .replace(/<[^>]*>/g, '')
        .slice(0, 300);
      const pubDate = $(el).find('pubDate').text().trim();

      if (title) {
        items.push({
          title,
          summary: description,
          date: pubDate,
          source: 'arXiv CS.AI'
        });
      }
    });

    console.log(`  Found ${items.length} papers`);
    return items;
  } catch (error) {
    console.error('Error fetching arXiv:', error.message);
    return [];
  }
}

/**
 * Fetch all AI news
 */
async function fetchAINews() {
  const [hnStories, arxivPapers] = await Promise.all([
    fetchHackerNewsAI(),
    fetchArxivAI()
  ]);

  return [...hnStories, ...arxivPapers];
}

module.exports = {
  fetchDatabricksReleaseNotes,
  fetchDatabricksBlog,
  fetchAINews
};
