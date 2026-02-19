# Daily AI Audio Briefing — Production-Ready Specification

## Overview

Build an automated pipeline that runs daily, scrapes Databricks release notes and top AI news, synthesizes a spoken-word script using Claude, converts it to audio via Google Cloud TTS, and publishes the MP3 + RSS feed to GitHub Pages — making it subscribable in any podcast app (Spotify, Apple Podcasts, Pocket Casts, Overcast, etc.).

**Built with Claude Code** — this entire project was developed using Anthropic's Claude Code CLI tool.

---

## Architecture

```
Cron Job (daily via GitHub Actions)
    │
    ▼
1. Content Fetcher      — scrapes Databricks & AI news sources
    │
    ▼
2. Script Synthesizer   — sends content to Claude API → returns narration script
    │
    ▼
3. TTS Converter        — sends script to Google TTS → returns MP3
    │
    ▼
4. RSS Publisher        — commits MP3 + updated feed.xml to gh-pages branch
    │
    ▼
5. Cost Tracker         — logs API usage and estimates costs
    │
    ▼
   Podcast app auto-downloads the new episode each morning
```

---

## Tech Stack

- **Runtime**: Node.js (≥20)
- **Scheduler**: GitHub Actions (free, cloud-hosted cron)
- **LLM**: Anthropic Claude API (`claude-sonnet-4-6` or `claude-sonnet-4-5`)
- **TTS**: Google Cloud Text-to-Speech API (Journey-D voice - WaveNet/Neural quality)
- **Hosting**: GitHub Pages (free, no extra account needed)
- **Delivery**: Any podcast app via RSS 2.0 feed with iTunes tags
- **Testing**: Jest (unit tests for cost tracking, RSS generation, etc.)

---

## Daily Operating Costs (Feb 2026 rates)

| Service | Usage | Cost/episode |
|---------|-------|--------------|
| Claude Sonnet 4.5/4.6 | ~8,000 input + 1,500 output tokens | $0.024 + $0.023 = $0.047 |
| Google TTS (Journey-D) | ~9,000 characters | $0.00 (free tier — ~270K/month, well within 1M free WaveNet chars) |
| Twitter/X API v2 (optional) | ~6 API calls | $0.0009 |
| Open-Meteo weather API | 1 call/day | Free |
| GitHub Actions | ~4 min runtime | Free |
| GitHub Pages hosting | Static files | Free |
| **Total per episode** | | **~$0.05** |
| **Monthly (daily)** | | **~$1.50** |
| **Annual** | | **~$18** |

All costs are tracked automatically per-run to `/tmp/podcast-costs.jsonl`. Monthly TTS character usage is persisted to `tts-usage.json` on gh-pages for free-tier monitoring (warns at 80% of 1M limit).

---

## Step-by-Step Implementation

### 1. Project Setup

```bash
mkdir daily-podcast && cd daily-podcast
git init
npm init -y
npm install axios cheerio @anthropic-ai/sdk @google-cloud/text-to-speech dotenv
npm install --save-dev jest
```

Create `.env` (for local testing only — **never commit**):
```env
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_APPLICATION_CREDENTIALS=./gcp-key.json
TWITTER_BEARER_TOKEN=         # optional - for exec tweets
PODCAST_TITLE=The Data & AI Daily
PODCAST_AUTHOR=Your Name
PAGES_BASE_URL=https://<your-username>.github.io/<repo-name>
```

**IMPORTANT**: Use `PAGES_BASE_URL`, not `GITHUB_PAGES_BASE_URL`. GitHub doesn't allow variable names starting with "GITHUB_".

Create `.gitignore`:
```
node_modules/
.env
gcp-key.json
*.mp3
/tmp/
```

---

### 2. Content Fetching (`src/fetcher.js`)

Fetch from these sources each day:

**Databricks sources**

| Source | URL / Method | Notes |
|--------|-------------|-------|
| Databricks blog RSS | `https://www.databricks.com/feed` | RSS feed, take top 5 |
| Databricks newsroom | `https://www.databricks.com/company/newsroom` | Scrape with selectors: `div[data-cy="CtaImageBlock"]` → `h3.h3 a` for title |
| Databricks release notes | `https://docs.databricks.com/en/release-notes/index.html` | Scrape `<article>` tags |
| Databricks exec tweets | Twitter API v2 for @alighodsi, @rxin, @matei_zaharia | **Optional** - requires TWITTER_BEARER_TOKEN |

