# Daily AI Audio Briefing — Technical Specification

## Overview

Build an automated pipeline that runs daily, scrapes Databricks release notes and top AI news, synthesizes a spoken-word script using Claude, converts it to audio via a text-to-speech API, and publishes the MP3 + an RSS feed to GitHub Pages — making it subscribable in any podcast app (Overcast, Apple Podcasts, Pocket Casts, Spotify, etc.).

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
3. TTS Converter        — sends script to TTS API → returns MP3
    │
    ▼
4. RSS Publisher        — commits MP3 + updated feed.xml to gh-pages branch
    │
    ▼
   Podcast app on your phone auto-downloads the new episode each morning
```

---

## Tech Stack

- **Runtime**: Node.js (≥18)
- **Scheduler**: GitHub Actions (free, cloud-hosted cron)
- **LLM**: Anthropic Claude API (`claude-sonnet-4-6`)
- **TTS**: Google Cloud Text-to-Speech API (best quality/cost) or ElevenLabs (most natural)
- **Hosting**: GitHub Pages (free, no extra account needed — uses the same repo)
- **Delivery**: Any podcast app via RSS 2.0 feed

---

## How the RSS / GitHub Pages Approach Works

1. Your repo has a `gh-pages` branch that GitHub serves as a static website at `https://<your-username>.github.io/<repo-name>/`.
2. Each day the GitHub Actions workflow generates a new MP3, commits it to `gh-pages/episodes/`, and rewrites `gh-pages/feed.xml` to include the new episode at the top.
3. Your podcast app polls `https://<your-username>.github.io/<repo-name>/feed.xml` on its normal schedule and auto-downloads the new episode.
4. You open your podcast app in the morning and press play — no manual steps.

**Storage note**: GitHub has a 1 GB soft limit per repo and individual files must be under 100 MB. A 5-minute MP3 at 128 kbps is ~4.7 MB, so you can store ~200 episodes before needing to prune old ones. The workflow can automatically delete episodes older than 90 days.

---

## Step-by-Step Implementation

### 1. Project Setup

```bash
mkdir daily-ai-briefing && cd daily-ai-briefing
git init
npm init -y
npm install axios cheerio @anthropic-ai/sdk @google-cloud/text-to-speech dotenv
```

Create `.env` (for local testing only — never commit):
```
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_APPLICATION_CREDENTIALS=./gcp-key.json
TTS_PROVIDER=google        # or "elevenlabs"
ELEVENLABS_API_KEY=        # optional
PODCAST_TITLE=The Data & AI Daily
PODCAST_AUTHOR=Your Name
GITHUB_PAGES_BASE_URL=https://<your-username>.github.io/<repo-name>
```

---

### 2. Content Fetching (`src/fetcher.js`)

Fetch from these sources each day:

**Databricks sources**

| Source | URL / Method |
|--------|-------------|
| Databricks blog | `https://www.databricks.com/blog` — scrape latest 5 posts, filter by `pubDate` within 24h |
| Databricks newsroom | `https://www.databricks.com/company/newsroom` — press releases & announcements |
| Databricks release notes | `https://docs.databricks.com/release-notes/` — parse HTML, grab entries from last 24h |
| Ali Ghodsi on X | Twitter/X API v2 `GET /2/users/:id/tweets` filtered to last 24h (user: `@ghodsi`) |
| Reynold Xin on X | Same approach (user: `@rxin`) |
| LinkedIn exec posts | LinkedIn API restricts scraping; treat as an optional manual override or monitor via an RSS bridge |

**Core AI / ML news sources**

| Source | URL / Method |
|--------|-------------|
| OpenAI blog | `https://openai.com/blog` — scrape or check for RSS link in `<head>` |
| Anthropic news | `https://www.anthropic.com/news` — scrape for posts in last 24h |
| Google DeepMind blog | `https://deepmind.google/discover/blog/` |
| Meta AI blog | `https://ai.meta.com/blog/` |
| The Verge AI | RSS: `https://www.theverge.com/rss/ai-artificial-intelligence/index.xml` |
| TechCrunch AI | RSS: `https://techcrunch.com/category/artificial-intelligence/feed/` |
| VentureBeat AI | RSS: `https://venturebeat.com/category/ai/feed/` |
| Hacker News top stories | `https://hacker-news.firebaseio.com/v0/topstories.json` — top 30, filter by AI/ML/LLM/Databricks keywords |
| arXiv CS.AI (optional) | `http://export.arxiv.org/rss/cs.AI` — high-signal papers only |

