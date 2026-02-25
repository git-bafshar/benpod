/**
 * Daily AI Audio Briefing - Main Orchestrator
 *
 * Orchestrates the full pipeline:
 * 1. Fetch content from multiple sources
 * 2. Synthesize script with Claude
 * 3. Convert to audio with TTS
 * 4. Publish to GitHub Pages with RSS feed
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const { loadConfig } = require('./config');
const { fetchAINews, fetchNewsletters, fetchAdditionalSourcing, fetchArticles } = require('./fetcher');
const { synthesizeScript } = require('./synthesizer');
const { convertToAudio } = require('./tts');
const { buildUpdatedFeed } = require('./publisher');
const { publishEpisode } = require('./githubCommitter');
const { CostTracker } = require('./costTracker');
const { updateTTSUsage } = require('./ttsUsageTracker');
const {
  getEpisodeMemory,
  commitEpisodeMemory,
  extractKeyTopics,
  addEpisodeToMemory,
  formatMemoryForPrompt,
} = require('./episodeMemory');

const BASE_URL = process.env.PAGES_BASE_URL;
const REPO = process.env.GITHUB_REPOSITORY;
const GH_TOKEN = process.env.GITHUB_TOKEN;

/**
 * Get current feed from gh-pages branch
 * @param {string} feedFile - Feed filename from config (e.g., 'feed.xml', 'matchmass.xml')
 */
