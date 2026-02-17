# Daily AI Audio Briefing — Technical Specification

## Overview

Build an automated pipeline that runs daily, scrapes Databricks release notes and top AI news, synthesizes a spoken-word script using Claude, converts it to audio via a text-to-speech API, and uploads the resulting MP3 to a specified Google Drive folder.

---

## Architecture

```
Cron Job (daily)
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
4. Google Drive Uploader — authenticates & uploads MP3 to target folder
```

---

## Tech Stack

- **Runtime**: Node.js (≥18) or Python 3.11+
- **Scheduler**: GitHub Actions (free, cloud-hosted cron) — recommended; alternatively a local cron job or a cloud function (AWS Lambda, GCP Cloud Functions)
- **LLM**: Anthropic Claude API (`claude-sonnet-4-6`)
- **TTS**: Google Cloud Text-to-Speech API (best quality) or ElevenLabs API (most natural voice)
- **Google Drive**: Google Drive API v3 via a Service Account

---

## Step-by-Step Implementation

### 1. Project Setup

```bash
mkdir daily-ai-briefing && cd daily-ai-briefing
npm init -y
npm install axios cheerio @anthropic-ai/sdk @google-cloud/text-to-speech googleapis dotenv
```

Create `.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
GOOGLE_DRIVE_FOLDER_ID=<your_folder_id>
ELEVENLABS_API_KEY=<optional_if_using_elevenlabs>
TTS_PROVIDER=google   # or "elevenlabs"
```

---

### 2. Content Fetching (`src/fetcher.js`)

Fetch from these sources each day:

| Source | URL / Method |
|--------|-------------|
| Databricks release notes | `https://docs.databricks.com/release-notes/` — parse the HTML for the most recent entries |
| Databricks blog | `https://www.databricks.com/blog` — scrape latest 3–5 posts |
| Hacker News AI stories | `https://hacker-news.firebaseio.com/v0/topstories.json` — fetch top 30, filter by AI/ML keywords |
| AI news RSS feeds | `https://feeds.feedburner.com/TheAIAlmanac` or similar; also consider `https://aiweekly.co/` |
| arXiv CS.AI (optional) | `http://export.arxiv.org/rss/cs.AI` — parse RSS for top papers |

**Key implementation notes:**
- Use `cheerio` for HTML parsing.
- Cache fetched content with a timestamp file to avoid re-scraping if re-run on the same day.
- Strip boilerplate HTML; keep only title, date, and 2–3 sentence summary/excerpt per item.
- Limit total input to ~4,000 tokens to stay well within Claude's context.

```javascript
// src/fetcher.js (skeleton)
const axios = require('axios');
const cheerio = require('cheerio');

async function fetchDatabricksReleaseNotes() {
  const { data } = await axios.get('https://docs.databricks.com/release-notes/');
  const $ = cheerio.load(data);
  const items = [];
  // Select the most recent release note entries (inspect page structure first)
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

Send all fetched content to Claude and ask it to return a radio-style audio script.

```javascript
const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic();

async function synthesizeScript(contentBundle) {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const prompt = `
You are producing a daily audio briefing called "The Data & AI Daily." 
Today is ${today}.

Below is the raw content gathered from Databricks release notes, the Databricks blog, and top AI news.
Write a concise, engaging, spoken-word script for a 3–5 minute audio segment.

REQUIREMENTS:
- Open with a brief welcome and today's date.
- Cover the 2–3 most important Databricks releases or announcements first.
- Then cover the top 2–3 AI industry developments.
- Close with a one-sentence teaser for what to watch tomorrow if there's a logical thread.
- Write for the ear, not the eye: use short sentences, no bullet points, no URLs, no markdown.
- Approximate word count: 500–800 words.
- Tone: professional but conversational, like a smart podcast host.

RAW CONTENT:
${JSON.stringify(contentBundle, null, 2)}

Return ONLY the script text, nothing else.
`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  return message.content[0].text;
}

module.exports = { synthesizeScript };
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
      name: 'en-US-Journey-D',   // Best available neural voice (male)
      // Alternative: 'en-US-Journey-F' for female
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 1.05,         // Slightly faster than default
      pitch: 0,
    },
  });
  fs.writeFileSync(outputPath, response.audioContent, 'binary');
  console.log(`Audio written to ${outputPath}`);
}
```

**Cost**: ~$0.004 per 1,000 characters. A 700-word script ≈ 4,200 characters ≈ **$0.017/day** (~$6/year).

#### Option B: ElevenLabs (more natural, slightly more expensive)

```javascript
const axios = require('axios');
const fs = require('fs');

async function convertToAudioElevenLabs(script, outputPath) {
  const voiceId = 'pNInz6obpgDQGcFmaJgB'; // "Adam" voice — change as desired
  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    { text: script, model_id: 'eleven_turbo_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } },
    { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, responseType: 'arraybuffer' }
  );
  fs.writeFileSync(outputPath, response.data);
}
```

**Cost**: ~$0.30 per 1,000 characters on Starter plan. Same script ≈ **$1.26/day** — use a paid plan if budget allows, otherwise Google TTS is fine.

---

### 5. Google Drive Upload (`src/uploader.js`)

Use a **Service Account** for unattended authentication (no OAuth browser flow needed).

#### One-time setup:
1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project → Enable **Google Drive API**.
3. Create a **Service Account** → Download JSON key → save as `service-account.json`.
4. Share your target Google Drive folder with the service account email (give it "Editor" access).
5. Copy the folder ID from the Drive URL: `https://drive.google.com/drive/folders/<FOLDER_ID>`.

