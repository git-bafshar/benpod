# GitHub Actions Workflow Setup Notes

## Overview

This document outlines the configuration issues encountered when setting up the forked daily-podcast pipeline and the fixes required to get GitHub Actions working.

**Note**: This fork uses Gemini (via `GOOGLE_API_KEY`) instead of Claude for script generation to keep everything in the Google family (Gemini + Google Cloud TTS).

---

## Missing Configuration Requirements

The original repository's workflow expects several environment variables and secrets that aren't documented in the setup instructions.

### 1. Missing Environment Variables

**Problem**: The workflow file references variables that must be configured in repository settings but aren't mentioned in documentation.

**Missing from workflow env section:**
```yaml
GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}
```

**Repository variables required** (Settings → Secrets and variables → Actions → Variables):
- `PAGES_BASE_URL` - GitHub Pages URL (e.g., `https://username.github.io/repo-name`)
- `PODCAST_TITLE` - Your podcast title

**Repository secrets required** (Settings → Secrets and variables → Actions → Secrets):
- `GOOGLE_API_KEY` - Gemini API key for script generation
- `GCP_SERVICE_ACCOUNT_JSON` - Google Cloud service account JSON for TTS
- `PODCAST_AUTHOR` - Podcast author name

### Setup Commands

```bash
# Set repository variables
gh variable set PAGES_BASE_URL --body "https://username.github.io/repo-name" --repo username/repo
gh variable set PODCAST_TITLE --body "Your Podcast Title" --repo username/repo

# Set repository secrets
gh secret set GOOGLE_API_KEY --body "your-gemini-api-key" --repo username/repo
gh secret set GCP_SERVICE_ACCOUNT_JSON --repo username/repo < service-account.json
gh secret set PODCAST_AUTHOR --body "Your Name" --repo username/repo
```

---

## Workflow Configuration Issues

### 2. GCP Service Account JSON Formatting

**Problem**: Using `echo` to write the service account JSON file mangles special characters and newlines, causing TTS authentication to fail.

**Original (broken):**
```yaml
- name: Write GCP credentials
  run: echo '${{ secrets.GCP_SERVICE_ACCOUNT_JSON }}' > gcp-key.json
```

**Error encountered:**
```
2 UNKNOWN: Getting metadata from plugin failed with error:
key must be a string, a buffer or an object
```

**Fix applied:**
```yaml
- name: Write GCP credentials
  run: |
    echo '${{ secrets.GCP_SERVICE_ACCOUNT_JSON }}' | jq '.' > gcp-key.json
    cat gcp-key.json  # Debug: verify file was written correctly
```

Using `jq` ensures the JSON is properly formatted and validated before writing to file.

**Alternative fix** (using heredoc):
```yaml
- name: Write GCP credentials
  run: |
    cat > gcp-key.json << 'EOF'
    ${{ secrets.GCP_SERVICE_ACCOUNT_JSON }}
    EOF
```

---

### 3. Incorrect PAGES_BASE_URL Value

**Problem**: When setting up the repository variable, it's easy to use the GitHub repository URL instead of the GitHub Pages URL.

**Wrong:**
```
PAGES_BASE_URL=https://github.com/username/repo
```

**Correct:**
```
PAGES_BASE_URL=https://username.github.io/repo
```

This causes the RSS feed to reference incorrect episode URLs.

---

## Environment Variable Reference

### Required in Workflow

The `daily-briefing.yml` workflow needs these environment variables:

```yaml
env:
  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}  # Optional if using Gemini
  GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}        # Required for Gemini
  GOOGLE_APPLICATION_CREDENTIALS: ./gcp-key.json       # Required for TTS
  TWITTER_BEARER_TOKEN: ${{ secrets.TWITTER_BEARER_TOKEN }}  # Optional
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}            # Auto-provided by GitHub
  GITHUB_REPOSITORY: ${{ github.repository }}          # Auto-provided by GitHub
  PAGES_BASE_URL: ${{ vars.PAGES_BASE_URL }}          # Must be set manually
  PODCAST_TITLE: ${{ vars.PODCAST_TITLE }}            # Must be set manually
  PODCAST_AUTHOR: ${{ secrets.PODCAST_AUTHOR }}       # Must be set manually
```