**Key implementation notes:**
- Use `cheerio` for HTML parsing of blog/newsroom pages; use `axios` to consume RSS feeds directly.
- For X/Twitter sources, use the Twitter API v2 with a Bearer token stored as a GitHub Secret (`TWITTER_BEARER_TOKEN`). Fetch the last 10 tweets from each exec, filter to last 24h, and skip retweets.
- Cache fetched content with a timestamp file (`/tmp/fetch-cache-YYYY-MM-DD.json`) to avoid re-scraping if the pipeline re-runs on the same day.
- Filter all items to those published within the last 24 hours before passing to Claude. Include the item's title, source, publish date, and a 2–3 sentence excerpt.
- Target ~6,000–8,000 tokens of raw content input to give Claude enough signal for a 10-minute episode without hitting context limits.
- Add `TWITTER_BEARER_TOKEN` to your `.env` and GitHub Secrets.

```javascript
// src/fetcher.js (skeleton)
const axios = require('axios');
const cheerio = require('cheerio');

async function fetchDatabricksReleaseNotes() {
  const { data } = await axios.get('https://docs.databricks.com/release-notes/');
  const $ = cheerio.load(data);
  const items = [];
  // Inspect the live page first to confirm selectors
  $('article, .release-note-entry').slice(0, 5).each((_, el) => {
    items.push({
      title: $(el).find('h2, h3').first().text().trim(),
      summary: $(el).find('p').first().text().trim().slice(0, 300),
      date: $(el).find('time, .date').text().trim(),
    });
  });
  return items;
}

// ... similar functions for blog, HN, arXiv
module.exports = { fetchDatabricksReleaseNotes, /* ... */ };
```

---

### 3. Script Synthesis (`src/synthesizer.js`)

Send all fetched content — including today's Austin weather — to Claude and ask it to return a fully structured podcast script.

**Weather pre-fetch**: Before calling Claude, fetch Austin's current conditions from the Open-Meteo API (free, no key required) so the cold-open forecast is real.

```javascript
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const client = new Anthropic();

async function fetchAustinWeather() {
  // Open-Meteo — free, no API key needed
  const url = 'https://api.open-meteo.com/v1/forecast'
    + '?latitude=30.2672&longitude=-97.7431'
    + '&current=temperature_2m,weathercode,windspeed_10m'
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max'
    + '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FChicago&forecast_days=1';

  const { data } = await axios.get(url);
  const c = data.current;
  const d = data.daily;

  // WMO weather code → human description (subset)
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

async function synthesizeScript(contentBundle) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Chicago',
  });

  const weather = await fetchAustinWeather();
  const weatherSummary = `${weather.description}, currently ${weather.current}°F, `
    + `high of ${weather.high}°F, low of ${weather.low}°F, `
    + `${weather.precip}% chance of rain, winds at ${weather.wind} mph`;

  const prompt = `
You are the host of "The Data & AI Daily," a personal morning podcast for Tyler.
Today is ${today}. Tyler is based in Austin, Texas.

Austin weather right now: ${weatherSummary}

Below is the raw content gathered from Databricks sources (blog, newsroom, release notes, exec social posts)
and core AI/ML news sources (major tech outlets, foundation model lab blogs, startup/funding news).

YOUR TASK:
Produce a complete, ready-to-record podcast script for an 8–12 minute episode.

═══════════════════════════════════════════════
STRUCTURE (follow this exactly):
═══════════════════════════════════════════════

[COLD OPEN — 15–30 seconds]
- Greet Tyler by name.
- One sentence on what today's episode covers (the "headline of headlines").
- Weave in the Austin weather forecast naturally (not as a weather report — more like what a friend would say: "it's looking like a scorcher out there" or "grab a jacket this morning").

