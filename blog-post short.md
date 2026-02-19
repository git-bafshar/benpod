# How I Built a Personal Databricks & AI Industry Podcast with Claude Code in One Afternoon

*Feel the Vibes*

---

## State of the World

I’m a solutions architect at Databricks. Every day I need to catch up on Databricks releases, blog posts from Databricks and other key AI industry players, AI industry media coverage, Hacker News, tweets about AI, and a growing list of other sources. That's a lot, and each morning I had to decide if I was actually going to spend 30-45 minutes just *finding* the news or cross my fingers that nothing significant happened and go on with my day.

I wanted a **personalized 8-12 minute podcast, automatically generated and delivered to my phone every morning.**

Since I’m pretty mediocre at coding but pretty good at asking for what I want, I went to Claude Code. Three hours later, it was live on Spotify.

<iframe data-testid="embed-iframe" style="border-radius:12px" src="https://open.spotify.com/embed/show/4p5vgnRnYD6koHrkZQqhJ0?utm_source=generator" width="100%" height="152" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>

---

## The Approach

**Traditional coding:** Plan → Write → Debug → Ship (eventually)

**Vibe coding:** Describe → Run → Fix → Ship (fast)

Claude Code reads errors, debugs issues, and fixes problems in real-time. Instead of writing code, you're having a conversation about what you want to build and validating the outputs.

---

## The Build: From Zero to Podcast

### Starting Point (10 Minutes)

I wrote a spec file laying out what I wanted:

- Scrape 13+ content sources  
- Send to Claude API for script generation  
- Convert to audio with Google TTS  
- Publish to GitHub Pages as RSS feed  
- Run daily via GitHub Actions

I took that spec, asked Claude Code to implement it, and focused on validating outputs.

![Pipeline Flow](docs/pipeline-flow.png)

Claude created the entire project structure (\~500 lines) in 10 minutes. I hadn't written a single line of code.

### The Error Gauntlet (90 Minutes)

Three hours of building surfaces a lot of failure. Here's every error we hit, consolidated into the themes that actually matter.

#### Theme 1: APIs Are Landmines Until You Read the Fine Print

Half the errors in this project came from assuming things about APIs that weren't true.

**Claude Pro ≠ API credits.** The very first run failed because a $20/month subscription doesn't include API access — that's a separate billing relationship requiring prepaid credits. **Twitter's "free" tier** doesn't let you read timelines. **OpenAI's blog** actively blocks scrapers with 403s. **Google TTS** has a hard 5,000 byte limit per request.

The pattern: every external service has constraints that aren't obvious until you hit them. The fix is always the same — read the billing docs before you start, and build graceful degradation so one broken source doesn't sink the pipeline.

#### Theme 2: The Web Is Actively Hostile to Scrapers

Generic CSS selectors like `article`, `.post`, and `h2` returned zero results on almost every site. Databricks uses `div[data-cy="CtaImageBlock"]`. Anthropic uses CSS module classes with generated hashes like `__KxYrHG__`. OpenAI just returns 403 outright.

Modern web apps are built for browsers, not for you. The lesson is to build redundancy so that when individual sources fail (and they will), the pipeline continues. Eleven working sources is good enough.

#### Theme 3: Metadata Bites You at the Finish Line

Three separate errors came from metadata problems that only surfaced during Spotify validation: missing cover art, a missing email address, and artwork hosted in the wrong GitHub branch. These were invisible problems until the very end.

The RSS spec is also a trap. Podcast RSS isn't just RSS 2.0 — it's RSS 2.0 plus iTunes extensions. Spotify and Apple Podcasts validate different things. You need `<itunes:email>` at the channel level *and* nested inside `<itunes:owner>` to satisfy both. The spec you read and the validator you face aren't always aligned.

#### Theme 4: Math and Encoding Assumptions Will Humiliate You

Two errors came from bad assumptions about how numbers work: episode duration showed 2 minutes instead of 8 because the formula didn't account for MP3 bitrate math (`fileSize × 8 ÷ 128,000`), and TTS failed because byte length ≠ character count when you're dealing with UTF-8.

These failures share a root cause: treating technical details as implementation trivia instead of actual constraints. Audio encoding has real math. Character encoding has real rules. When precision matters, don't guess.

#### Theme 5: State Doesn't Update Just Because Code Does

The subtlest error in the whole project: after adding email and artwork tags to the publisher code, the live RSS feed still had the old structure. The reason — the publisher only inserted new episodes into existing feeds, it never touched channel metadata — wasn't obvious until we inspected the live XML directly.

Code changes and state changes are different things. When your pipeline writes to a persistent artifact (a feed file, a database, a cache), updating the logic that writes it doesn't retroactively fix what's already there. Sometimes you have to delete and regenerate from scratch.

### Production (5 Minutes)

GitHub Actions workflow was already written. Added API keys as secrets. First automated episode generated the next morning at 5 AM.

**Total time: 3 hours.**

---

## The Spotify Twist (30 Minutes)

The podcast worked in Pocket Casts. But Spotify rejected it: "Missing cover art and email address."

