/**
 * Script Synthesizer
 *
 * Uses Claude API to generate a spoken-word audio script with two hosts
 */

const Anthropic = require('@anthropic-ai/sdk');

/**
 * Synthesize audio script from content bundle with two-host format
 */
async function synthesizeScript(contentBundle) {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  });

  const now = new Date();
  const today = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const isFriday = now.getDay() === 5;

  const baseInstructions = `You are producing a daily audio briefing called "Your Data & AI Daily" with TWO HOSTS: Alex and Jordan.
Today is ${today}.

This is a PERSONAL BRIEFING for Tyler, a Databricks Field Engineer.

Below is the raw content gathered from Databricks release notes, the Databricks blog, and top AI news.
Write a concise, engaging, spoken-word script for a 3–5 minute audio segment in a TWO-HOST FORMAT.

BASE REQUIREMENTS:
- Use TWO HOSTS who take turns speaking
- Format each line as: "Alex: [their dialogue]" or "Jordan: [their dialogue]"
- Open with Alex welcoming TYLER directly (e.g., "Good morning Tyler" or "Welcome back Tyler")
- IMMEDIATELY after welcome, Jordan mentions Tyler's Austin weather forecast (provided in the content below)
- Address Tyler directly throughout when appropriate (not "listeners" or "everyone")
- Have natural back-and-forth: they can react to each other, ask questions, add commentary
- Write for the ear: short sentences, conversational language, natural reactions
- Approximate total word count: 500–800 words
- Tone: professional but conversational, like two smart colleagues briefing a friend`;

  const fridayInstructions = `
FRIDAY SPECIAL - WEEK IN REVIEW FORMAT:
- Open with "It's Friday Tyler, time for our week in review!"
- Alex summarizes the TOP 3 Databricks stories from the entire week
- Jordan highlights the TOP 3 AI industry moments from the week
- Identify any common themes or trends across the week
- Close with Jordan wishing Tyler a great weekend and mentioning something to watch next week
- Make it feel like a wrap-up, not just another daily brief`;

  const weekdayInstructions = `
DAILY FORMAT - TWO CLEAR SEGMENTS:

SEGMENT 1 - DATABRICKS UPDATES (Alex leads):
- Alex introduces: "Let's start with Databricks updates..."
- Cover ALL Databricks content: release notes, blog posts, announcements
- Jordan can react, ask questions, add commentary
- Alex wraps up this segment before transitioning

SEGMENT 2 - AI INDUSTRY NEWS (Jordan leads):
- Jordan transitions: "Now let's look at what's happening in the broader AI world..."
- Cover AI industry developments: research, products, trends
- Alex can react, ask questions, add commentary
- Jordan closes with a one-sentence teaser for tomorrow

IMPORTANT: Keep these segments clearly separated and well-labeled`;

  const prompt = `${baseInstructions}

${isFriday ? fridayInstructions : weekdayInstructions}

EXAMPLE FORMAT:
Alex: Good morning Tyler! Welcome to Your Data & AI Daily for Monday, February 17th. I'm Alex.
Jordan: And I'm Jordan. Before we dive in, here's your Austin weather: [insert weather here].
Alex: Perfect! Now Tyler, let's get into what's happening at Databricks...

RAW CONTENT:
${JSON.stringify(contentBundle, null, 2)}

Return ONLY the script with speaker labels (Alex: and Jordan:), nothing else.`;

  console.log(`Synthesizing two-host script with Claude ${isFriday ? '(FRIDAY EDITION)' : ''}...`);

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }],
    });

    const script = message.content[0].text;
    const wordCount = script.split(/\s+/).length;
    const lineCount = script.split('\n').filter(l => l.trim()).length;

    console.log(`  Generated script: ${wordCount} words, ${lineCount} lines`);
    return script;

  } catch (error) {
    console.error('Error synthesizing script:', error.message);
    throw error;
  }
}

/**
 * Parse script into segments by speaker
 */
function parseScript(script) {
  const lines = script.split('\n').filter(line => line.trim());
  const segments = [];

  for (const line of lines) {
    const match = line.match(/^(Alex|Jordan):\s*(.+)$/i);
    if (match) {
      const [, speaker, text] = match;
      segments.push({
        speaker: speaker.toLowerCase(),
        text: text.trim()
      });
    }
  }

  return segments;
}

module.exports = { synthesizeScript, parseScript };
