# GitHub Pages Setup Guide

This guide walks you through setting up GitHub Pages to host your daily AI podcast with an RSS feed.

## Prerequisites

- GitHub repository (this one!)
- Anthropic API key
- Google Cloud TTS credentials

## Step 1: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **Settings** → **Pages** (in the left sidebar)
3. Under **Source**, select:
   - Branch: `gh-pages`
   - Folder: `/ (root)`
4. Click **Save**

GitHub will provide your site URL (e.g., `https://your-username.github.io/your-repo-name`)

## Step 2: Initialize gh-pages Branch

The workflow will automatically create and populate the `gh-pages` branch on the first run. Alternatively, you can initialize it manually:

```bash
# Create empty gh-pages branch
git checkout --orphan gh-pages
git rm -rf .
echo "# Daily Podcast Episodes" > README.md
mkdir episodes
git add README.md
git commit -m "Initialize gh-pages"
git push origin gh-pages
git checkout main
```

## Step 3: Configure Repository Secrets

Go to **Settings** → **Secrets and variables** → **Actions** → **Repository secrets**

Add the following secrets:

### Required Secrets

1. **ANTHROPIC_API_KEY**
   - Your Anthropic API key for Claude
   - Get from: https://console.anthropic.com/

2. **GOOGLE_SERVICE_ACCOUNT_JSON**
   - Your Google Cloud service account JSON (for Text-to-Speech)
   - Get from: Google Cloud Console → IAM & Admin → Service Accounts
   - Ensure the service account has "Cloud Text-to-Speech User" role

### Built-in Secret (No Action Needed)

- **GITHUB_TOKEN** - Automatically provided by GitHub Actions

## Step 4: Configure Repository Variables

Go to **Settings** → **Secrets and variables** → **Actions** → **Variables**

Add the following variables:

1. **GITHUB_PAGES_BASE_URL**
   - Your GitHub Pages URL
   - Example: `https://your-username.github.io/your-repo-name`
   - No trailing slash

2. **PODCAST_TITLE** (optional)
   - Default: "The Data & AI Daily"
   - Customize your podcast name

3. **PODCAST_AUTHOR** (optional)
   - Default: "Unknown"
   - Your name or organization

## Step 5: Verify Configuration

After setup, manually trigger the workflow:

1. Go to **Actions** tab
2. Select "Daily AI Briefing"
3. Click **Run workflow**
4. Select branch: `main`
5. Click **Run workflow**

## Step 6: Subscribe to Your Podcast

Once the first episode is published, your RSS feed will be available at:

```
https://YOUR-USERNAME.github.io/YOUR-REPO-NAME/feed.xml
```

You can add this URL to any podcast app (Apple Podcasts, Overcast, Pocket Casts, etc.)

### Apple Podcasts

1. Open Apple Podcasts
2. File → Import from URL
3. Paste your feed.xml URL

### Overcast

1. Open Overcast
2. + (Add podcast)
3. Add URL
4. Paste your feed.xml URL

## Automated Schedule

The workflow runs automatically at:
- **11:00 AM UTC** (5:00 AM CST)
- **Monday through Friday**

You can also trigger it manually anytime from the Actions tab.

## Troubleshooting

### "Failed to publish to GitHub Pages"

- Verify `gh-pages` branch exists
- Check that GitHub Pages is enabled in Settings
- Ensure workflow has `contents: write` permission

### "Authentication failed"

- Verify `GITHUB_TOKEN` is working (it's automatic, but check Actions logs)
- Check that secrets are properly configured

### "Feed not updating"

- Check the Actions tab for workflow run results
- Verify the `feed.xml` file exists in the `gh-pages` branch
- GitHub Pages can take a few minutes to deploy changes

### "Audio not generating"

- Check `GOOGLE_SERVICE_ACCOUNT_JSON` is valid
- Ensure service account has Text-to-Speech API enabled
- Verify `GOOGLE_APPLICATION_CREDENTIALS` path is correct

## File Structure (gh-pages branch)

```
gh-pages/
├── feed.xml                    # RSS 2.0 podcast feed
├── episodes/
│   ├── AI-Briefing-2024-01-15.mp3
│   ├── AI-Briefing-2024-01-16.mp3
│   └── ...
└── README.md
```

## RSS Feed Format

The feed follows RSS 2.0 with iTunes podcast extensions, compatible with all major podcast apps:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>The Data & AI Daily</title>
    <link>https://your-username.github.io/your-repo-name</link>
    <description>Daily briefing on Databricks releases and AI developments.</description>
    <language>en-us</language>
    <itunes:author>Your Name</itunes:author>
    <itunes:category text="Technology"/>
    <itunes:explicit>false</itunes:explicit>
    <item>
      <title>The Data & AI Daily — 2024-01-15</title>
      <description>...</description>
      <pubDate>Mon, 15 Jan 2024 00:00:00 GMT</pubDate>
      <enclosure url="..." length="..." type="audio/mpeg"/>
      <guid isPermaLink="true">...</guid>
      <itunes:duration>...</itunes:duration>
    </item>
  </channel>
</rss>
```

## Next Steps

After setup is complete:
- Monitor the Actions tab for the first run
- Subscribe to your feed in a podcast app
- Enjoy your daily AI briefing!
