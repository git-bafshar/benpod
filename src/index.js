/**
 * Daily AI Audio Briefing - Main Orchestrator
 *
 * Orchestrates the full pipeline:
 * 1. Fetch content from multiple sources
 * 2. Synthesize script with Claude
 * 3. Convert to audio with TTS
 * 4. Upload to Google Drive
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { fetchDatabricksReleaseNotes, fetchDatabricksBlog, fetchAINews } = require('./fetcher');
const { synthesizeScript } = require('./synthesizer');
const { convertToAudio } = require('./tts');
const { uploadToDrive } = require('./uploader');
const { getAustinWeather, formatWeatherForSpeech } = require('./weather');

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

    const [releaseNotes, blogPosts, aiNews, weather] = await Promise.all([
      fetchDatabricksReleaseNotes(),
      fetchDatabricksBlog(),
      fetchAINews(),
      getAustinWeather(),
    ]);

    const weatherSpeech = formatWeatherForSpeech(weather);

    const contentBundle = {
      releaseNotes,
      blogPosts,
      aiNews,
      weather: weatherSpeech,
    };

    const totalItems = releaseNotes.length + blogPosts.length + aiNews.length;
    console.log();
    console.log(`  Total items collected: ${totalItems}`);
    console.log(`  Weather: ${weather.temperature}°F in Austin`);
    console.log();

    // 2. Synthesize script with Claude
    console.log('STEP 2: Synthesizing audio script...');
    console.log();

    const script = await synthesizeScript(contentBundle);
    const wordCount = script.split(/\s+/).length;
    console.log();

    // Save script to file
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const scriptFileName = `AI-Briefing-${date}-script.txt`;
    const scriptPath = path.join('/tmp', scriptFileName);
    fs.writeFileSync(scriptPath, script, 'utf8');
    console.log(`  Script saved to: ${scriptPath}`);
    console.log();

    // 3. Convert to audio
    console.log('STEP 3: Converting to audio...');
    console.log();

    const audioFileName = `AI-Briefing-${date}.mp3`;
    const audioPath = path.join('/tmp', audioFileName);
    await convertToAudio(script, audioPath);
    console.log();

    // 4. Upload to Google Drive (or save locally if no Drive access)
    console.log('STEP 4: Uploading to Google Drive...');
    console.log();

    let driveFile = null;
    try {
      driveFile = await uploadToDrive(audioPath, audioFileName);
      console.log();
    } catch (error) {
      console.log(`  ⚠️  Drive upload failed: ${error.message}`);
      console.log('  📁 Files saved locally instead:');
      console.log(`     ${audioPath}`);
      console.log(`     ${scriptPath}`);
      console.log();
    }

    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('='.repeat(60));
    console.log('✅ PIPELINE COMPLETE!');
    console.log('='.repeat(60));
    console.log(`  Duration: ${duration}s`);
    console.log(`  Items processed: ${totalItems}`);
    console.log(`  Script words: ${wordCount}`);
    console.log(`  Audio file: ${audioFileName}`);
    if (driveFile) {
      console.log(`  Drive link: ${driveFile.webViewLink}`);
    } else {
      console.log(`  Local files: ${audioPath}`);
    }
    console.log();

    // Upload transcript as well
    if (driveFile) {
      try {
        await uploadToDrive(scriptPath, scriptFileName);
        console.log(`  Transcript uploaded: ${scriptFileName}`);
      } catch (error) {
        console.log(`  (Transcript upload skipped)`);
      }
    }

    console.log();
    console.log('Briefing delivered successfully! 🎉');
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
