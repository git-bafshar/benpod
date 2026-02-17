# Daily AI Audio Briefing

Automated daily audio briefing covering Databricks releases and top AI news, synthesized with Claude and delivered to Google Drive.

## 🎯 Features

- **Automated Daily Pipeline**: Runs Monday-Friday at 8:00 AM UTC via GitHub Actions
- **Multi-Source Content**: Aggregates from Databricks release notes, blog, Hacker News, and arXiv
- **AI-Powered Script**: Claude generates natural, conversational audio scripts
- **High-Quality Audio**: Google Cloud Text-to-Speech with Journey voice
- **Google Drive Delivery**: Automatic upload with transcript

## 📋 Prerequisites

1. **Anthropic API Key** - Get from https://console.anthropic.com
2. **Google Cloud Project** with:
   - Text-to-Speech API enabled
   - Drive API enabled
   - Service Account with JSON key
3. **Google Drive Folder** shared with service account

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <repo-url>
cd daily-podcast
npm install
```

### 2. Configure Environment

Create `.env` file:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
GOOGLE_DRIVE_FOLDER_ID=your-folder-id-here
```

### 3. Set Up Google Cloud

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable APIs:
   - **Cloud Text-to-Speech API**
   - **Google Drive API**
4. Create Service Account:
   - IAM & Admin → Service Accounts → Create
   - Grant roles: "Service Account User"
   - Create JSON key → Save as `service-account.json`
5. Share your Google Drive folder with the service account email

### 4. Test Locally

```bash
node src/index.js
```

## 🤖 GitHub Actions Setup

### Add Secrets

Go to: Settings → Secrets and variables → Actions → New repository secret

Add these secrets:

1. `ANTHROPIC_API_KEY` - Your Anthropic API key
2. `GOOGLE_SERVICE_ACCOUNT_JSON` - Paste entire contents of `service-account.json`
3. `GOOGLE_DRIVE_FOLDER_ID` - Your Drive folder ID from URL

### Schedule

The workflow runs automatically:
- **Time**: 8:00 AM UTC (3:00 AM EST)
- **Days**: Monday - Friday
- **Manual**: Can also trigger via "Actions" tab → "Run workflow"

## 📁 Project Structure

```
daily-podcast/
├── .github/workflows/
│   └── daily-briefing.yml    # GitHub Actions workflow
├── src/
│   ├── index.js               # Main orchestrator
│   ├── fetcher.js             # Content scraping
│   ├── synthesizer.js         # Claude script generation
│   ├── tts.js                 # Text-to-speech conversion
│   └── uploader.js            # Google Drive upload
├── .env.example               # Environment template
├── .gitignore
├── package.json
└── README.md
```

## 🔧 How It Works

1. **Fetch** - Scrapes Databricks release notes, blog, Hacker News AI stories, and arXiv papers
2. **Synthesize** - Claude generates a 3-5 minute spoken-word script
3. **Convert** - Google Cloud TTS creates high-quality MP3 audio
4. **Upload** - Files delivered to Google Drive folder

## 💰 Cost Estimate

| Service | Usage | Cost/day |
|---------|-------|----------|
| Claude API (Sonnet) | ~2,000 input + 1,500 output tokens | ~$0.01 |
| Google TTS | ~4,500 characters | ~$0.02 |
| GitHub Actions | ~2 min runtime | Free |
| Google Drive API | Upload calls | Free |
| **Total** | | **~$0.03/day (~$11/year)** |

## 🎨 Customization

### Change Voice

Edit `src/tts.js`:

```javascript
voice: {
  languageCode: 'en-US',
  name: 'en-US-Journey-F',  // Female voice
  // or 'en-US-Journey-D' for male
}
```

### Adjust Schedule

Edit `.github/workflows/daily-briefing.yml`:

```yaml
schedule:
  - cron: '0 13 * * 1-5'  # 1:00 PM UTC = 8:00 AM EST
```

### Modify Content Sources

Edit `src/fetcher.js` to add/remove sources or adjust filtering.

## 🐛 Troubleshooting

### "Authentication failed"
- Check that `ANTHROPIC_API_KEY` is correct
- Verify service account JSON is valid
- Ensure Drive folder is shared with service account email

### "Voice not found" error
- Journey voices require Google Cloud TTS v1 or v1beta1
- Alternative: Use `en-US-Neural2-A` for standard quality

### No content fetched
- Databricks page structure may have changed
- Check `src/fetcher.js` CSS selectors
- Test individual fetcher functions

### GitHub Actions fails
- Check Actions logs for specific errors
- Verify all secrets are set correctly
- Test locally first with `node src/index.js`

## 📝 Development

### Run Locally

```bash
node src/index.js
```

### Test Individual Components

```javascript
// Test fetcher
const { fetchDatabricksBlog } = require('./src/fetcher');
fetchDatabricksBlog().then(console.log);

// Test synthesizer
const { synthesizeScript } = require('./src/synthesizer');
synthesizeScript({ releaseNotes: [], blogPosts: [], aiNews: [] }).then(console.log);
```

## 🚀 Future Enhancements

- [ ] Email/Slack notifications with Drive link
- [ ] Weekend "week in review" format
- [ ] Deduplication of repeated news items
- [ ] Multiple voices for two-host format
- [ ] Personalized content filtering

## 📄 License

MIT License - Feel free to use and modify for your own podcast automation!

## 👤 Author

Tyler - [howdy@tyler.rodeo](mailto:howdy@tyler.rodeo)