**Core AI/ML news sources**

| Source | URL | Type |
|--------|-----|------|
| OpenAI blog | `https://openai.com/blog` | Scrape |
| Anthropic news | `https://www.anthropic.com/news` | Scrape with selectors: `a.PublicationList-module-scss-module__KxYrHG__listItem` |
| Google DeepMind | `https://deepmind.google/discover/blog/` | Scrape |
| Meta AI | `https://ai.meta.com/blog/` | Scrape |
| The Verge AI | `https://www.theverge.com/rss/ai-artificial-intelligence/index.xml` | RSS |
| TechCrunch AI | `https://techcrunch.com/category/artificial-intelligence/feed/` | RSS |
| VentureBeat AI | `https://venturebeat.com/category/ai/feed/` | RSS |
| Hacker News | `https://hacker-news.firebaseio.com/v0/topstories.json` | API - filter top 30 for AI keywords |
| arXiv CS.AI | `http://export.arxiv.org/rss/cs.AI` | RSS - take top 3 |

**Implementation tips:**
- Use `cheerio` for HTML scraping, `axios` for HTTP requests
- Set `User-Agent` header to avoid blocks: `'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'`
- For RSS feeds, use `cheerio` with `{ xmlMode: true }`
- Twitter API: Make 2 calls per exec (user lookup + tweets fetch). Track API call count for cost monitoring.
- Return items in format: `{ title, summary, date, source }`
- Don't filter by date here - let Claude decide what's relevant

---

### 3. Weather Fetching (`src/fetcher.js` or `src/synthesizer.js`)

Fetch current weather from Open-Meteo API (free, no key required):

```javascript
async function fetchWeather(lat, lon, timezone) {
  const url = `https://api.open-meteo.com/v1/forecast?` +
    `latitude=${lat}&longitude=${lon}&` +
    `current=temperature_2m,weather_code,wind_speed_10m&` +
    `daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&` +
    `temperature_unit=fahrenheit&wind_speed_unit=mph&` +
    `timezone=${encodeURIComponent(timezone)}&forecast_days=1`;

  const { data } = await axios.get(url);

  // WMO weather codes to descriptions
  const weatherDescriptions = {
    0: 'clear skies', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
    45: 'foggy', 51: 'light drizzle', 61: 'light rain', 63: 'moderate rain',
    65: 'heavy rain', 71: 'light snow', 95: 'thunderstorms'
  };

  return {
    current: Math.round(data.current.temperature_2m),
    high: Math.round(data.daily.temperature_2m_max[0]),
    low: Math.round(data.daily.temperature_2m_min[0]),
    precip: data.daily.precipitation_probability_max[0],
    description: weatherDescriptions[data.current.weather_code] || 'mixed conditions',
    wind: Math.round(data.current.wind_speed_10m)
  };
}
```

**Coordinates for major US cities:**
- Austin, TX: `30.2672, -97.7431`
- San Francisco, CA: `37.7749, -122.4194`
- New York, NY: `40.7128, -74.0060`

---

### 4. Script Synthesis (`src/synthesizer.js`)

Send all content to Claude Sonnet 4.6 with a detailed prompt:

```javascript
const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function synthesizeScript(contentBundle) {
  const now = new Date();
  const localTime = new Date(now.toLocaleString('en-US', {
    timeZone: 'America/Chicago'  // Change to your timezone
  }));
  const today = localTime.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const weather = await fetchWeather(30.2672, -97.7431, 'America/Chicago');
  const weatherSummary = `${weather.description}, currently ${weather.current}°F, ` +
    `high of ${weather.high}°F, low of ${weather.low}°F, ` +
    `${weather.precip}% chance of rain, winds at ${weather.wind} mph`;

  const prompt = `You are the host of a personal morning podcast.
Today is ${today}. Your listener is based in [CITY].

[CITY] weather right now: ${weatherSummary}

Below is content gathered from Databricks sources (blog, newsroom, release notes, exec posts)
and core AI/ML news sources (major outlets, lab blogs, startup news).

YOUR TASK:
Produce a complete, ready-to-record podcast script for an 8–12 minute episode.

STRUCTURE (follow exactly):
──────────────────────────────────────────────
[COLD OPEN — 15–30 seconds]
- Greet your listener by name
- One sentence on today's episode theme
- Weave in weather naturally (not as a report)

[THEME SEGMENTS — 3 to 6 segments, ~1–2 minutes each]
Cluster news into 3–6 themes. Example themes:
"Databricks Product Updates", "LLM Breakthroughs", "Startup Moves"

For each segment:
- Open with punchy 1-sentence framing
- Explain what happened, why it matters, who it impacts
- Connect Databricks news to broader AI landscape
- Add confident commentary with opinions
- Use first-person ("I think", "what's interesting here")
- Address listener by name 1-2 times across full episode
- Natural transitions between segments

[WRAP-UP — 15–30 seconds]
- Quick recap of 1-2 biggest themes
- Preview what to watch for coming days
- Warm, personal sign-off

STYLE RULES:
──────────────────────────────────────────────
- Write for the ear, not eye. Short sentences. Active voice.
- NO bullet points, URLs, markdown, or stage directions
- Conversational and smart - like an excited colleague
- Don't pad with filler. If slow news day, say so and go deeper
- Target: 1,200–1,800 words (8–12 minutes at natural pace)
- Return ONLY the spoken script. No labels, headers, or brackets.

RAW CONTENT:
──────────────────────────────────────────────
${JSON.stringify(contentBundle, null, 2)}

Return ONLY the spoken script.`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2500,
    messages: [{ role: 'user', content: prompt }]
  });

  return {
    script: message.content[0].text,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens
    }
  };
}
```

**Customization points:**
- Change `[CITY]` to your city
- Adjust timezone in `toLocaleString()` and `fetchWeather()`
- Modify weather coordinates
- Change listener name in prompt
- Adjust `max_tokens` if scripts get truncated (try 3500)

---

### 5. Text-to-Speech (`src/tts.js`)

Convert script to MP3 using Google Cloud TTS:

```javascript
const textToSpeech = require('@google-cloud/text-to-speech');
const fs = require('fs');

