/**
 * Cost Tracker
 *
 * Tracks and reports costs for all APIs used in the podcast pipeline
 */

const fs = require('fs');
const path = require('path');

// Cost rates (as of Feb 2026)
const RATES = {
  // Anthropic Claude API (Sonnet 4.6)
  claude: {
    input: 3.00 / 1_000_000,   // $3 per million input tokens
    output: 15.00 / 1_000_000, // $15 per million output tokens
  },

  // Google Gemini API
  gemini: {
    pro: {
      input: 1.25 / 1_000_000,   // $1.25 per million input tokens
      output: 3.75 / 1_000_000,  // $3.75 per million output tokens
    },
    flash: {
      input: 0.10 / 1_000_000,   // $0.10 per million input tokens
      output: 0.40 / 1_000_000,  // $0.40 per million output tokens
    },
    flash2: {
      input: 0.10 / 1_000_000,   // $0.10 per million input tokens (Gemini 2.0 Flash)
      output: 0.40 / 1_000_000,  // $0.40 per million output tokens
    },
    flash25: {
      input: 0.10 / 1_000_000,   // $0.10 per million input tokens (Gemini 2.5 Flash)
      output: 0.40 / 1_000_000,  // $0.40 per million output tokens
    }
  },

  // Google Cloud TTS
  tts: {
    standard: 4.00 / 1_000_000,  // $4 per million characters
    wavenet: 16.00 / 1_000_000,  // $16 per million characters (Journey voices)
  },

  // Twitter/X API (pay-per-use model, 2026)
  twitter: {
    perCall: 0.00015,      // $0.00015 per API call (15 credits)
    listCall: 0.0015,      // $0.0015 per list function call (150 credits)
    // Legacy flat-rate tiers (still available)
    basic: 200.00,         // $200/month
    pro: 5000.00,          // $5,000/month
  },

  // GitHub (free)
  github: {
    actions: 0,
    pages: 0,
  },
};

class CostTracker {
  constructor() {
    this.costs = {
      claude: 0,
      gemini: 0,
      tts: 0,
      twitter: 0,
      total: 0,
    };
    this.usage = {
      claudeInputTokens: 0,
      claudeOutputTokens: 0,
      geminiProInputTokens: 0,
      geminiProOutputTokens: 0,
      geminiFlashInputTokens: 0,
      geminiFlashOutputTokens: 0,
      gemini2FlashInputTokens: 0,
      gemini2FlashOutputTokens: 0,
      gemini25FlashInputTokens: 0,
      gemini25FlashOutputTokens: 0,
      ttsCharacters: 0,
      twitterCalls: 0,
    };
  }

  /**
   * Track Claude API usage
   */
  trackClaude(inputTokens, outputTokens) {
    this.usage.claudeInputTokens += inputTokens;
    this.usage.claudeOutputTokens += outputTokens;

    const inputCost = inputTokens * RATES.claude.input;
    const outputCost = outputTokens * RATES.claude.output;
    const totalCost = inputCost + outputCost;

    this.costs.claude += totalCost;
    this.costs.total += totalCost;

    return {
      inputTokens,
      outputTokens,
      inputCost,
      outputCost,
      totalCost,
    };
  }