[THEME SEGMENTS — 3 to 6 segments, each ~1–2 minutes]
Cluster today's news into 3–6 named themes. Choose theme names that fit the actual news.
Good examples: "Databricks Product & Platform", "Lakehouse Ecosystem & Partners",
"LLM & Agent Breakthroughs", "Regulation & Policy", "Startup & Funding Moves",
"Open Source & Research". Discard low-signal or redundant items — not everything needs coverage.

For each theme segment:
- Open with a punchy 1-sentence framing of the theme.
- Explain what happened, why it matters, and who it impacts (call out data engineers,
  ML practitioners, founders, or infra teams specifically when relevant).
- Where relevant, connect Databricks-specific news to the broader AI landscape.
- Add light, confident commentary — you have opinions. Examples of the right tone:
  "This puts real pressure on Snowflake's AI roadmap."
  "Honestly, this is great news for early-stage teams with lean data stacks."
  "I think this is being undersold — here's why it matters."
- Use first-person ("I think", "what I find interesting here is", "we've been watching this").
- Address Tyler by name once or twice across the whole episode — not every segment.
- Transitions between segments should feel natural, not formulaic.

[WRAP-UP — 15–30 seconds]
- Quick recap sentence of the 1–2 biggest themes from today.
- Preview: what Tyler should keep an eye on over the coming days in Databricks and AI.
- Sign off warmly and personally.

═══════════════════════════════════════════════
STYLE RULES:
═══════════════════════════════════════════════
- Write for the ear, not the eye. Short sentences. Active voice. No bullet points, no URLs, no markdown in the script.
- Conversational and smart — like a well-informed colleague who's genuinely excited about this space.
- Do NOT pad with filler. If today is a slow news day, say so honestly and go deeper on fewer items.
- Target word count: 1,200–1,800 words (8–12 minutes at a natural speaking pace).
- Do NOT include stage directions, segment headers, or any bracketed labels in the output —
  just the raw spoken script from start to finish.

═══════════════════════════════════════════════
RAW CONTENT:
═══════════════════════════════════════════════
${JSON.stringify(contentBundle, null, 2)}

Return ONLY the spoken script. No labels, no headers, no stage directions, no markdown.
`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2500,
    messages: [{ role: 'user', content: prompt }],
  });

  return message.content[0].text;
}

module.exports = { synthesizeScript, fetchAustinWeather };
```

---

### 4. Text-to-Speech Conversion (`src/tts.js`)

#### Option A: Google Cloud TTS (recommended for quality + cost)

```javascript
const textToSpeech = require('@google-cloud/text-to-speech');
const fs = require('fs');

async function convertToAudio(script, outputPath) {
  const client = new textToSpeech.TextToSpeechClient();
  const [response] = await client.synthesizeSpeech({
    input: { text: script },
    voice: {
      languageCode: 'en-US',
      name: 'en-US-Journey-D',   // Best neural voice (male)
      // Alternative: 'en-US-Journey-F' for female
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 1.05,
      pitch: 0,
    },
  });
  fs.writeFileSync(outputPath, response.audioContent, 'binary');
}

module.exports = { convertToAudio };
```

**Cost**: ~$0.004 per 1,000 characters. A 700-word script ≈ 4,200 characters ≈ **$0.017/day** (~$6/year).

#### Option B: ElevenLabs (more natural voice, higher cost)

```javascript
const axios = require('axios');
const fs = require('fs');

async function convertToAudioElevenLabs(script, outputPath) {
  const voiceId = 'pNInz6obpgDQGcFmaJgB'; // "Adam" — change as desired
  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      text: script,
      model_id: 'eleven_turbo_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 }
    },
    { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, responseType: 'arraybuffer' }
  );
  fs.writeFileSync(outputPath, response.data);
}
```

**Cost**: ~$0.30 per 1,000 characters on Starter plan ≈ **$1.26/day**. Use Google TTS unless voice quality is a priority.

---

### 5. RSS Feed Publisher (`src/publisher.js`)