async function getCurrentFeed(feedFile) {
  try {
    const response = await axios.get(
      `https://api.github.com/repos/${REPO}/contents/${feedFile}?ref=gh-pages`,
      {
        headers: {
          Authorization: `Bearer ${GH_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );
    return Buffer.from(response.data.content, 'base64').toString('utf-8');
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log(`  No existing ${feedFile} found (first run)`);
      return ''; // First run
    }
    throw error;
  }
}

async function run({ dryRun = false, config = null } = {}) {
  console.log('='.repeat(60));
  console.log(`Starting ${config.metadata.title} Pipeline`);
  console.log('='.repeat(60));
  console.log();

  if (!dryRun) {
    const required = ['PAGES_BASE_URL', 'GITHUB_REPOSITORY', 'GITHUB_TOKEN'];
    const missing = required.filter(k => !process.env[k]);
    if (missing.length) throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  const startTime = Date.now();
  const costTracker = new CostTracker();

  try {
    // 1. Fetch content from all sources
    console.log('STEP 1: Fetching content from sources...');
    console.log();

    const [aiNews, newsletters, additionalSourcingData] = await Promise.all([
      fetchAINews(config),
      fetchNewsletters(config),
      fetchAdditionalSourcing(config)
    ]);

    const { items: additionalSourcing, usage: fetcherUsage } = additionalSourcingData;

    const contentBundle = {
      aiNews: aiNews,
      newsletters: newsletters,
      additionalSourcing: additionalSourcing
    };

    const totalItems = aiNews.length + newsletters.length + 
                     additionalSourcing.realEstate.length + 
                     additionalSourcing.sports.length + 
                     additionalSourcing.iran.length;
    console.log();
    console.log(`  Total items collected: ${totalItems}`);

    // Track fetcher-level LLM costs
    if (fetcherUsage && (fetcherUsage.geminiFlash?.promptTokens > 0)) {
      const fetcherCost = costTracker.trackGemini(fetcherUsage);
      console.log(`  💰 Fetcher LLM cost: $${fetcherCost.totalCost.toFixed(4)}`);
    }
    console.log();

    // 1.5. Fetch episode memory for cross-episode continuity
    console.log('STEP 1.5: Fetching episode memory...');
    let episodeMemoryData = { episodes: [] };
    let episodeMemorySha = null;
    let episodeMemoryForPrompt = '';

    try {
      const { data, sha } = await getEpisodeMemory(config);
      episodeMemoryData = data;
      episodeMemorySha = sha;
      episodeMemoryForPrompt = formatMemoryForPrompt(data, 7);
      const count = data.episodes.length;
      console.log(`  Loaded ${count} episode${count !== 1 ? 's' : ''} from memory`);
    } catch (err) {
      console.error(`  Warning: could not load episode memory: ${err.message}`);
      console.error('  Continuing without cross-episode context.');
    }
    console.log();

    // 1.6. Fetch articles for in-depth discussion (after episode memory is loaded)
    let articlesData = { items: [], usage: null };
    if (config?.content?.articles?.enabled) {
      console.log('STEP 1.6: Fetching articles for in-depth discussion...');
      console.log();
      articlesData = await fetchArticles(config, episodeMemoryData);

      if (articlesData.items.length > 0) {
        console.log(`  Found ${articlesData.items.length} article(s) for discussion`);
      }

      // Track article fetching costs
      if (articlesData.usage && articlesData.usage.geminiFlash?.promptTokens > 0) {
        const articleCost = costTracker.trackGemini(articlesData.usage);
        console.log(`  💰 Article analysis cost: $${articleCost.totalCost.toFixed(4)}`);
      }
      console.log();
    }

    // Add articles to content bundle
    contentBundle.articles = articlesData.items;

    // 2. Synthesize script with Claude/Gemini
    console.log('STEP 2: Synthesizing audio script...');
    console.log();

    const { script, summary, usage: synthesizerUsage } = await synthesizeScript(
      contentBundle,
      episodeMemoryForPrompt || null,
      config
    );
    const wordCount = script.split(/\s+/).length;

    // Track LLM costs (handles Claude or Gemini)
    if (synthesizerUsage.geminiPro || synthesizerUsage.geminiFlash || synthesizerUsage.gemini2Flash || synthesizerUsage.gemini25Flash) {
      const geminiCost = costTracker.trackGemini(synthesizerUsage);
      console.log(`  💰 Gemini cost: $${geminiCost.totalCost.toFixed(4)}`);
    } else {
      const claudeCost = costTracker.trackClaude(synthesizerUsage.inputTokens, synthesizerUsage.outputTokens);
      console.log(`  💰 Claude cost: $${claudeCost.totalCost.toFixed(4)} (${synthesizerUsage.inputTokens} in + ${synthesizerUsage.outputTokens} out tokens)`);
    }
    console.log();

    // Get current time in podcast's timezone
    const now = new Date();
    const localTime = new Date(now.toLocaleString('en-US', { timeZone: config.location.timezone }));
    const dateStr = localTime.toISOString().slice(0, 10); // YYYY-MM-DD in local time

    // Save script to file for reference
    const scriptFileName = `${config.id}-${dateStr}-script.txt`;
    const scriptPath = path.join('/tmp', scriptFileName);
    fs.writeFileSync(scriptPath, script, 'utf8');
    console.log(`  Script saved to: ${scriptPath}`);
    console.log();

    // 3. Convert to audio
    console.log('STEP 3: Converting to audio...');
    console.log();

    const episodeFileName = `${config.id}-${dateStr}.mp3`;
    const audioPath = path.join('/tmp', episodeFileName);
    const { outputPath: finalAudioPath, characters: ttsCharacters } = await convertToAudio(script, audioPath, config);

    // Track TTS costs (Journey-D is a WaveNet/Neural voice)
    const ttsCost = costTracker.trackTTS(ttsCharacters, 'wavenet');
    console.log(`  💰 TTS cost: $${ttsCost.cost.toFixed(4)} (${ttsCharacters} characters)`);
    console.log();

    if (!fs.existsSync(finalAudioPath)) {
      throw new Error(`Audio file not created by TTS conversion: ${finalAudioPath}`);
    }
    const fileSizeBytes = fs.statSync(finalAudioPath).size;
    // Estimate duration: MP3 at 128 kbps = (fileSize * 8 bits) / (128,000 bits/sec)
    const durationSeconds = Math.round((fileSizeBytes * 8) / (128 * 1000));

    if (dryRun) {
      // Dry run — skip RSS and publishing
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log('='.repeat(60));
      console.log('DRY RUN COMPLETE (no publish)');
      console.log('='.repeat(60));
      console.log(`  Duration: ${duration}s`);
      console.log(`  Items processed: ${totalItems}`);
      console.log(`  Script words: ${wordCount}`);
      console.log(`  Script file: ${scriptPath}`);
      console.log(`  Audio file: ${finalAudioPath}`);
      console.log();
      costTracker.printSummary();
      costTracker.logToFile('/tmp/podcast-costs.jsonl');
      return;
    }

    // 4. Build updated RSS feed
    console.log('STEP 4: Building RSS feed...');
    console.log();

    const existingFeed = await getCurrentFeed(config.paths.feedFile);
    const updatedFeed = buildUpdatedFeed(
      existingFeed,
      {
        title: `${config.metadata.title} — ${dateStr}`,
        date: dateStr,
        fileName: episodeFileName,
        fileSizeBytes,
        durationSeconds,
        description: summary,
      },
      BASE_URL,
      {
        title: config.metadata.title,
        author: config.metadata.author,
        description: config.metadata.description,
        email: config.metadata.email,
      },
      config
    );

    console.log('  Feed updated successfully');
    console.log();

    // 5. Publish to GitHub Pages
    console.log('STEP 5: Publishing to GitHub Pages...');
    console.log();

    await publishEpisode(finalAudioPath, updatedFeed, episodeFileName, config);

    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('='.repeat(60));
    console.log('PIPELINE COMPLETE!');
    console.log('='.repeat(60));
    console.log(`  Duration: ${duration}s`);
    console.log(`  Items processed: ${totalItems}`);
    console.log(`  Script words: ${wordCount}`);
    console.log(`  Audio file: ${episodeFileName}`);
    console.log(`  Episode URL: ${BASE_URL}/${config.paths.episodesDir}/${episodeFileName}`);
    console.log(`  RSS feed: ${BASE_URL}/${config.paths.feedFile}`);
    console.log();
    console.log('Episode published! Subscribe in your podcast app:');
    console.log(`   ${BASE_URL}/${config.paths.feedFile}`);

    // 5.5. Extract key topics and update episode memory on gh-pages
    console.log('Updating episode memory...');
    try {
      const { topics: keyTopics, usage: topicsUsage } = await extractKeyTopics(script);

      // Include article titles in memory to prevent duplicates
      const articleTitles = articlesData.items.map(article => article.title);
      const newRecord = {
        date: dateStr,
        summary,
        keyTopics,
        ...(articleTitles.length > 0 && { articles: articleTitles })
      };

      const updatedMemory = addEpisodeToMemory(episodeMemoryData, newRecord);
      await commitEpisodeMemory(updatedMemory, episodeMemorySha, config);

      const memoryMsg = `${keyTopics.length} topics extracted`;
      const articlesMsg = articleTitles.length > 0 ? `, ${articleTitles.length} article(s) recorded` : '';
      console.log(`  Memory updated: ${memoryMsg}${articlesMsg} for ${dateStr}`);
      if (topicsUsage) {
        if (topicsUsage.geminiFlash || topicsUsage.gemini2Flash || topicsUsage.gemini25Flash) {
          const topicsCost = costTracker.trackGemini(topicsUsage);
          console.log(`  Memory topics cost (Gemini): $${topicsCost.totalCost.toFixed(4)}`);
        } else {
          const topicsCost = costTracker.trackClaude(topicsUsage.inputTokens, topicsUsage.outputTokens);
          console.log(`  Memory topics cost (Claude): $${topicsCost.totalCost.toFixed(4)} (${topicsUsage.inputTokens} in + ${topicsUsage.outputTokens} out tokens)`);
        }
      }
    } catch (err) {
      console.error(`  Warning: failed to update episode memory: ${err.message}`);
    }
    console.log();

    // Print cost summary and log to file
    costTracker.printSummary();
    costTracker.logToFile('/tmp/podcast-costs.jsonl');

    // Persist TTS usage to gh-pages and check free-tier thresholds
    console.log('Tracking TTS usage...');
    try {
      await updateTTSUsage(ttsCharacters);
    } catch (err) {
      console.error(`  Failed to update TTS usage tracking: ${err.message}`);
    }
    console.log();

  } catch (error) {
    console.error();
    console.error('='.repeat(60));
    console.error('❌ PIPELINE FAILED');
    console.error('='.repeat(60));
    console.error(error);
    console.error();
    throw error;
  }
}

async function runWithRetry({ dryRun = false, maxRetries = 2, config = null } = {}) {
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`Retry attempt ${attempt - 1}/${maxRetries}...`);
        console.log();
      }
      await run({ dryRun, config });
      return;
    } catch (error) {
      console.error(`Attempt ${attempt} failed: ${error.message}`);
      if (attempt <= maxRetries) {
        const delaySec = attempt * 5;
        console.error(`Retrying in ${delaySec}s...`);
        await new Promise(resolve => setTimeout(resolve, delaySec * 1000));
      } else {
        console.error('All retry attempts exhausted. Exiting.');
        process.exit(1);
      }
    }
  }
}

// Run if called directly
if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');

  // Parse --config argument
  const configArgIndex = process.argv.indexOf('--config');
  const configId = configArgIndex !== -1 && process.argv[configArgIndex + 1]
    ? process.argv[configArgIndex + 1]
    : 'benpod'; // Default to benpod for backward compatibility

  console.log(`Loading configuration: ${configId}`);
  const config = loadConfig(configId);
  console.log(`✅ Configuration loaded for: ${config.metadata.title}`);
  console.log();

  if (dryRun) {
    console.log('*** DRY RUN MODE — will not publish to RSS/GitHub Pages ***');
    console.log();
  }

  runWithRetry({ dryRun, config });
}

module.exports = { run };
