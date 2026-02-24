# Daily AI Audio Briefing — Production-Ready Specification

## Overview

Build an automated pipeline that runs daily, scrapes AI news, SF Sports recaps, Real Estate market analysis, and Iran-focused global affairs. It synthesizes a spoken-word script using Gemini Pro, converts it to audio via Google Cloud TTS, and publishes the MP3 + RSS feed to GitHub Pages — making it subscribable in any podcast app.

**Powered by Gemini Pro** — using multi-modal capabilities and long context to generate high-quality, conversational scripts.

---

## Architecture

```
Cron Job (daily via GitHub Actions)
    │
    ▼
1. Content Fetcher      — scrapes AI news, Sports API, Real Estate, Iran, Axios
    │
    ▼
2. Gemini Flash Summaries — pre-summarizes specialized data (Sports, Real Estate)
    │
    ▼
3. Script Synthesizer   — Gemini Pro 1.5 script generation with Episode Memory
    │
    ▼
4. TTS Converter        — Google TTS synthesis with sentence-chunking
    │
    ▼
5. RSS Publisher        — commits MP3 + updated feed.xml to gh-pages branch
    │
    ▼
6. Cost Tracker         — logs API usage and estimates costs (Gemini + TTS)
    │
    ▼
   Podcast app auto-downloads the new episode each morning
```

---

## Tech Stack

- **Runtime**: Node.js (≥20)
- **Scheduler**: GitHub Actions
- **LLM**: Google Gemini API (`gemini-2.5-pro` for scripts, `gemini-flash-latest` for summaries)
- **TTS**: Google Cloud Text-to-Speech API (Journey-D voice - Studio quality)
- **Hosting**: GitHub Pages
- **Delivery**: RSS 2.0 feed with iTunes tags

---

## Step-by-Step Implementation

### 1. Content Fetching (`src/fetcher.js`)

**Added Sourcing Categories:**

| Category | Source | Method |
|----------|--------|--------|
| **SF Sports** | ESPN API (NBA/MLB/NFL) | Yesterday's results for Warriors, Giants, 49ers |
| **Real Estate** | Zillow & Redfin Research | RSS feed aggregation + strict analyst summarization |
| **Iran IR** | Foreign Policy, IranWire | Geopolitics focused on international relations |
| **Axios** | Kill The Newsletter | Regional and sector-specific briefings |

**The "Kill the Newsletter" Pattern:**
To bypass the lack of public RSS feeds for premium newsletters (like Axios Chicago, Axios AI), the system uses the [Kill the Newsletter](https://kill-the-newsletter.com/) service. This transforms email-only newsletters into a private RSS feed, allowing `src/fetcher.js` to scrape them using the same XML/RSS logic as other sources.

**Specialized Summarization Prompts (Gemini Flash):**

*   **Real Estate Analysis Prompt:**
    > "Act as a real estate data analyst and article summarizer. Analyze the provided RSS feed text and extract information strictly related to the following categories to be used in a short podcast segment on market conditions.
    > Extraction Categories:
    > 1. Mortgage Rates: Any specific percentages, year-over-year changes, or forecasted movements.
    > 2. Target Price Bracket ($600k–$1.5m): Any mention of 'mid-to-high tier,' 'luxury,' or specific data points involving these price ranges.
    > 3. Geographic Specifics: Explicit data for California, Chicago (specifically north shore suburbs), and Montana.
    > 4. Market Dynamics: Evidence of buyer leverage (e.g., inventory levels, price cuts, concessions) and emerging national trends.
    > Strict Constraints: No Inference. Only report what is explicitly stated in the text."

*   **NBA Recap Prompt (Warriors):**
    > "Analyze the provided NBA game JSON data to write a concise narrative of the event. Identify the winner, final score, and game flow. Highlight top performers and those who struggled (using efficiency and +/-). Describe the game's style (e.g., defensive struggle, shootout) based on shooting percentages and turnover counts (specify counts for both teams). Note any notable stat lines or major lead swings."

*   **MLB Recap Prompt (Giants):**
    > "Analyze the provided MLB game JSON data to write a (no more than 5 sentence) concise narrative of the event. Identify the winner, final score, and game flow. Highlight top performers and those who struggled (ERA, at bats). Describe the game's style."

*   **NFL Recap Prompt (49ers):**
    > "Analyze the provided NFL game JSON data to write a concise narrative of the event. Identify the winner, final score, and game flow. Highlight top performers and those who struggled. Describe the game's style (e.g., defensive struggle, shootout) based on score and turnover counts. Note any notable stat lines or major lead swings."

---

### 2. Script Synthesis (`src/synthesizer.js`)

**Prompt Structure:**
- **Cold Open**: Personal greeting + dynamic weather integration.
- **Theme Segments**: Mandatory sections for "AI & Tech", "Real Estate Report", "Sports Desk", "Global Affairs", "Local & Regional", and "Energy & Policy".
- **Episode Memory**: Uses `episode-memory.json` to maintain continuity by referencing topics from the last 7 days.
- **Output**: Pure script with `[HOST]` and `[COHOST]` tags for natural back-and-forth.

---

### 3. Audio & Publishing

- **TTS**: Uses Google Cloud TTS `en-US-Journey-D`. Splits script into sentences to handle the 5000-byte API limit.
- **Git Publishing**: Uses GitHub API to commit directly to `gh-pages` branch, bypassing the need for a local git binary in the environment.
- **RSS**: Compliant with Apple Podcasts and Spotify requirements (iTunes tags, owner email, square artwork).

---

## Daily Operating Costs (Feb 2026 rates)

| Service | Usage | Cost/episode |
|---------|-------|--------------|
| Gemini 2.5 Pro | ~15,000 input + 2,000 output tokens | ~$0.03 |
| Gemini 2.5 Flash | ~5,000 tokens (summaries + memory) | ~$0.001 |
| Google TTS (Journey-D) | ~10,000 characters | ~$0.00 (within 1M char free tier) |
| **Total per episode** | | **~$0.04** |

---

## Project Structure

```
daily-podcast/
├── src/
│   ├── index.js               # Main orchestrator
│   ├── fetcher.js             # Multi-source scraper + Flash summaries
│   ├── synthesizer.js         # Gemini Pro script generator
│   ├── episodeMemory.js       # Cross-episode context management
│   ├── tts.js                 # Google TTS with chunking
│   ├── publisher.js           # RSS feed builder
│   ├── githubCommitter.js     # GitHub API publisher
│   └── costTracker.js         # Gemini-aware cost tracking
├── scripts/                   # Cost reporting and model checking
├── tests/                     # Unit tests
└── docs/                      # Diagrams and specs
```