  /**
   * Track Gemini API usage
   */
  trackGemini(usage) {
    let proInput = 0, proOutput = 0, flashInput = 0, flashOutput = 0, flash2Input = 0, flash2Output = 0, flash25Input = 0, flash25Output = 0;

    if (usage.geminiPro) {
      proInput = usage.geminiPro.promptTokens || 0;
      proOutput = usage.geminiPro.candidatesTokens || 0;
      this.usage.geminiProInputTokens += proInput;
      this.usage.geminiProOutputTokens += proOutput;
    }

    if (usage.geminiFlash) {
      flashInput = usage.geminiFlash.promptTokens || 0;
      flashOutput = usage.geminiFlash.candidatesTokens || 0;
      this.usage.geminiFlashInputTokens += flashInput;
      this.usage.geminiFlashOutputTokens += flashOutput;
    }

    if (usage.gemini2Flash) {
      flash2Input = usage.gemini2Flash.promptTokens || 0;
      flash2Output = usage.gemini2Flash.candidatesTokens || 0;
      this.usage.gemini2FlashInputTokens += flash2Input;
      this.usage.gemini2FlashOutputTokens += flash2Output;
    }

    if (usage.gemini25Flash) {
      flash25Input = usage.gemini25Flash.promptTokens || 0;
      flash25Output = usage.gemini25Flash.candidatesTokens || 0;
      this.usage.gemini25FlashInputTokens += flash25Input;
      this.usage.gemini25FlashOutputTokens += flash25Output;
    }

    const proCost = (proInput * RATES.gemini.pro.input) + (proOutput * RATES.gemini.pro.output);
    const flashCost = (flashInput * RATES.gemini.flash.input) + (flashOutput * RATES.gemini.flash.output);
    const flash2Cost = (flash2Input * RATES.gemini.flash2.input) + (flash2Output * RATES.gemini.flash2.output);
    const flash25Cost = (flash25Input * RATES.gemini.flash25.input) + (flash25Output * RATES.gemini.flash25.output);
    const totalCost = proCost + flashCost + flash2Cost + flash25Cost;

    this.costs.gemini += totalCost;
    this.costs.total += totalCost;

    return {
      proInput,
      proOutput,
      flashInput,
      flashOutput,
      flash2Input,
      flash2Output,
      flash25Input,
      flash25Output,
      proCost,
      flashCost,
      flash2Cost,
      flash25Cost,
      totalCost,
    };
  }

  /**
   * Track Google TTS usage
   */
  trackTTS(characters, voiceType = 'wavenet') {
    this.usage.ttsCharacters += characters;

    const cost = characters * RATES.tts[voiceType];
    this.costs.tts += cost;
    this.costs.total += cost;

    return {
      characters,
      voiceType,
      cost,
    };
  }

  /**
   * Track Twitter/X API usage (pay-per-use model)
   */
  trackTwitter(calls) {
    this.usage.twitterCalls += calls;

    // Calculate pay-per-use costs (standard API calls)
    const cost = calls * RATES.twitter.perCall;
    this.costs.twitter += cost;
    this.costs.total += cost;

    return {
      calls,
      costPerCall: RATES.twitter.perCall,
      totalCost: cost,
    };
  }

