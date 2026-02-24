# The Data & AI Daily — Personal Podcast Automation

Automated daily audio briefing covering Databricks releases, AI/ML news, SF Sports, Real Estate, and Global Affairs, synthesized with Gemini 1.5 Pro and delivered as a podcast RSS feed via GitHub Pages.

Wake up to a personalized 8-15 minute episode in your podcast app every weekday morning.

![Pipeline Flow](docs/pipeline-flow.png)

## 🎯 Features

- **Automated Daily Pipeline**: Runs Monday-Friday at 6:00 AM UTC via GitHub Actions
- **Expanded Content Sources**: 
  - **AI/ML**: Databricks, OpenAI, Anthropic, DeepMind, Meta, The Verge, TechCrunch, Hacker News, arXiv
  - **Sports**: SF Giants, Golden State Warriors, San Francisco 49ers (game recaps via ESPN API)
  - **Real Estate**: Market analysis and trends (summarized from Zillow & Redfin)
  - **Global Affairs**: International relations with a focus on Iran (Foreign Policy, IranWire)
  - **Local**: Axios Chicago and other regional newsletters
- **AI-Powered Script**: Gemini 1.5 Pro generates personalized, conversational 8-15 minute scripts with Chicago weather and multi-episode continuity
- **High-Quality Audio**: Google Cloud Text-to-Speech with Studio voices, with automatic chunking for long scripts
- **Podcast RSS Feed**: Published to GitHub Pages with iTunes tags, artwork, and owner email for Spotify submission
- **Zero Infrastructure**: Completely free hosting via GitHub Pages + Actions

## 📋 Prerequisites

1. **Google API Key** - Get from https://aistudio.google.com/ (Required for Gemini and Weather)
2. **Google Cloud Project** with:
   - Text-to-Speech API enabled
   - Service Account with JSON key
3. **GitHub Personal Access Token** (for local testing) - Create with `repo` scope
4. **Twitter API Bearer Token** (optional) - Free Basic tier from developer.twitter.com
5. **Anthropic API Key** (optional) - Legacy support for Claude synthesis

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/git-bafshar/benpod.git
cd daily-podcast
npm install
```

### 2. Configure Environment

Create `.env` file:

```bash
GOOGLE_API_KEY=your-gemini-api-key
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
TWITTER_BEARER_TOKEN=your-twitter-token  # Optional
GITHUB_TOKEN=ghp_your-personal-token-here  # For local testing
GITHUB_REPOSITORY=yourusername/yourrepo
PAGES_BASE_URL=https://yourusername.github.io/yourrepo
PODCAST_TITLE="Your Podcast Title"
PODCAST_AUTHOR=YourName
```

### 3. Set Up Google Cloud

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable **Cloud Text-to-Speech API**
4. Create Service Account:
   - IAM & Admin → Service Accounts → Create
   - Grant roles: "Service Account User"
   - Create JSON key → Save as `service-account.json`

### 4. Set Up GitHub Pages

```bash
# Create and push an empty gh-pages branch
git checkout --orphan gh-pages
git rm -rf .
mkdir episodes
echo "<h1>The Data & AI Daily</h1>" > index.html
git add .
git commit -m "Initialize gh-pages"
git push origin gh-pages
git checkout main
```

Then in GitHub: **Settings → Pages → Source → Deploy from branch → gh-pages → / (root)**

### 5. Add Podcast Artwork

`artwork.jpg` is hosted on the `gh-pages` branch (1400x1400 to 3000x3000 pixels, under 500KB). To update it, commit a new version to `gh-pages`.

### 6. Test Locally

```bash
node src/index.js
```

This will:
- Fetch content from all sources (AI, Sports, Real Estate, Iran)
- Summarize specialized topics with Gemini Flash
- Generate a script with Gemini Pro
- Convert to MP3 with chunking
- Commit to your `gh-pages` branch

Check your GitHub Pages URL to verify: `https://yourusername.github.io/yourrepo/feed.xml`

## 🤖 GitHub Actions Setup

### Add Secrets

Go to: Settings → Secrets and variables → Actions → New repository secret

Add these secrets:

1. `GOOGLE_API_KEY` - Your Google AI Studio API key
2. `GCP_SERVICE_ACCOUNT_JSON` - Paste entire contents of `service-account.json`
3. `TWITTER_BEARER_TOKEN` - Twitter/X API Bearer Token (optional)
4. `PODCAST_AUTHOR` - Your name

### Add Variables

Go to: Settings → Secrets and variables → Actions → Variables tab