```javascript
const { google } = require('googleapis');
const fs = require('fs');

async function uploadToDrive(filePath, fileName) {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  const drive = google.drive({ version: 'v3', auth });

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
      mimeType: 'audio/mpeg',
    },
    media: {
      mimeType: 'audio/mpeg',
      body: fs.createReadStream(filePath),
    },
    fields: 'id, webViewLink',
  });

  console.log(`Uploaded: ${response.data.webViewLink}`);
  return response.data;
}

module.exports = { uploadToDrive };
```

---

### 6. Main Orchestrator (`src/index.js`)

```javascript
require('dotenv').config();
const path = require('path');
const { fetchDatabricksReleaseNotes, fetchDatabricksBlog, fetchAINews } = require('./fetcher');
const { synthesizeScript } = require('./synthesizer');
const { convertToAudio } = require('./tts');
const { uploadToDrive } = require('./uploader');

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
  console.log('Script generated, word count:', script.split(' ').length);

  // 3. Convert to audio
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const audioFileName = `AI-Briefing-${date}.mp3`;
  const audioPath = path.join('/tmp', audioFileName);
  await convertToAudio(script, audioPath);

  // 4. Upload to Drive
  await uploadToDrive(audioPath, audioFileName);

  console.log('Done! Briefing delivered to Google Drive.');
}

run().catch(console.error);
```

---

### 7. Scheduler: GitHub Actions (Recommended)

Create `.github/workflows/daily-briefing.yml`:

```yaml
name: Daily AI Briefing

on:
  schedule:
    - cron: '0 8 * * 1-5'   # 8:00 AM UTC, Monday–Friday
                              # Adjust to your timezone (e.g., 13:00 UTC = 8 AM EST)
  workflow_dispatch:           # Also allows manual trigger

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

      - name: Write service account key
        run: echo '${{ secrets.GOOGLE_SERVICE_ACCOUNT_JSON }}' > service-account.json

      - name: Run pipeline
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GOOGLE_APPLICATION_CREDENTIALS: ./service-account.json
          GOOGLE_DRIVE_FOLDER_ID: ${{ secrets.GOOGLE_DRIVE_FOLDER_ID }}
          TTS_PROVIDER: google
        run: node src/index.js
```

**GitHub Secrets to add** (Settings → Secrets → Actions):
- `ANTHROPIC_API_KEY`
- `GOOGLE_SERVICE_ACCOUNT_JSON` (paste the entire JSON file contents)
- `GOOGLE_DRIVE_FOLDER_ID`

---

## Project File Structure

```
daily-ai-briefing/
├── .env                        # Local dev secrets (never commit)
├── .github/
│   └── workflows/
│       └── daily-briefing.yml
├── service-account.json        # Local dev only (gitignore this)
├── .gitignore
├── package.json
├── src/
│   ├── index.js                # Main orchestrator
│   ├── fetcher.js              # Web scraping
│   ├── synthesizer.js          # Claude API script generation
│   ├── tts.js                  # Text-to-speech
│   └── uploader.js             # Google Drive upload
└── README.md
```

`.gitignore`:
```
node_modules/
.env
service-account.json
*.mp3
```

---

## Estimated Daily Costs

| Service | Usage | Cost/day |
|---------|-------|----------|
| Claude API (Sonnet) | ~2,000 input + 1,500 output tokens | ~$0.01 |
| Google TTS (Journey) | ~4,500 chars | ~$0.02 |
| GitHub Actions | ~2 min runtime | Free |
| Google Drive API | Upload calls | Free |
| **Total** | | **~$0.03/day (~$10/year)** |

---

## Potential Enhancements (Post-MVP)

- **Email/Slack notification** with a link to the Drive file after each upload.
- **Transcript file**: Save the generated script as a `.txt` alongside the MP3.
- **Weekend editions**: Lighter "week in review" format on Fridays.
- **Personalization**: Add a config file listing specific Databricks product areas to prioritize (e.g., Delta Lake, Unity Catalog, MLflow).
- **Deduplication**: Track previously mentioned items in a JSON log to avoid repeating news across days.
- **Multiple voices**: Alternate between two voices to create a faux two-host format.

---

## Handoff Notes for Claude Code

1. Start with `src/fetcher.js` — inspect the live Databricks release notes page first to identify the correct CSS selectors before writing the scraper.
2. Test the full pipeline locally with `node src/index.js` before setting up GitHub Actions.
3. Verify the Google Drive folder is shared with the service account email before running the uploader.
4. The Google TTS `Journey` voices require the `v1beta1` endpoint; check the current SDK docs if you get a voice-not-found error.
5. If Databricks updates their docs site structure, the cheerio selectors in `fetcher.js` will need updating — this is the most fragile part of the system.
