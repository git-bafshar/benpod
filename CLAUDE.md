# CLAUDE.md

## Project Overview

Automated daily podcast pipeline: scrapes Databricks + AI news sources, synthesizes a script via Claude API, converts to audio via Google Cloud TTS, and publishes to GitHub Pages as an RSS feed.

## Quick Commands

- `npm start` — run the full pipeline locally
- `npm test` — run Jest tests
- `npm run cost-report -- 30` — view cost report for last N days
- `gh workflow run daily-briefing.yml` — trigger pipeline manually on GitHub Actions

## Architecture

```text
src/index.js          — main orchestrator (runs steps 1-5, retry logic)
src/fetcher.js        — scrapes 13+ content sources (RSS, HTML, APIs)
src/synthesizer.js    — Claude API script generation + weather integration
src/weather.js        — Open-Meteo weather API (Austin, TX)
src/tts.js            — Google Cloud TTS with sentence-based chunking
src/publisher.js      — RSS 2.0 feed builder with iTunes tags
src/githubCommitter.js — commits files to gh-pages via GitHub API
src/costTracker.js    — per-run cost tracking (Claude, TTS, Twitter)
src/ttsUsageTracker.js — monthly TTS usage persistence to gh-pages
```

## Key Patterns

- **GitHub Pages publishing**: all audio + feed files go to `gh-pages` branch via GitHub API (no git binary needed). See `githubCommitter.js` for the `getFileSha()` → `commitFile()` pattern.
- **TTS chunking**: Google TTS has a 5000-byte limit per request. Scripts are split on sentence boundaries, each chunk is synthesized separately, and MP3 buffers are concatenated.
- **Feed updates**: `publisher.js` inserts new episodes into existing `feed.xml`. Channel metadata is NOT updated on subsequent runs — if you change podcast title/description, you must regenerate or manually edit the live feed.
- **Cost tracking**: ephemeral per-run logs go to `/tmp/podcast-costs.jsonl`. Monthly TTS character usage is persisted to `tts-usage.json` on gh-pages for free-tier monitoring.

## Environment Variables

Required: `ANTHROPIC_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`, `PAGES_BASE_URL`, `GITHUB_REPOSITORY`, `GITHUB_TOKEN`
Optional: `TWITTER_BEARER_TOKEN`, `PODCAST_TITLE`, `PODCAST_AUTHOR`

**Do NOT use `GITHUB_PAGES_BASE_URL`** — GitHub rejects env vars starting with `GITHUB_`. Use `PAGES_BASE_URL`.

## Git Workflow

- Always create a feature branch for changes — never commit directly to `main`
- Use PRs to merge into `main`

## Conventions

- Node.js with CommonJS (`require`/`module.exports`)
- No TypeScript
- Tests live in `tests/` with `.test.js` suffix
- Pipeline failures retry up to 2x (`runWithRetry` in index.js)
- Individual TTS chunks retry on gRPC INTERNAL errors
- All content fetching is gracefully degraded — individual source failures don't break the pipeline

## Schedule

Runs daily at 5:00 AM Central (11:00 UTC) via GitHub Actions. See `.github/workflows/daily-briefing.yml`.
