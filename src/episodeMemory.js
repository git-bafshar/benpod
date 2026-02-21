/**
 * Episode Memory
 *
 * Persists a rolling 14-episode history to gh-pages so Claude can reference
 * prior coverage when generating new episodes.
 */

const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');

const GH_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY;
const BRANCH = 'gh-pages';
const MEMORY_FILE = 'episode-memory.json';
const API_BASE = `https://api.github.com/repos/${REPO}`;
const MAX_EPISODES = 14;

const TOPIC_EXTRACTION_PROMPT = `You are extracting the key topics, entities, and storylines from a podcast episode script.

Return ONLY a JSON array of 5 to 8 short strings. Each string should be a concise label for one distinct topic, product announcement, company name, technology concept, or ongoing storyline covered in today's episode. These labels will be used to identify continuity across future episodes.

Rules:
- Each label must be 3 to 10 words maximum.
- Prefer specific and concrete over vague (e.g. "Databricks Unity Catalog GA" not "Databricks news").
- Include company names, product names, and people's names when they are the subject.
- Do not include filler topics like "Austin weather" or "podcast intro".
- Return valid JSON only — no explanation, no markdown, no code fences.

Example output:
["Databricks Unity Catalog general availability", "Meta Llama 4 multimodal release", "OpenAI o3 reasoning benchmark", "EU AI Act enforcement timeline", "Andreessen Horowitz AI infrastructure fund"]`;

/**
 * Fetch existing episode memory from gh-pages.
 * Returns { data: { episodes: [] }, sha: null } on first run (404).
 */
async function getEpisodeMemory() {
  try {
    const response = await axios.get(
      `${API_BASE}/contents/${MEMORY_FILE}?ref=${BRANCH}`,
      {
        headers: {
          Authorization: `Bearer ${GH_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );
    const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
    return { data: JSON.parse(content), sha: response.data.sha };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return { data: { episodes: [] }, sha: null };
    }
    throw error;
  }
}

/**
 * Commit updated episode memory to gh-pages.
 */
async function commitEpisodeMemory(memoryData, sha) {
  const contentBase64 = Buffer.from(
    JSON.stringify(memoryData, null, 2),
    'utf-8'
  ).toString('base64');

  const body = {
    message: 'Update episode memory',
    content: contentBase64,
    branch: BRANCH,
    ...(sha ? { sha } : {}),
  };

  await axios.put(`${API_BASE}/contents/${MEMORY_FILE}`, body, {
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Extract 5–8 key topic labels from a script using Claude Haiku.
 * Returns { topics: string[], usage: { inputTokens, outputTokens }|null }.
 * On failure, returns { topics: [], usage: null } — non-fatal.
 */
async function extractKeyTopics(script) {
  try {
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: 30 * 1000,
    });

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `${TOPIC_EXTRACTION_PROMPT}\n\nScript:\n${script}`,
      }],
    });

    const text = message.content[0].text.trim();
    const parsed = JSON.parse(text);
    const topics = Array.isArray(parsed) ? parsed.slice(0, 8) : [];

    return {
      topics,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      },
    };
  } catch (err) {
    console.error(`  Warning: topic extraction failed, skipping: ${err.message}`);
    return { topics: [], usage: null };
  }
}

/**
 * Prepend a new episode record and trim to MAX_EPISODES.
 * Idempotent: replaces any existing record for the same date.
 * Pure function — no I/O.
 */
function addEpisodeToMemory(memoryData, newRecord) {
  const filtered = (memoryData.episodes || []).filter(ep => ep.date !== newRecord.date);
  const updated = [newRecord, ...filtered].slice(0, MAX_EPISODES);
  return { episodes: updated };
}

/**
 * Format the last `days` days of memory for inclusion in the synthesizer prompt.
 * Returns '' when there is no history (first-run safe).
 */
function formatMemoryForPrompt(memoryData, days = 7) {
  if (!memoryData.episodes || memoryData.episodes.length === 0) return '';

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);

  const relevant = memoryData.episodes.filter(ep => new Date(ep.date) >= cutoff);
  if (relevant.length === 0) return '';

  return relevant.map(ep => {
    const topics = ep.keyTopics && ep.keyTopics.length > 0
      ? ` [Topics: ${ep.keyTopics.join(', ')}]`
      : '';
    return `- ${ep.date}: ${ep.summary}${topics}`;
  }).join('\n');
}

module.exports = {
  getEpisodeMemory,
  commitEpisodeMemory,
  extractKeyTopics,
  addEpisodeToMemory,
  formatMemoryForPrompt,
};