This module does three things after generating the MP3:
1. Reads the existing `feed.xml` from the `gh-pages` branch (or creates one from scratch on first run).
2. Prepends the new episode as the first `<item>` in the feed.
3. Commits the MP3 and updated `feed.xml` back to `gh-pages` using the GitHub API (no `git` binary needed in the Action).

```javascript
const fs = require('fs');

/**
 * Builds or updates an RSS 2.0 feed XML string.
 * @param {string} existingFeedXml - Current feed.xml contents (empty string if first run)
 * @param {object} episode - { title, date, fileName, fileSizeBytes, durationSeconds, description }
 * @param {string} baseUrl - e.g. "https://yourname.github.io/daily-ai-briefing"
 */
function buildUpdatedFeed(existingFeedXml, episode, baseUrl) {
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

  if (!existingFeedXml) {
    // First run — build the full feed from scratch
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${process.env.PODCAST_TITLE}</title>
    <link>${baseUrl}</link>
    <description>Daily briefing on Databricks releases and AI developments.</description>
    <language>en-us</language>
    <itunes:author>${process.env.PODCAST_AUTHOR}</itunes:author>
    <itunes:category text="Technology"/>
    <itunes:explicit>false</itunes:explicit>
    ${newItem}
  </channel>
</rss>`;
  }

  // Subsequent runs — insert new item after opening channel tags
  return existingFeedXml.replace(/<item>/, `${newItem}\n    <item>`);
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = { buildUpdatedFeed };
```

**Committing to gh-pages via GitHub API** (`src/githubCommitter.js`):

```javascript
const axios = require('axios');
const fs = require('fs');

const GH_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY; // e.g. "yourname/daily-ai-briefing"
const BRANCH = 'gh-pages';
const API = `https://api.github.com/repos/${REPO}`;

async function getFileSha(filePath) {
  try {
    const res = await axios.get(`${API}/contents/${filePath}?ref=${BRANCH}`, {
      headers: { Authorization: `Bearer ${GH_TOKEN}` }
    });
    return res.data.sha;
  } catch {
    return null; // File doesn't exist yet
  }
}

async function commitFile(filePath, contentBase64, message) {
  const sha = await getFileSha(filePath);
  const body = {
    message,
    content: contentBase64,
    branch: BRANCH,
    ...(sha ? { sha } : {}),
  };
  await axios.put(`${API}/contents/${filePath}`, body, {
    headers: { Authorization: `Bearer ${GH_TOKEN}`, 'Content-Type': 'application/json' }
  });
}

async function publishEpisode(mp3Path, feedXml, episodeFileName) {
  // Upload MP3
  const mp3Base64 = fs.readFileSync(mp3Path).toString('base64');
  await commitFile(`episodes/${episodeFileName}`, mp3Base64, `Add episode: ${episodeFileName}`);

  // Upload updated feed.xml
  const feedBase64 = Buffer.from(feedXml).toString('base64');
  await commitFile('feed.xml', feedBase64, `Update feed for ${episodeFileName}`);

  console.log(`Published to gh-pages: episodes/${episodeFileName} + feed.xml`);
}

module.exports = { publishEpisode };
```

---

### 6. Main Orchestrator (`src/index.js`)

```javascript
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const { fetchDatabricksReleaseNotes, fetchDatabricksBlog, fetchAINews } = require('./fetcher');
const { synthesizeScript } = require('./synthesizer');
const { convertToAudio } = require('./tts');
const { buildUpdatedFeed } = require('./publisher');
const { publishEpisode } = require('./githubCommitter');

const BASE_URL = process.env.GITHUB_PAGES_BASE_URL;
const REPO = process.env.GITHUB_REPOSITORY;
const GH_TOKEN = process.env.GITHUB_TOKEN;

async function getCurrentFeed() {
  try {
    const res = await axios.get(
      `https://api.github.com/repos/${REPO}/contents/feed.xml?ref=gh-pages`,
      { headers: { Authorization: `Bearer ${GH_TOKEN}` } }
    );
    return Buffer.from(res.data.content, 'base64').toString('utf-8');
  } catch {
    return ''; // First run
  }
}

