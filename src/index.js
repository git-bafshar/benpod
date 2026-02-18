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

const { fetchDatabricksContent, fetchAINews } = require('./fetcher');
const { synthesizeScript } = require('./synthesizer');
const { convertToAudio } = require('./tts');
const { buildUpdatedFeed } = require('./publisher');
const { publishEpisode } = require('./githubCommitter');

const BASE_URL = process.env.GITHUB_PAGES_BASE_URL;
const REPO = process.env.GITHUB_REPOSITORY;
const GH_TOKEN = process.env.GITHUB_TOKEN;
const PODCAST_TITLE = process.env.PODCAST_TITLE || 'The Data & AI Daily';
const PODCAST_AUTHOR = process.env.PODCAST_AUTHOR || 'Unknown';

/**
 * Get current feed.xml from gh-pages branch
 */
async function getCurrentFeed() {
  try {
    const response = await axios.get(
      `https://api.github.com/repos/${REPO}/contents/feed.xml?ref=gh-pages`,
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
      console.log('  No existing feed.xml found (first run)');
      return ''; // First run
    }
    throw error;
  }
}

async function run() {
  console.log('='.repeat(60));
  console.log('Starting Daily AI Audio Briefing Pipeline');
  console.log('='.repeat(60));
  console.log();

  const startTime = Date.now();

  try {
    // 1. Fetch content from all sources
    console.log('STEP 1: Fetching content from sources...');
    console.log();

    const [databricksContent, aiNews] = await Promise.all([
      fetchDatabricksContent(),
      fetchAINews(),
    ]);

    const contentBundle = {
      databricks: databricksContent,
      aiNews: aiNews,
    };

    const totalItems = databricksContent.length + aiNews.length;
    console.log();
    console.log(`  Total items collected: ${totalItems}`);
    console.log();

    // 2. Synthesize script with Claude
    console.log('STEP 2: Synthesizing audio script...');
    console.log();

    const script = await synthesizeScript(contentBundle);
    const wordCount = script.split(/\s+/).length;
    console.log();

    // Get current time in Central Time (America/Chicago)
    const now = new Date();
    const centralTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const dateStr = centralTime.toISOString().slice(0, 10); // YYYY-MM-DD in Central Time

    // Save script to file for reference
    const scriptFileName = `AI-Briefing-${dateStr}-script.txt`;
    const scriptPath = path.join('/tmp', scriptFileName);
    fs.writeFileSync(scriptPath, script, 'utf8');
    console.log(`  Script saved to: ${scriptPath}`);
    console.log();

    // 3. Convert to audio
    console.log('STEP 3: Converting to audio...');
    console.log();

    const episodeFileName = `AI-Briefing-${dateStr}.mp3`;
    const audioPath = path.join('/tmp', episodeFileName);
    await convertToAudio(script, audioPath);
    console.log();

    const fileSizeBytes = fs.statSync(audioPath).size;
    // Estimate duration: MP3 at 128 kbps = (fileSize * 8 bits) / (128,000 bits/sec)
    const durationSeconds = Math.round((fileSizeBytes * 8) / (128 * 1000));

    // 4. Build updated RSS feed
    console.log('STEP 4: Building RSS feed...');
    console.log();

    const existingFeed = await getCurrentFeed();
    const updatedFeed = buildUpdatedFeed(
      existingFeed,
      {
        title: `The Data & AI Daily — ${dateStr}`,
        pubDate: centralTime.toUTCString(), // Use actual Central Time timestamp
        fileName: episodeFileName,
        fileSizeBytes,
        durationSeconds,
        description: script.slice(0, 250) + '...',
      },
      BASE_URL,
      {
        title: PODCAST_TITLE,
        author: PODCAST_AUTHOR,
        description: 'Daily briefing on Databricks releases and AI developments.',
      }
    );

    console.log('  Feed updated successfully');
    console.log();

    // 5. Publish to GitHub Pages
    console.log('STEP 5: Publishing to GitHub Pages...');
    console.log();

    await publishEpisode(audioPath, updatedFeed, episodeFileName);

    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('='.repeat(60));
    console.log('✅ PIPELINE COMPLETE!');
    console.log('='.repeat(60));
    console.log(`  Duration: ${duration}s`);
    console.log(`  Items processed: ${totalItems}`);
    console.log(`  Script words: ${wordCount}`);
    console.log(`  Audio file: ${episodeFileName}`);
    console.log(`  Episode URL: ${BASE_URL}/episodes/${episodeFileName}`);
    console.log(`  RSS feed: ${BASE_URL}/feed.xml`);
    console.log();
    console.log('🎉 Episode published! Subscribe in your podcast app:');
    console.log(`   ${BASE_URL}/feed.xml`);
    console.log();

  } catch (error) {
    console.error();
    console.error('='.repeat(60));
    console.error('❌ PIPELINE FAILED');
    console.error('='.repeat(60));
    console.error(error);
    console.error();
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  run().catch(console.error);
}

module.exports = { run };