### Local Development (.env)

For local testing, create a `.env` file:

```bash
ANTHROPIC_API_KEY=sk-ant-...              # Optional if using Gemini
GOOGLE_API_KEY=AIzaSy...                  # Required for Gemini
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
TWITTER_BEARER_TOKEN=your-token           # Optional
GITHUB_TOKEN=ghp_...                      # For local GitHub API calls
GITHUB_REPOSITORY=username/repo-name
PAGES_BASE_URL=https://username.github.io/repo-name
PODCAST_TITLE="Your Podcast Title"
PODCAST_AUTHOR="Your Name"
```

---

## Summary for Original Repository Author

### Documentation Gaps

The README should include:

1. **Complete list of required GitHub repository variables and secrets**
2. **Setup commands for configuring the repository**
3. **Note about PAGES_BASE_URL format** (GitHub Pages URL, not repo URL)
4. **Instructions for uploading service account JSON** (use `gh secret set < file`, not copy-paste)

### Workflow Improvements

Consider adding to `.github/workflows/daily-briefing.yml`:

1. Add `GOOGLE_API_KEY` to environment variables (currently missing)
2. Improve GCP credentials writing (use heredoc or jq validation instead of raw echo)
3. Add validation step to check required environment variables before pipeline starts
4. Add debug output for service account file to help troubleshoot auth issues

### Suggested Additions

**Pre-flight check step:**
```yaml
- name: Validate environment
  run: |
    if [ -z "$PAGES_BASE_URL" ]; then
      echo "Error: PAGES_BASE_URL not set"
      exit 1
    fi
    if [ -z "$GOOGLE_API_KEY" ]; then
      echo "Error: GOOGLE_API_KEY not set"
      exit 1
    fi
    echo "Environment validation passed"
```

---

## Gemini vs Claude Model Usage

**Note**: This fork uses Gemini models instead of Anthropic Claude to keep all AI/ML services in the Google ecosystem:

- **Script generation**: Gemini 1.5 Pro (via `GOOGLE_API_KEY`)
- **Text-to-speech**: Google Cloud TTS (via service account)
- **Summarization**: Gemini 1.5 Flash

This simplifies billing, API management, and keeps everything under one Google Cloud project.

**Cost per episode (~$0.12)**:
- Gemini API: ~$0.01
- Google TTS: ~$0.11

---

## Testing the Setup

After configuring all variables and secrets:

```bash
# Trigger workflow manually
gh workflow run daily-briefing.yml --repo username/repo

# Monitor the run
gh run list --repo username/repo --workflow=daily-briefing.yml --limit 1

# Watch live logs
gh run watch <run-id> --repo username/repo
```

Expected output after ~90-120 seconds:
- ✅ Episode published to `https://username.github.io/repo/episodes/AI-Briefing-YYYY-MM-DD.mp3`
- ✅ RSS feed updated at `https://username.github.io/repo/feed.xml`

---

## Common Errors

### "PAGES_BASE_URL not found in environment"
- Missing repository variable
- Run: `gh variable set PAGES_BASE_URL --body "https://username.github.io/repo"`

### "GOOGLE_API_KEY not found in environment"
- Missing from workflow env vars OR missing secret
- Add to workflow YAML and set secret

### "Getting metadata from plugin failed"
- GCP service account JSON is malformed
- Re-upload with: `gh secret set GCP_SERVICE_ACCOUNT_JSON < service-account.json`
- Ensure workflow uses jq or heredoc to write the file

### Episode URLs return 404
- Check `PAGES_BASE_URL` is set to GitHub Pages URL, not repo URL
- Wait 1-2 minutes for GitHub Pages to deploy after commit

---

## Repository Information

- **Original**: [tylernwatson/daily-podcast](https://github.com/tylernwatson/daily-podcast)
- **Fork**: git-bafshar/benpod
- **Model switch**: Claude → Gemini for script generation