async function convertToAudio(script, outputPath) {
  const client = new textToSpeech.TextToSpeechClient();

  // Google TTS has a 5000 byte limit, so chunk if needed
  const scriptBytes = Buffer.byteLength(script, 'utf8');

  if (scriptBytes <= 5000) {
    // Single request
    const [response] = await client.synthesizeSpeech({
      input: { text: script },
      voice: {
        languageCode: 'en-US',
        name: 'en-US-Journey-D'  // Best male voice. Try Journey-F for female
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 1.05,
        pitch: 0
      }
    });
    fs.writeFileSync(outputPath, response.audioContent, 'binary');
  } else {
    // Chunking logic here (see full implementation in repo)
    // Split on sentence boundaries, process chunks, concatenate MP3s
  }

  return {
    outputPath,
    characters: scriptBytes
  };
}
```

**Voice options:**
- `en-US-Journey-D` - Deep male voice (recommended)
- `en-US-Journey-F` - Female voice
- `en-US-Neural2-A` - Alternative male (75% cheaper, slightly lower quality)
- `en-US-Studio-M` - Male studio voice

**Costs:**
- Journey voices: $16 per million characters (WaveNet quality)
- Neural2 voices: $4 per million characters (standard quality)

---

### 6. RSS Feed Publisher (`src/publisher.js`)

Build RSS 2.0 feed with iTunes podcast tags:

```javascript
function buildUpdatedFeed(existingFeedXml, episode, baseUrl, podcastInfo) {
  const episodeUrl = `${baseUrl}/episodes/${episode.fileName}`;
  const pubDate = new Date(episode.date).toUTCString();

  const newItem = `
    <item>
      <title>${escapeXml(episode.title)}</title>
      <description>${escapeXml(episode.description)}</description>
      <pubDate>${pubDate}</pubDate>
      <enclosure url="${episodeUrl}" length="${episode.fileSizeBytes}" type="audio/mpeg"/>
      <guid isPermaLink="true">${episodeUrl}</guid>
      <itunes:duration>${episode.durationSeconds}</itunes:duration>
    </item>`;

  if (!existingFeedXml || existingFeedXml.trim() === '') {
    // First run — build full feed
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(podcastInfo.title)}</title>
    <link>${baseUrl}</link>
    <description>${escapeXml(podcastInfo.description)}</description>
    <language>en-us</language>
    <itunes:image href="${baseUrl}/artwork.jpg"/>
    <itunes:author>${escapeXml(podcastInfo.author)}</itunes:author>
    <itunes:email>your-email@example.com</itunes:email>
    <itunes:owner>
      <itunes:name>${escapeXml(podcastInfo.author)}</itunes:name>
      <itunes:email>your-email@example.com</itunes:email>
    </itunes:owner>
    <itunes:category text="Technology"/>
    <itunes:explicit>false</itunes:explicit>
    ${newItem}
  </channel>
</rss>`;
  }

  // Subsequent runs — insert new item after </itunes:explicit>
  const insertPosition = existingFeedXml.indexOf('</itunes:explicit>');
  const insertPoint = existingFeedXml.indexOf('>', insertPosition) + 1;
  return existingFeedXml.slice(0, insertPoint) + newItem + existingFeedXml.slice(insertPoint);
}

function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
```

**RSS requirements for Spotify/Pocket Casts:**
- `<itunes:email>` must be at channel level (not just in `<itunes:owner>`)
- `<itunes:image>` must point to valid JPEG/PNG (min 1400×1400px recommended)
- Enclosure URLs must be **full URLs**, not relative paths
- All episodes need valid `<pubDate>` in RFC 822 format

---

### 7. Cost Tracking (`src/costTracker.js`)

Track all API usage and estimate costs:

```javascript
const RATES = {
  claude: {
    input: 3.00 / 1_000_000,   // $3 per million input tokens
    output: 15.00 / 1_000_000  // $15 per million output tokens
  },
  tts: {
    standard: 4.00 / 1_000_000,  // Neural2 voices
    wavenet: 16.00 / 1_000_000   // Journey voices
  },
  twitter: {
    perCall: 0.00015  // Pay-per-use: $0.00015 per API call
  }
};

class CostTracker {
  constructor() {
    this.costs = { claude: 0, tts: 0, twitter: 0, total: 0 };
    this.usage = {
      claudeInputTokens: 0,
      claudeOutputTokens: 0,
      ttsCharacters: 0,
      twitterCalls: 0
    };
  }

  trackClaude(inputTokens, outputTokens) {
    this.usage.claudeInputTokens += inputTokens;
    this.usage.claudeOutputTokens += outputTokens;
    const cost = inputTokens * RATES.claude.input + outputTokens * RATES.claude.output;
    this.costs.claude += cost;
    this.costs.total += cost;
    return { inputTokens, outputTokens, totalCost: cost };
  }

  trackTTS(characters, voiceType = 'wavenet') {
    this.usage.ttsCharacters += characters;
    const cost = characters * RATES.tts[voiceType];
    this.costs.tts += cost;
    this.costs.total += cost;
    return { characters, cost };
  }

  trackTwitter(calls) {
    this.usage.twitterCalls += calls;
    const cost = calls * RATES.twitter.perCall;
    this.costs.twitter += cost;
    this.costs.total += cost;
    return { calls, totalCost: cost };
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('💰 COST SUMMARY');
    console.log('='.repeat(60));
    console.log(`  Claude API: $${this.costs.claude.toFixed(4)}`);
    console.log(`  Google TTS: $${this.costs.tts.toFixed(4)}`);
    if (this.usage.twitterCalls > 0) {
      console.log(`  Twitter API: $${this.costs.twitter.toFixed(4)}`);
    }
    console.log(`  Total: $${this.costs.total.toFixed(4)}`);
    console.log('='.repeat(60));
  }

  logToFile(logFile = '/tmp/podcast-costs.jsonl') {
    const summary = {
      costs: this.costs,
      usage: this.usage,
      timestamp: new Date().toISOString()
    };
    fs.appendFileSync(logFile, JSON.stringify(summary) + '\n');
  }
}
```

View cost reports with: `npm run cost-report -- [days]`

---

### 8. Main Orchestrator (`src/index.js`)

Tie everything together:

```javascript
require('dotenv').config();
const { fetchDatabricksContent, fetchAINews } = require('./fetcher');
const { synthesizeScript } = require('./synthesizer');
const { convertToAudio } = require('./tts');
const { buildUpdatedFeed } = require('./publisher');
const { publishEpisode } = require('./githubCommitter');
const { CostTracker } = require('./costTracker');

const BASE_URL = process.env.PAGES_BASE_URL;  // NOT GITHUB_PAGES_BASE_URL

async function run() {
  const costTracker = new CostTracker();

  // 1. Fetch content
  const [databricksData, aiNews] = await Promise.all([
    fetchDatabricksContent(),
    fetchAINews()
  ]);

  const contentBundle = {
    databricks: databricksData.items,
    aiNews: aiNews
  };

  // Track Twitter costs if API was used
  if (databricksData.twitterApiCalls > 0) {
    costTracker.trackTwitter(databricksData.twitterApiCalls);
  }

  // 2. Synthesize script
  const { script, usage: claudeUsage } = await synthesizeScript(contentBundle);
  costTracker.trackClaude(claudeUsage.inputTokens, claudeUsage.outputTokens);

  // 3. Convert to audio
  const now = new Date();
  const centralTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const dateStr = centralTime.toISOString().slice(0, 10);

  const episodeFileName = `AI-Briefing-${dateStr}.mp3`;
  const audioPath = `/tmp/${episodeFileName}`;

  const { outputPath, characters } = await convertToAudio(script, audioPath);
  costTracker.trackTTS(characters, 'wavenet');

  // 4. Build RSS feed
  const existingFeed = await getCurrentFeed();  // Fetch from gh-pages
  const fileSizeBytes = fs.statSync(outputPath).size;
  const durationSeconds = Math.round((fileSizeBytes * 8) / (128 * 1000));

  const updatedFeed = buildUpdatedFeed(existingFeed, {
    title: `The Data & AI Daily — ${dateStr}`,
    date: dateStr,
    fileName: episodeFileName,
    fileSizeBytes,
    durationSeconds,
    description: script.slice(0, 250) + '...'
  }, BASE_URL, {
    title: process.env.PODCAST_TITLE,
    author: process.env.PODCAST_AUTHOR,
    description: 'Daily briefing on Databricks and AI developments'
  });

  // 5. Publish to gh-pages
  await publishEpisode(outputPath, updatedFeed, episodeFileName);

  // 6. Log costs
  costTracker.printSummary();
  costTracker.logToFile('/tmp/podcast-costs.jsonl');

  // 7. Track TTS usage (persisted to gh-pages for monthly monitoring)
  await updateTTSUsage(characters);
}

run().catch(console.error);
```

---

### 9. GitHub Actions Workflow

Create `.github/workflows/daily-briefing.yml`:

```yaml
name: Daily AI Briefing

on:
  schedule:
    - cron: '0 11 * * *'       # 11:00 AM UTC = 5:00 AM CST / 6:00 AM CDT (daily)
  workflow_dispatch:            # Allow manual trigger

permissions:
  contents: write

jobs:
  run-briefing:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Write GCP credentials
        run: echo '${{ secrets.GCP_SERVICE_ACCOUNT_JSON }}' > gcp-key.json

      - name: Run pipeline
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GOOGLE_APPLICATION_CREDENTIALS: ./gcp-key.json
          TWITTER_BEARER_TOKEN: ${{ secrets.TWITTER_BEARER_TOKEN }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITHUB_REPOSITORY: ${{ github.repository }}
          PAGES_BASE_URL: ${{ vars.PAGES_BASE_URL }}
          PODCAST_TITLE: ${{ vars.PODCAST_TITLE }}
          PODCAST_AUTHOR: ${{ secrets.PODCAST_AUTHOR }}
        run: node src/index.js

      - name: Cleanup
        if: always()
        run: |
          rm -f gcp-key.json
          rm -f /tmp/*.mp3
          rm -f /tmp/*.txt
```

---

### 10. GitHub Setup

**A. Create repository secrets** (Settings → Secrets → Actions):

| Secret | Value |
|--------|-------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key from console.anthropic.com |
| `GCP_SERVICE_ACCOUNT_JSON` | Full JSON contents of GCP service account key |
| `TWITTER_BEARER_TOKEN` | Optional - Twitter API v2 Bearer Token |
| `PODCAST_AUTHOR` | Your name |

**B. Create repository variables** (Settings → Secrets → Variables):

| Variable | Value |
|----------|-------|
| `PAGES_BASE_URL` | `https://<username>.github.io/<repo-name>` |
| `PODCAST_TITLE` | Your podcast name |

**C. Initialize gh-pages branch:**

```bash
git checkout --orphan gh-pages
git rm -rf .
echo "<h1>Daily AI Briefing</h1>" > index.html
# Add podcast artwork (1400×1400 minimum recommended)
cp /path/to/artwork.jpg artwork.jpg
mkdir episodes
git add index.html artwork.jpg episodes/.gitkeep
git commit -m "Initialize gh-pages"
git push origin gh-pages
git checkout main
```

**D. Enable GitHub Pages:**
- Go to Settings → Pages
- Source: Deploy from branch
- Branch: `gh-pages` / `/ (root)`
- Save

---

### 11. Testing

**Run tests:**
```bash
npm test
```

**Run locally:**
```bash
node src/index.js
```

**Trigger workflow manually:**
```bash
gh workflow run daily-briefing.yml
```

**View workflow logs:**
```bash
gh run list --workflow=daily-briefing.yml --limit 1
gh run view <run-id> --log
```

**View cost report:**
```bash
npm run cost-report -- 30  # Last 30 days
```

---

### 12. Subscribing in Podcast Apps

Your RSS feed will be live at:
```
https://<username>.github.io/<repo-name>/feed.xml
```

**How to add:**

| App | Steps |
|-----|-------|
| **Spotify** | Requires submission at podcasters.spotify.com (free, 1-2 day review) |
| **Apple Podcasts** | Library → Edit → Add a Show by URL |
| **Pocket Casts** | + → Add podcast → Enter URL |
| **Overcast** | + → Add URL |

Enable auto-download in your app settings so episodes are ready when you wake up.

---

## Project Structure

```
daily-podcast/
├── .env                          # Local only (gitignored)
├── .gitignore
├── .github/
│   └── workflows/
│       └── daily-briefing.yml
├── artwork.jpg                   # Podcast cover art
├── package.json
├── scripts/
│   └── cost-report.js           # Cost report generator
├── src/
│   ├── index.js                 # Main orchestrator
│   ├── fetcher.js               # Content scraping
│   ├── synthesizer.js           # Claude API + prompt
│   ├── tts.js                   # Google TTS
│   ├── publisher.js             # RSS feed builder
│   ├── githubCommitter.js       # GitHub API commits
│   ├── costTracker.js           # Per-run cost tracking
│   └── ttsUsageTracker.js      # Monthly TTS usage tracking (persisted to gh-pages)
├── tests/
│   ├── costTracker.test.js
│   ├── publisher.test.js
│   └── weather.test.js
├── COST_TRACKING.md             # Cost documentation
├── README.md
└── daily-ai-audio-briefing-spec.md
```

---

## Lessons Learned & Production Tips

### 1. Variable Naming
❌ **Don't use**: `GITHUB_PAGES_BASE_URL`
✅ **Use**: `PAGES_BASE_URL`

GitHub doesn't allow repository variables starting with "GITHUB_".

### 2. RSS Feed URLs
- **Always use full URLs** in `<enclosure>` tags, never relative paths
- Spotify/Pocket Casts will reject feeds with relative URLs
- Example: `https://user.github.io/repo/episodes/file.mp3` ✅
- Not: `/episodes/file.mp3` ❌

### 3. RSS Feed Requirements for Spotify
- `<itunes:email>` must be at channel level (not just in `<itunes:owner>`)
- `<itunes:image>` must point to valid, publicly accessible image
- Minimum 1400×1400px artwork recommended
- All episodes need proper `<pubDate>` in RFC 822 format

### 4. Timezone Handling
- Use Central Time (or your timezone) for episode dates
- Convert using: `new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }))`
- This ensures episodes are dated for "today" not "yesterday" if running early morning

### 5. Cost Optimization
- Google TTS offers 1M free WaveNet/Journey characters per month — at ~9K chars/episode daily, usage (~270K/month) stays well within the free tier
- Journey voices cost 4× more than Neural2 ($16 vs $4 per million chars) if you exceed the free tier
- Twitter API is pay-per-use ($0.00015/call) - very affordable
- Total cost ~$1.50/month for daily episodes (essentially just Claude API)
- Monthly TTS usage is tracked in `tts-usage.json` on gh-pages with threshold warnings at 80% and 100%

### 6. Content Scraping
- Web scraping is fragile - selectors break when sites redesign
- Use RSS feeds when available (more reliable)
- Set proper `User-Agent` headers to avoid blocks
- Twitter API requires free developer account at developer.twitter.com

### 7. Testing
- Test locally first: `node src/index.js`
- Use `workflow_dispatch` for manual triggers during development
- Cost tracker logs to `/tmp/` - view with `npm run cost-report`
- Validate RSS feed at podba.se/validate before submitting to Spotify

### 8. GitHub Actions Cron
- Can run up to 15 minutes late during peak times
- Use `workflow_dispatch` for immediate testing
- Logs are in Actions tab - use `gh run view --log` for CLI access

### 9. Google Cloud TTS
- 1M free WaveNet/Journey characters per month — daily episodes stay well within this
- Journey voices may require `v1beta1` endpoint
- 5000 byte limit per request - implement chunking for longer scripts
- Speaking rate 1.05-1.1 sounds more natural than 1.0
- Test different voices - Journey-D (male), Journey-F (female)

### 10. Anthropic Claude
- Sonnet 4.6 produces best quality scripts
- Set `max_tokens: 2500` minimum (bump to 3500 if truncating)
- Include detailed style guidelines in prompt
- Return token usage for cost tracking

---

## API Setup Guides

### Anthropic API
1. Go to console.anthropic.com
2. Create API key
3. Add to GitHub Secrets as `ANTHROPIC_API_KEY`
4. Cost: $3/million input tokens, $15/million output tokens

### Google Cloud TTS
1. Create project at console.cloud.google.com
2. Enable Cloud Text-to-Speech API
3. Create service account with "Cloud Text-to-Speech User" role
4. Download JSON key
5. Add full JSON contents to GitHub Secrets as `GCP_SERVICE_ACCOUNT_JSON`
6. Cost: 1M free WaveNet/Journey characters per month; $16/million characters beyond that

### Twitter API (Optional)
1. Sign up at developer.twitter.com
2. Create project and app
3. Generate Bearer Token (free Basic tier)
4. Add to GitHub Secrets as `TWITTER_BEARER_TOKEN`
5. Cost: $0.00015 per API call (~$0.02/month for this use case)

---

## Potential Enhancements

- **Auto-prune old episodes**: Delete files >90 days old from gh-pages to stay under 1GB limit
- **Transcript files**: Save script as `.txt` alongside MP3 for accessibility
- **Two-host conversation**: Use separate synthesis for 2 voices, stitch audio together
- **Friday wrap-up**: Detect Friday and summarize full week instead of single day
- **Deduplication**: Track seen stories to avoid repeating same news
- **Slack/email notifications**: POST to webhook after successful publish
- **Multiple timezone support**: Generate different versions for different listeners
- **Voice cloning**: Use ElevenLabs voice cloning for truly personal podcast

---

## Troubleshooting

### Feed returns 404
- GitHub Pages takes 1-2 minutes to deploy after commit
- Check if file exists in gh-pages branch on GitHub
- Verify PAGES_BASE_URL is set correctly

### Spotify rejects feed
- Check `<itunes:email>` is at channel level
- Verify artwork.jpg exists and is accessible
- Validate feed at podba.se/validate
- Ensure all enclosure URLs are full URLs (not relative)

### Script gets truncated
- Increase `max_tokens` in Claude API call (try 3500)
- Check Claude API response for finish_reason

### TTS fails
- Check GCP service account has correct permissions
- Verify credentials JSON is valid
- For long scripts, implement chunking (see src/tts.js)

### Cost higher than expected
- Run `npm run cost-report` to see actual usage
- Check script length - longer scripts = more TTS costs
- Consider switching from Journey to Neural2 voices (75% cheaper)

### Twitter API not working
- Verify TWITTER_BEARER_TOKEN is set in GitHub Secrets
- Check token hasn't expired at developer.twitter.com
- Pipeline will gracefully skip Twitter if token not set

---

## Built With Claude Code

This entire project was built using [Claude Code](https://www.anthropic.com/claude/code), Anthropic's AI-powered development tool. Claude Code helped with:

- Architecture design
- Code implementation across all modules
- RSS feed debugging and Spotify compatibility fixes
- Cost tracking integration
- Test writing
- Documentation

To build your own version:
```bash
claude code
> help me build a daily AI podcast following the spec in daily-ai-audio-briefing-spec.md
```

---

## License

MIT - feel free to use and modify for your own personal podcast!

---

## Credits

Created by [Your Name] using Claude Code.

**Inspiration**: Personal need for a daily AI/Databricks briefing delivered as a podcast during morning routine.

**Tech choices**: Prioritized quality (Journey voices, Sonnet 4.6) over cost. Total ~$18/year thanks to Google TTS free tier — essentially just paying for Claude API.