  /**
   * Get cost summary
   */
  getSummary() {
    return {
      costs: this.costs,
      usage: this.usage,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Log costs to file
   */
  logToFile(logFile = '/tmp/podcast-costs.jsonl') {
    const summary = this.getSummary();
    const logLine = JSON.stringify(summary) + '\n';

    try {
      fs.appendFileSync(logFile, logLine);
      console.log(`  💰 Cost logged to ${logFile}`);
    } catch (err) {
      console.error(`  Error logging costs: ${err.message}`);
    }
  }

  /**
   * Print cost summary to console
   */
  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('💰 COST SUMMARY');
    console.log('='.repeat(60));
    
    if (this.usage.claudeInputTokens > 0) {
      console.log(`  Claude API:`);
      console.log(`    - Input tokens: ${this.usage.claudeInputTokens.toLocaleString()}`);
      console.log(`    - Output tokens: ${this.usage.claudeOutputTokens.toLocaleString()}`);
      console.log(`    - Cost: $${this.costs.claude.toFixed(4)}`);
      console.log();
    }

    if (this.costs.gemini > 0) {
      console.log(`  Gemini API:`);
      if (this.usage.geminiProInputTokens > 0) {
        console.log(`    - Pro Input tokens: ${this.usage.geminiProInputTokens.toLocaleString()}`);
        console.log(`    - Pro Output tokens: ${this.usage.geminiProOutputTokens.toLocaleString()}`);
      }
      if (this.usage.geminiFlashInputTokens > 0) {
        console.log(`    - Flash 1.5 Input tokens: ${this.usage.geminiFlashInputTokens.toLocaleString()}`);
        console.log(`    - Flash 1.5 Output tokens: ${this.usage.geminiFlashOutputTokens.toLocaleString()}`);
      }
      if (this.usage.gemini2FlashInputTokens > 0) {
        console.log(`    - Flash 2.0 Input tokens: ${this.usage.gemini2FlashInputTokens.toLocaleString()}`);
        console.log(`    - Flash 2.0 Output tokens: ${this.usage.gemini2FlashOutputTokens.toLocaleString()}`);
      }
      if (this.usage.gemini25FlashInputTokens > 0) {
        console.log(`    - Flash 2.5 Input tokens: ${this.usage.gemini25FlashInputTokens.toLocaleString()}`);
        console.log(`    - Flash 2.5 Output tokens: ${this.usage.gemini25FlashOutputTokens.toLocaleString()}`);
      }
      console.log(`    - Cost: $${this.costs.gemini.toFixed(4)}`);
      console.log();
    }
    console.log(`  Google TTS:`);
    console.log(`    - Characters: ${this.usage.ttsCharacters.toLocaleString()}`);
    console.log(`    - Cost: $${this.costs.tts.toFixed(4)}`);
    console.log();

    if (this.usage.twitterCalls > 0) {
      console.log(`  Twitter/X API:`);
      console.log(`    - API calls: ${this.usage.twitterCalls}`);
      console.log(`    - Cost: $${this.costs.twitter.toFixed(4)} (pay-per-use)`);
      console.log();
    }

    console.log(`  Total Variable Costs: $${this.costs.total.toFixed(4)}`);
    console.log('='.repeat(60));
    console.log();
  }
}

/**
 * Read cost logs and generate report
 */
function generateReport(logFile = '/tmp/podcast-costs.jsonl', days = 30) {
  if (!fs.existsSync(logFile)) {
    console.log(`No cost log found at ${logFile}`);
    return;
  }

  const logs = fs.readFileSync(logFile, 'utf8')
    .trim()
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const recentLogs = logs.filter(log => {
    const logDate = new Date(log.timestamp);
    return logDate >= cutoffDate;
  });

  if (recentLogs.length === 0) {
    console.log(`No logs found in the last ${days} days`);
    return;
  }

  const totals = recentLogs.reduce((acc, log) => {
    acc.claude += log.costs.claude || 0;
    acc.gemini += log.costs.gemini || 0;
    acc.tts += log.costs.tts || 0;
    acc.twitter += log.costs.twitter || 0;
    acc.total += log.costs.total || 0;
    acc.runs += 1;
    return acc;
  }, { claude: 0, gemini: 0, tts: 0, twitter: 0, total: 0, runs: 0 });

  const avgPerRun = totals.total / totals.runs;
  const projectedMonthly = avgPerRun * 22; // ~22 workdays/month

  console.log('\n' + '='.repeat(60));
  console.log(`📊 COST REPORT (Last ${days} days)`);
  console.log('='.repeat(60));
  console.log(`  Total runs: ${totals.runs}`);
  console.log();
  if (totals.claude > 0) {
    console.log(`  Claude API: $${totals.claude.toFixed(4)}`);
  }
  if (totals.gemini > 0) {
    console.log(`  Gemini API: $${totals.gemini.toFixed(4)}`);
  }
  console.log(`  Google TTS: $${totals.tts.toFixed(4)}`);
  if (totals.twitter > 0) {
    console.log(`  Twitter API: $${totals.twitter.toFixed(4)} (pay-per-use)`);
  }
  console.log();
  console.log(`  Total: $${totals.total.toFixed(4)}`);
  console.log(`  Average per run: $${avgPerRun.toFixed(4)}`);
  console.log(`  Projected monthly (22 workdays): $${projectedMonthly.toFixed(2)}`);
  console.log('='.repeat(60));
  console.log();
}

module.exports = { CostTracker, generateReport, RATES };
