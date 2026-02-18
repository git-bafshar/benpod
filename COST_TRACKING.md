# Cost Tracking Guide

The podcast pipeline includes comprehensive cost tracking for all API usage.

## What's Tracked

- **Anthropic Claude API** (Sonnet 4.6)
  - Input tokens × $3 per million
  - Output tokens × $15 per million
  - Typical cost: ~$0.04 per episode

- **Google Cloud TTS** (Journey-D voice)
  - Characters × $16 per million (WaveNet/Neural voices)
  - Typical cost: ~$0.04 per episode

- **Twitter API** (if enabled)
  - Flat $100/month regardless of usage
  - Currently disabled (no token set)

- **GitHub Actions & Pages**
  - Free (no tracking needed)

## How It Works

### Automatic Tracking

Every time the pipeline runs, it:
1. Tracks Claude API usage (input/output tokens)
2. Tracks TTS usage (characters processed)
3. Calculates costs based on current API rates
4. Prints a summary to the console
5. Logs costs to `/tmp/podcast-costs.jsonl`

### Cost Log Format

Each run is logged as a JSON line:
```json
{
  "costs": {
    "claude": 0.0423,
    "tts": 0.0384,
    "twitter": 0,
    "total": 0.0807
  },
  "usage": {
    "claudeInputTokens": 8234,
    "claudeOutputTokens": 1523,
    "ttsCharacters": 9216,
    "twitterCalls": 0
  },
  "timestamp": "2026-02-18T12:15:00.000Z"
}
```

## Viewing Cost Reports

### Quick Summary (Last 30 Days)

```bash
npm run cost-report
```

### Custom Time Range

```bash
npm run cost-report -- 7   # Last 7 days
npm run cost-report -- 90  # Last 90 days
```

### Sample Output

```
📊 COST REPORT (Last 30 days)
============================================================
  Total runs: 22

  Claude API: $0.9306
  Google TTS: $0.8448

  Total: $1.7754
  Average per run: $0.0807
  Projected monthly (22 workdays): $1.78
============================================================
```

## Cost Breakdown by Service

### Current Rates (as of Feb 2026)

| Service | Rate | Typical Usage | Cost per Episode |
|---------|------|---------------|------------------|
| Claude Sonnet 4.6 (input) | $3 per 1M tokens | ~8,000 tokens | $0.024 |
| Claude Sonnet 4.6 (output) | $15 per 1M tokens | ~1,500 tokens | $0.023 |
| Google TTS (Journey-D) | $16 per 1M chars | ~9,000 chars | $0.144 |
| **Total per episode** | | | **~$0.19** |

**Note:** The actual cost per episode varies based on:
- Amount of content fetched (affects input tokens)
- Script length (affects output tokens and TTS characters)
- Whether chunking is needed for TTS

### Monthly Projections

**Weekday-only schedule (22 days/month):**
- Variable costs: ~$1.78/month
- Twitter API (if enabled): $100/month
- **Total: $1.78-101.78/month**

**Annual:**
- Without Twitter: ~$21/year
- With Twitter: ~$1,221/year

## Monitoring Actual Costs

The cost tracker uses estimated rates. For actual costs:

### Anthropic API

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Navigate to Settings → Billing
3. View usage and costs by day/month

### Google Cloud Platform

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Navigate to Billing → Reports
3. Filter by product: Cloud Text-to-Speech API
4. View costs by day/month

### Twitter API

1. Go to [developer.twitter.com](https://developer.twitter.com)
2. View subscription details
3. Flat $100/month (no usage-based tracking needed)

## Cost Optimization Tips

### Reduce Claude API Costs

- **Shorter scripts:** Reduce `max_tokens` from 2500 to 2000 in `src/synthesizer.js`
- **Fewer sources:** Remove low-value content sources from `src/fetcher.js`
- **Use Haiku:** Switch to Claude Haiku for ~$0.006/episode (but lower quality)

### Reduce TTS Costs

- **Standard voices:** Switch from Journey-D (WaveNet) to Neural2 voices (75% cheaper)
  - Edit `src/tts.js`: Change voice to `en-US-Neural2-A`
  - Cost: ~$0.036/episode instead of ~$0.144/episode
- **Shorter scripts:** Generate 5-minute episodes instead of 8-12 minutes

### Current Configuration

The current setup prioritizes **quality over cost**:
- Claude Sonnet 4.6 (best editorial quality)
- Journey-D voice (best TTS quality)
- 8-12 minute episodes (comprehensive coverage)

**Total cost: ~$0.19/episode or ~$21/year** — a reasonable price for automated, high-quality daily briefings.

## Troubleshooting

### Cost Log Not Found

If `npm run cost-report` shows "No cost log found":
- Run the pipeline at least once: `npm start`
- Check that `/tmp/podcast-costs.jsonl` exists
- GitHub Actions logs to the runner's `/tmp` (not persistent across runs)

### Costs Higher Than Expected

Check:
1. **Script length:** Longer scripts = more TTS costs
2. **Token usage:** View actual counts in the console output
3. **Chunking:** Scripts >5000 bytes get chunked, but cost is the same per character

### Compare Estimated vs Actual

1. Run the pipeline and note the estimated costs
2. Wait 24 hours for API billing to update
3. Check actual costs in provider consoles
4. If significantly different, update rates in `src/costTracker.js`

## Future Enhancements

Potential additions:
- [ ] Fetch actual costs from Anthropic/GCP APIs
- [ ] Store cost logs in gh-pages for persistence
- [ ] Email/Slack alerts if costs exceed threshold
- [ ] Historical cost charts and visualizations
- [ ] Per-source cost attribution (which sources cost the most)