async function run() {
  console.log('Starting daily AI briefing pipeline...');

  // 1. Fetch content
  const [releaseNotes, blogPosts, aiNews] = await Promise.all([
    fetchDatabricksReleaseNotes(),
    fetchDatabricksBlog(),
    fetchAINews(),
  ]);
  const contentBundle = { releaseNotes, blogPosts, aiNews };

  // 2. Synthesize script
  const script = await synthesizeScript(contentBundle);
  console.log(`Script: ${script.split(' ').length} words`);

  // 3. Convert to audio
  const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const episodeFileName = `AI-Briefing-${dateStr}.mp3`;
  const audioPath = path.join('/tmp', episodeFileName);
  await convertToAudio(script, audioPath);

  const fileSizeBytes = fs.statSync(audioPath).size;
  const durationSeconds = Math.round((fileSizeBytes * 8) / (128 * 1000)); // estimate at 128kbps

  // 4. Build updated RSS feed
  const existingFeed = await getCurrentFeed();
  const updatedFeed = buildUpdatedFeed(existingFeed, {
    title: `The Data & AI Daily — ${dateStr}`,
    date: dateStr,
    fileName: episodeFileName,
    fileSizeBytes,
    durationSeconds,
    description: script.slice(0, 300) + '...',
  }, BASE_URL);

  // 5. Commit MP3 + feed to gh-pages
  await publishEpisode(audioPath, updatedFeed, episodeFileName);

  console.log('Done! New episode live at:');
  console.log(`  ${BASE_URL}/episodes/${episodeFileName}`);
  console.log(`  RSS: ${BASE_URL}/feed.xml`);
}

run().catch(console.error);
```

---

### 7. GitHub Actions Workflow

Create `.github/workflows/daily-briefing.yml`:

```yaml
name: Daily AI Briefing

on:
  schedule:
    - cron: '0 11 * * 1-5'   # 11:00 AM UTC = 6 AM EST / 7 AM EDT Mon–Fri
  workflow_dispatch:           # Allows manual trigger for testing

# Required so the Action can commit to gh-pages
permissions:
  contents: write

jobs:
  run-briefing:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

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
          TTS_PROVIDER: google
          PODCAST_TITLE: The Data & AI Daily
          PODCAST_AUTHOR: ${{ secrets.PODCAST_AUTHOR }}
          GITHUB_PAGES_BASE_URL: https://${{ github.repository_owner }}.github.io/${{ github.event.repository.name }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}   # Automatically provided by Actions
          GITHUB_REPOSITORY: ${{ github.repository }}
        run: node src/index.js