We *had* those tags in the code, but the live feed didn't. Why? The publisher only *inserts new episodes* into existing feeds — it doesn't update channel metadata.

**The fix:**

1. Updated publisher to include `<itunes:email>` at channel level (Spotify requirement)  
2. Deleted old feed.xml from gh-pages  
3. Regenerated from scratch  
4. Copied artwork.jpg to gh-pages (it was only in main branch)

Spotify validated. Done.

---

## What Didn't Work

### ❌ ElevenLabs TTS

**Cost:** $2.70/episode vs Google's free tier ($0.00 within 1M chars/month). Not worth it.

### ❌ Using Claude Sonnet 4.5

The scripts were generic. Upgraded to 4.6 — night and day difference in editorial quality.

### ❌ Naive Duration Calculation

`fileSizeBytes / 16000` was wrong. Correct: `(fileSizeBytes * 8) / (128 * 1000)` for MP3 at 128 kbps.

### ❌ Generic CSS Selectors

Modern sites use CSS modules and data attributes. Always inspect live HTML, use stable selectors, build graceful fallbacks.

### ❌ Scraping OpenAI's Blog

Cloudflare blocks bots. Made it fail gracefully. Redundancy \> perfection.

### ❌ Sending Full Script to TTS

Hit 5,000 byte limit. Solution: sentence-based chunking with binary MP3 concatenation.

### ❌ RSS Feed Structure Updates

Updating code doesn't update existing feeds. Had to regenerate from scratch for Spotify.

### ❌ Artwork in Main Branch Only

GitHub Pages only serves gh-pages. Copied artwork there.

---

## The Vibe Coding Workflow

### 1\. Start with a Spec (But Don't Overthink It)

I wrote a 680-line spec. Claude turned it into code. The spec gave context; Claude did the work.

### 2\. Run Immediately

Don't wait for perfect code. Run it. Copy errors. Say "fix this." Repeat.

### 3\. Let Claude Debug Itself

When scrapers failed, I said "fix the databricks newsroom issue." Claude inspected pages, found selectors, rewrote code. Saved 30+ minutes of manual HTML inspection.

### 4\. Make Decisions, Don't Get Stuck

OpenAI 403? Made it fail gracefully. We have 12 other sources. Ship what works.

### 5\. Ship, Then Iterate

After everything worked end-to-end, I could have added deduplication, transcripts, week-in-review mode. I didn't. **I shipped.** Features can wait.

---

## What I Learned

### Claude Code is a 10x Multiplier

I wrote \~0 lines of code in 3 hours. I *described* what I wanted. The traditional "Think → Write → Debug → Ship" loop became "Think → Describe → Ship → Iterate."

### LLMs Excel at Synthesis

The Claude-generated scripts cluster news into themes, add opinionated commentary, and sound like a real person. I expected robotic output. Got editorial judgment.

### Chunking is Universal

TTS byte limits, LLM token limits, API rate limits — if you're building with APIs, you'll hit limits. Learn to chunk intelligently.

### GitHub Actions is Underrated

Free cron jobs, built-in secrets, no servers. Perfect for side projects.

---

## The Economics

**Development time:** 3 hours

**Operational costs:**

- Claude API (Sonnet 4.6): $0.05/day
- Google TTS (Journey-D): $0.00/day (\~9K chars/episode × 30 days = \~270K chars/month, well within 1M free WaveNet characters/month)
- Everything else: $0
- **Total: $0.05/day (\~$18/year)**

**Alternative costs:**

- Podcast hosting: $144/year  
- Manual news aggregation: $18,250/year (30 min/day at $100/hr)

**ROI:** Paid for itself in under a day.

---

## How to Build Your Own

1. **Write a simple spec** — describe sources, format, schedule  
2. **Pick your stack** — scraper \+ LLM \+ TTS \+ hosting \+ scheduler (\~$0.05/day)  
3. **Run locally first** — fix issues with "fix this"  
4. **Deploy to GitHub Actions** — add cron schedule, push  
5. **Subscribe** — add RSS feed to podcast app, enable auto-download

---

## Final Thoughts

Three years ago, building this would have taken 2-3 days of focused work. With Claude Code, it took **3 hours.**

This is vibe coding. You don't write code — you *describe what you want to exist*, and code emerges from that conversation.

The hard parts are still hard (architecture, product decisions, debugging). But the *mechanical* work — boilerplate, docs, API wiring — is now automated.

If you're working in a fast-moving technical field, **you should be building tools like this.** Not because it's impressive. Because it's *useful.*

The information you need is out there. The tools to aggregate, synthesize, and deliver it cost almost nothing. And LLMs can handle the editorial work that used to require humans.

So ask yourself: What would you build if coding wasn't the bottleneck?

For me, it was an 8-minute podcast that saves me 30 minutes every morning.

What's yours?

---

*Tyler lives in Austin, Texas, and divides his time between trail running, going to concerts, and doing things related to AI. You can reach him at [howdy@tyler.rodeo](mailto:howdy@tyler.rodeo).*
