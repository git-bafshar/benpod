/**
 * Script Synthesizer
 *
 * Uses Claude API to generate a spoken-word audio script
 */

const Anthropic = require('@anthropic-ai/sdk');

/**
 * Synthesize audio script from content bundle
 */
async function synthesizeScript(contentBundle) {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  });

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const prompt = `You are producing a daily audio briefing called "The Data & AI Daily."
Today is ${today}.

Below is the raw content gathered from Databricks release notes, the Databricks blog, and top AI news.
Write a concise, engaging, spoken-word script for a 3–5 minute audio segment.

REQUIREMENTS:
- Open with a brief welcome and today's date.
- Cover the 2–3 most important Databricks releases or announcements first.
- Then cover the top 2–3 AI industry developments.
- Close with a one-sentence teaser for what to watch tomorrow if there's a logical thread.
- Write for the ear, not the eye: short sentences, no bullet points, no URLs, no markdown.
- Approximate word count: 500–800 words.
- Tone: professional but conversational, like a smart podcast host.

RAW CONTENT:
${JSON.stringify(contentBundle, null, 2)}

Return ONLY the script text, nothing else.`;

  console.log('Synthesizing script with Claude...');

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const script = message.content[0].text;
    const wordCount = script.split(/\s+/).length;

    console.log(`  Generated script: ${wordCount} words`);
    return script;

  } catch (error) {
    console.error('Error synthesizing script:', error.message);
    throw error;
  }
}

module.exports = { synthesizeScript };
