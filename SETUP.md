# Daily AI Audio Briefing - Setup Guide

## ✨ What Was Built

A fully automated daily podcast system with:

- **🎭 Two-Host Format**: Alex (male voice) and Jordan (female voice) alternate speaking
- **📅 Friday Special**: Automatic "Week in Review" format on Fridays
- **📝 Transcripts**: Saved alongside MP3 files
- **🤖 AI-Powered**: Claude generates natural conversational scripts
- **🎙️ High-Quality Audio**: Google Cloud TTS with Journey voices
- **☁️ Auto-Delivery**: Uploads to Google Drive daily
- **⚙️ GitHub Actions**: Runs automatically Monday-Friday at 8 AM UTC

## 📁 Project Structure

```
daily-podcast/
├── .github/workflows/
│   └── daily-briefing.yml       # GitHub Actions automation
├── src/
│   ├── index.js                 # Main orchestrator
│   ├── fetcher.js               # Scrapes Databricks & AI news
│   ├── synthesizer.js           # Claude two-host script generation
│   ├── tts.js                   # Multi-voice audio synthesis
│   └── uploader.js              # Google Drive upload
├── .env.example                 # Environment template
├── .gitignore
├── package.json
├── README.md                    # Full documentation
└── SETUP.md                     # This file
```

## 🚀 Quick Setup

### 1. Install Dependencies

```bash
npm install
```

**Already installed:**
- `@anthropic-ai/sdk` - Claude API
- `@google-cloud/text-to-speech` - Google TTS
- `googleapis` - Google Drive API
- `fluent-ffmpeg` + `@ffmpeg-installer/ffmpeg` - Audio processing
- `axios` + `cheerio` - Web scraping
- `dotenv` - Environment configuration

### 2. Configure Environment

Copy the example:
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```
ANTHROPIC_API_KEY=sk-ant-your-key-here
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
GOOGLE_DRIVE_FOLDER_ID=your-folder-id-here
```

### 3. Google Cloud Setup

#### Create Service Account:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create/select project
3. Enable APIs:
   - **Cloud Text-to-Speech API** (for multi-voice audio)
   - **Google Drive API** (for uploads)
4. Create Service Account:
   - IAM & Admin → Service Accounts → Create
   - Name: `daily-ai-briefing`
   - Roles: Service Account User
5. Create JSON key → Save as `service-account.json` in project root

#### Share Google Drive Folder:
1. Create a folder in Google Drive
2. Share it with your service account email (from JSON file)
3. Give "Editor" permission
4. Copy folder ID from URL: `https://drive.google.com/drive/folders/<FOLDER_ID>`

### 4. Test Locally

```bash
npm start
```

**What happens:**
1. Fetches Databricks release notes, blog posts, Hacker News AI stories, arXiv papers
2. Claude generates a two-host conversational script
3. Google TTS creates audio with Alex (male) and Jordan (female) voices
4. Combines segments into single MP3
5. Uploads MP3 + transcript to Google Drive

**Expected output:**
```
====================================================================
Starting Daily AI Audio Briefing Pipeline
====================================================================

STEP 1: Fetching content from sources...
  Found 5 release notes
  Found 5 blog posts
  Found 5 AI stories
  Found 3 papers
  Total items collected: 18

STEP 2: Synthesizing audio script...
  Synthesizing two-host script with Claude...
  Generated script: 687 words, 32 lines

STEP 3: Converting to audio...
  Found 32 segments from 2 speakers
  Generating segment 32/32 (jordan)...
  Combining audio segments...
  ✅ Audio saved to /tmp/AI-Briefing-2026-02-17.mp3 (1234.56 KB)

STEP 4: Uploading to Google Drive...
  ✅ Uploaded: https://drive.google.com/file/d/.../view
  File ID: abc123xyz

====================================================================
✅ PIPELINE COMPLETE!
====================================================================
  Duration: 45.23s
  Items processed: 18
  Script words: 687
  Audio file: AI-Briefing-2026-02-17.mp3
  Drive link: https://drive.google.com/file/d/.../view

  Transcript uploaded: AI-Briefing-2026-02-17-script.txt

Briefing delivered successfully! 🎉
```

## 🤖 GitHub Actions Setup

### Add Repository Secrets

