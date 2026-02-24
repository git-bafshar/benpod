# CLAUDE.md

## Project Overview

Automated daily podcast pipeline: aggregates AI news, SF Sports (Warriors/Giants/49ers), Real Estate trends, Iran-focused global affairs, and Axios newsletters. Synthesizes a script via Gemini 1.5 Pro, converts to audio via Google Cloud TTS, and publishes to GitHub Pages as an RSS feed.

Content sources:
- AI/ML news (OpenAI, Anthropic, DeepMind, Meta, tech media, Hacker News, arXiv)
- SF Sports recaps (Warriors, Giants, 49ers via ESPN API)
- Real Estate market analysis (summarized from Zillow/Redfin RSS)
- International relations centered on Iran (Foreign Policy, IranWire)
- Axios newsletters via Kill The Newsletter RSS feed (Chicago, Energy, AI, Daily Essentials, PM, Finish Line)

## Quick Commands

- `npm start` — run the full pipeline locally
- `npm start -- --dry-run` — run pipeline without publishing
- `npm test` — run Jest tests
- `npm run cost-report -- 30` — view cost report for last N days
- `gh workflow run daily-briefing.yml` — trigger pipeline manually on GitHub Actions

## Architecture

```text
src/index.js          — main orchestrator (runs steps 1-5, retry logic)
src/fetcher.js        — scrapes AI news, sports API, real estate, and newsletters
src/synthesizer.js    — Gemini 1.5 Pro script generation + weather integration
src/episodeMemory.js  — cross-episode context and continuity management
src/tts.js            — Google Cloud TTS with sentence-based chunking
src/publisher.js      — RSS 2.0 feed builder with iTunes tags
src/githubCommitter.js — commits files to gh-pages via GitHub API
src/costTracker.js    — per-run cost tracking (Gemini, TTS)
src/ttsUsageTracker.js — monthly TTS usage persistence to gh-pages
```

## Environment Variables

Required: `GOOGLE_API_KEY` (Gemini), `GOOGLE_APPLICATION_CREDENTIALS` (TTS), `PAGES_BASE_URL`, `GITHUB_REPOSITORY`, `GITHUB_TOKEN`
Optional: `PODCAST_TITLE`, `PODCAST_AUTHOR`, `TWITTER_BEARER_TOKEN`, `ANTHROPIC_API_KEY`

**Do NOT use `GITHUB_PAGES_BASE_URL`** — GitHub rejects env vars starting with `GITHUB_`. Use `PAGES_BASE_URL`.

## Git Workflow

- **Never commit directly to `main`** — always create a feature branch first
- Push the branch and open a PR to merge into `main`
- Wait for CI checks to pass before merging

## Conventions

- Node.js with CommonJS (`require`/`module.exports`)
- No TypeScript
- All summarization and script tasks use Gemini (Pro for scripts, Flash for sub-tasks)
- Pipeline failures retry up to 2x (`runWithRetry` in index.js)
- Individual TTS chunks retry on gRPC INTERNAL errors
- All content fetching is gracefully degraded — individual source failures don't break the pipeline