```

**GitHub Secrets to configure** (repo Settings → Secrets → Actions):

| Secret | Value |
|--------|-------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `GCP_SERVICE_ACCOUNT_JSON` | Full contents of your GCP service account JSON key file |
| `TWITTER_BEARER_TOKEN` | Twitter/X API v2 Bearer Token (free Basic tier at developer.twitter.com) |
| `PODCAST_AUTHOR` | Your name (Tyler) |

`GITHUB_TOKEN` is **automatically provided** by Actions — no setup needed.

---

### 8. One-Time GitHub Pages Setup

```bash
# From your repo root, create and push an empty gh-pages branch
git checkout --orphan gh-pages
git rm -rf .
echo "<h1>The Data & AI Daily</h1>" > index.html
git add index.html
git commit -m "Initialize gh-pages"
git push origin gh-pages
git checkout main
```

Then in your repo on GitHub: **Settings → Pages → Source → Deploy from branch → gh-pages → / (root)**.

Your feed will be live at:
```
https://<your-username>.github.io/<repo-name>/feed.xml
```

---

### 9. Subscribing in Your Podcast App

| App | How to add a private RSS feed |
|-----|------------------------------|
| **Overcast** (iOS) | Add Podcast → paste URL |
| **Pocket Casts** | + → Add via URL |
| **Apple Podcasts** | Library → … → Follow a Show → paste URL |
| **Castro** | Subscriptions → + → paste URL |
| **Spotify** | Does not support arbitrary RSS — use one of the above |

Paste your `feed.xml` URL and the app will check for new episodes on its normal polling schedule (usually every few hours). Enable **auto-download** in the app settings so the episode is ready before you wake up.

---

## Project File Structure

```
daily-ai-briefing/
├── .env                          # Local dev only (gitignore)
├── .gitignore
├── .github/
│   └── workflows/
│       └── daily-briefing.yml
├── gcp-key.json                  # Local dev only (gitignore)
├── package.json
├── src/
│   ├── index.js                  # Main orchestrator
│   ├── fetcher.js                # Web scraping
│   ├── synthesizer.js            # Claude API
│   ├── tts.js                    # Text-to-speech
│   ├── publisher.js              # RSS feed builder
│   └── githubCommitter.js        # GitHub API commits to gh-pages
└── README.md
```

`.gitignore`:
```
node_modules/
.env
gcp-key.json
*.mp3
```

---

## Estimated Daily Costs

| Service | Usage | Cost/day |
|---------|-------|----------|
| Claude API (Sonnet) | ~8,000 input + 2,500 output tokens | ~$0.04 |
| Google TTS (Journey) | ~10,000 chars (10-min episode) | ~$0.04 |
| Open-Meteo weather API | Daily call | Free |
| Twitter/X API v2 | 2 user timeline calls/day | Free (Basic tier) |
| GitHub Actions | ~4 min runtime | Free |
| GitHub Pages hosting | Static files | Free |
| **Total** | | **~$0.08/day (~$29/year)** |

---

## Potential Enhancements (Post-MVP)

- **Auto-prune old episodes**: Add a workflow step that deletes `gh-pages/episodes/` files older than 90 days to keep the repo under the 1 GB limit.
- **Transcript file**: Commit the script as a `.txt` alongside each MP3 and link it from the RSS `<description>` field.
- **Episode artwork**: Add a static `artwork.jpg` to `gh-pages` and reference it via `<itunes:image>` so podcast apps show cover art.
- **Friday "week in review"**: Detect Friday in the workflow and adjust the Claude prompt to summarize the full week instead of just the day.
- **Deduplication log**: Maintain a `seen-items.json` in `gh-pages` to avoid repeating the same stories on consecutive days.
- **Slack/email ping**: After publishing, POST to a Slack webhook or send a quick email confirming delivery with the episode URL.

---

## Handoff Notes for Claude Code

1. **Start with `src/fetcher.js`** — use `curl` or a browser to inspect the live Databricks blog and newsroom pages to confirm CSS selectors before writing the scraper. This is the most fragile part of the system and will need updating if Databricks redesigns their site.
2. **Twitter/X API setup**: Sign up at [developer.twitter.com](https://developer.twitter.com), create a project/app, and generate a Bearer Token. The free Basic tier allows ~500k tweet reads/month — far more than needed. Look up the numeric user IDs for `@ghodsi` and `@rxin` using `GET /2/users/by/username/:username` before hardcoding them.
3. **Weather API**: Open-Meteo requires no API key and is free. The `synthesizeScript` function fetches Austin weather automatically before calling Claude — no additional setup needed.
4. **Initialize `gh-pages` manually first** (Step 8 above) before the first workflow run, otherwise the GitHub API committer will fail.
5. **Test locally** with `node src/index.js` — it will commit to your real `gh-pages` branch, so consider using a throwaway test repo for the first run.
6. **GCP TTS note**: The `Journey` voices may require the `v1beta1` API endpoint. If you get a voice-not-found error, check the current Node.js SDK docs and switch the client to the beta endpoint. For a 10-minute episode, consider bumping the `speakingRate` to `1.1` — it sounds more natural at longer lengths.
7. **RSS validation**: After the first run, paste your feed URL into [podba.se/validate](https://podba.se/validate/) or [castfeedvalidator.com](https://castfeedvalidator.com) before subscribing in Spotify.
8. **Cron timing**: GitHub Actions scheduled jobs can run up to 15 minutes late during peak periods. The workflow is currently set for 11 AM UTC (6 AM CST / 7 AM CDT) — adjust to your preferred wake-up window, keeping the 15-minute buffer in mind.
9. **`max_tokens` for Claude**: The prompt targets 1,200–1,800 words. At ~1.3 tokens/word, set `max_tokens: 2500` minimum. If Claude truncates, bump to `3500`.