Settings → Secrets and variables → Actions → New repository secret

**Required secrets:**
1. `ANTHROPIC_API_KEY` - Your Claude API key
2. `GOOGLE_SERVICE_ACCOUNT_JSON` - Entire contents of `service-account.json`
3. `GOOGLE_DRIVE_FOLDER_ID` - Your Drive folder ID

### Test Manual Run

1. Go to "Actions" tab in GitHub
2. Select "Daily AI Briefing" workflow
3. Click "Run workflow" → "Run workflow"
4. Wait 1-2 minutes for completion
5. Check your Google Drive folder for files

### Schedule

The workflow runs automatically:
- **Time**: 8:00 AM UTC (3:00 AM EST / 12:00 AM PST)
- **Days**: Monday through Friday
- **Special**: Friday runs "Week in Review" format

To change schedule, edit `.github/workflows/daily-briefing.yml`:
```yaml
schedule:
  - cron: '0 13 * * 1-5'  # Example: 1:00 PM UTC = 8:00 AM EST
```

## 🎭 Two-Host Feature

### How It Works

1. **Claude generates script** with speaker labels:
   ```
   Alex: Welcome to The Data & AI Daily for Monday, February 17th.
   Jordan: Thanks Alex! What's on the agenda today?
   Alex: Let's start with some exciting news from Databricks...
   ```

2. **TTS processes each segment** with appropriate voice:
   - **Alex** = `en-US-Journey-D` (male)
   - **Jordan** = `en-US-Journey-F` (female)

3. **FFmpeg combines segments** into single MP3

### Customizing Voices

Edit `src/tts.js`:
```javascript
const VOICES = {
  alex: {
    languageCode: 'en-US',
    name: 'en-US-Journey-D',  // Change to any Google TTS voice
  },
  jordan: {
    languageCode: 'en-US',
    name: 'en-US-Journey-F',
  }
};
```

**Available Journey voices:**
- `en-US-Journey-D` - Male
- `en-US-Journey-F` - Female
- `en-US-Journey-O` - Female

## 📅 Friday Special Edition

On Fridays, Claude automatically generates a "Week in Review" format:

- **Opens** with "It's Friday, time for our week in review!"
- **Summarizes** top 3 Databricks stories from the week
- **Highlights** top 3 AI industry moments
- **Identifies** common themes and trends
- **Closes** with weekend wishes and next week teaser

No configuration needed - automatically detects Friday!

## 💰 Cost Estimate

| Service | Daily Cost |
|---------|-----------|
| Claude API (Sonnet 4.5) | ~$0.01 |
| Google TTS (Journey voices) | ~$0.02 |
| GitHub Actions | Free |
| Google Drive API | Free |
| **Total** | **~$0.03/day** |

**Annual**: ~$11/year (weekdays only)

## 🔧 Troubleshooting

### "Authentication failed"
- Verify `ANTHROPIC_API_KEY` is correct
- Check `service-account.json` is valid
- Ensure Drive folder is shared with service account

### "Voice not found"
- Journey voices may require TTS API v1 or v1beta1
- Fallback: Use `en-US-Neural2-A` or `en-US-Neural2-F`

### FFmpeg errors
- ffmpeg is auto-installed via `@ffmpeg-installer/ffmpeg`
- If issues persist, install system ffmpeg: `brew install ffmpeg`

### No content fetched
- Databricks site structure may have changed
- Check `src/fetcher.js` CSS selectors
- Test individual fetchers

### GitHub Actions fails
- Check Actions logs for specific errors
- Verify all secrets are set
- Test locally first

## 📝 Files Generated

**Daily output:**
- `AI-Briefing-YYYY-MM-DD.mp3` - Multi-voice audio podcast
- `AI-Briefing-YYYY-MM-DD-script.txt` - Full transcript with speaker labels

Both uploaded to Google Drive automatically.

## 🎉 You're All Set!

The project is now:
- ✅ Rebuilt from scratch
- ✅ Two-host format implemented
- ✅ Friday special edition added
- ✅ Transcripts saved
- ✅ Ready to run locally or on GitHub Actions

**Next steps:**
1. Test locally: `npm start`
2. Verify audio quality
3. Set up GitHub Actions secrets
4. Trigger manual workflow run
5. Let it run automatically Monday-Friday!