1. `PAGES_BASE_URL` - `https://yourusername.github.io/yourrepo`
2. `PODCAST_TITLE` - Your podcast title

### Schedule

The workflow runs automatically:
- **Time**: 6:00 AM UTC (1:00 AM Central)
- **Days**: Monday - Friday
- **Manual**: Can also trigger via "Actions" tab → "Run workflow"

## 📱 Subscribe in Your Podcast App

Add your RSS feed URL to any podcast app:

```
https://yourusername.github.io/yourrepo/feed.xml
```

**Tested apps:**
- Pocket Casts: + → Add via URL
- Overcast: Add Podcast → paste URL
- Apple Podcasts: Library → … → Follow a Show → paste URL
- Castro: Subscriptions → + → paste URL

Enable **auto-download** in app settings so episodes are ready when you wake up.

**Note:** Spotify requires manual submission at [podcasters.spotify.com](https://podcasters.spotify.com) (RSS feed includes required iTunes tags and owner email).

## 📁 Project Structure

```
daily-podcast/
├── .github/workflows/
│   └── daily-briefing.yml    # GitHub Actions workflow
├── src/
│   ├── index.js               # Main orchestrator
│   ├── fetcher.js             # Content sources + Gemini Flash summarization
│   ├── synthesizer.js         # Gemini 1.5 Pro script generation + Weather
│   ├── tts.js                 # Google TTS with chunking
│   ├── publisher.js           # RSS 2.0 + iTunes feed builder
│   ├── episodeMemory.js       # Cross-episode continuity logic
│   └── githubCommitter.js     # GitHub API commits to gh-pages
├── .env                       # Local config (gitignored)
├── service-account.json       # GCP credentials (gitignored)
├── package.json
└── README.md
```

## 🔧 How It Works

### Content Pipeline

1. **Fetch** (parallel):
   - **AI/ML**: Databricks, OpenAI, Anthropic, DeepMind, Meta, Hacker News, arXiv
   - **Sports**: SF Giants, Warriors, 49ers (previous day results via ESPN API)
   - **Real Estate**: Zillow & Redfin research feeds
   - **International**: Iran-focused news (Foreign Policy, IranWire)
   - **Newsletters**: Axios (Chicago, Energy, AI, Politics, etc.)
   - **Weather**: Chicago conditions from Open-Meteo API

2. **Summarize**:
   - Specialized topics (Sports, Real Estate) are summarized using **Gemini 1.5 Flash** before being passed to the script generator.
   - Real Estate analysis follows a strict data-driven analyst persona.
   - Sports recaps provide narrative game flows and key stats.

3. **Synthesize**:
   - Send all summarized content + weather + **Episode Memory** to **Gemini 1.5 Pro**.
   - Gemini writes a 1,200-2,000 word conversational script.
   - Natural host banter between [HOST] and [COHOST].
   - Cross-episode context allows the hosts to reference stories from the past 7 days.

4. **Convert to Audio**:
   - Google Cloud TTS (Studio voices)
   - Automatic chunking for long scripts (>5,000 bytes)
   - Sentence-based splitting for natural flow

5. **Publish**:
   - Commit MP3 to `gh-pages/episodes/`
   - Update `gh-pages/feed.xml` and `episode-memory.json`

## 💰 Cost Estimate

| Service | Usage | Cost/day |
|---------|-------|----------|
| Gemini 1.5 Pro (Script) | ~20,000 input + 2,000 output tokens | ~$0.04 |
| Gemini 1.5 Flash (Summaries) | ~5,000 tokens | ~$0.005 |
| Google TTS (Studio) | ~12,000 characters (10-15 min) | ~$0.20 |
| GitHub Actions / Pages | Daily runtime + hosting | Free |
| **Total** | | **~$0.25/day (~$90/year)** |

## 🔧 Customization

### Change Location/Weather
Edit `src/synthesizer.js` to change coordinates and timezone.

### Modify Content Sources
Edit `src/fetcher.js` to add/remove RSS feeds or adjust scraping selectors.

### Personalize the Prompt
Edit `src/synthesizer.js` to adjust host personalities, segment mandatory themes, or change target length.

## 🐛 Troubleshooting

Refer to the original documentation for detailed troubleshooting on GCP credentials, GitHub Actions permissions, and TTS chunking limits.

## 📄 License
MIT License

## 👤 Author
Ben
- Podcast: [The Data & AI Daily](https://git-bafshar.github.io/benpod/feed.xml)
