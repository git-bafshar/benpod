/**
 * Text-to-Speech Converter
 *
 * Converts script text to MP3 audio using Google Cloud TTS
 * Handles long scripts by chunking (5000 byte limit per request)
 */

const textToSpeech = require('@google-cloud/text-to-speech');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Split script into chunks under the byte limit
 */
function chunkScript(script, maxBytes = 4500) {
  const sentences = script.match(/[^.!?]+[.!?]+/g) || [script];
  const chunks = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    const testChunk = currentChunk + sentence;

    if (Buffer.byteLength(testChunk, 'utf8') > maxBytes) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        // Single sentence too long - force split
        chunks.push(sentence.trim());
      }
    } else {
      currentChunk = testChunk;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Synthesize a single chunk
 */
async function synthesizeChunk(client, text, voiceConfig) {
  const [response] = await client.synthesizeSpeech({
    input: { text },
    voice: voiceConfig,
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 1.1,
      pitch: 0,
      effectsProfileId: ['large-home-entertainment-class-device']
    },
  });

  return response.audioContent;
}

/**
 * Combine multiple MP3 files using simple concatenation
 */
function combineMP3Files(files, outputPath) {
  // For MP3, we can use simple binary concatenation
  const combinedBuffer = Buffer.concat(
    files.map(file => fs.readFileSync(file))
  );
  fs.writeFileSync(outputPath, combinedBuffer);

  // Clean up temp files
  files.forEach(file => fs.unlinkSync(file));
}

/**
 * Convert script to audio using Google Cloud TTS
 */
async function convertToAudio(script, outputPath) {
  console.log('Converting script to audio with Google Cloud TTS...');

  try {
    const client = new textToSpeech.TextToSpeechClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });

    const voiceConfig = {
      languageCode: 'en-US',
      name: 'en-US-Journey-D',  // Best neural voice (male)
    };

    const scriptBytes = Buffer.byteLength(script, 'utf8');
    console.log(`  Script size: ${scriptBytes} bytes`);

    // If script is under 5000 bytes, use single request
    if (scriptBytes < 5000) {
      const audioContent = await synthesizeChunk(client, script, voiceConfig);
      fs.writeFileSync(outputPath, audioContent, 'binary');

      const sizeKB = (audioContent.length / 1024).toFixed(2);
      console.log(`  ✅ Audio saved to ${outputPath} (${sizeKB} KB)`);
      return outputPath;
    }

    // For longer scripts, split into chunks
    console.log(`  Script exceeds 5000 bytes, splitting into chunks...`);
    const chunks = chunkScript(script, 4500);
    console.log(`  Split into ${chunks.length} chunks`);

    const tmpDir = '/tmp/tts-chunks';
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const chunkFiles = [];

    for (let i = 0; i < chunks.length; i++) {
      process.stdout.write(`  Synthesizing chunk ${i + 1}/${chunks.length}...\r`);

      const audioContent = await synthesizeChunk(client, chunks[i], voiceConfig);
      const chunkPath = path.join(tmpDir, `chunk-${i.toString().padStart(3, '0')}.mp3`);
      fs.writeFileSync(chunkPath, audioContent, 'binary');
      chunkFiles.push(chunkPath);
    }

    console.log(); // New line after progress

    // Combine all chunks
    console.log(`  Combining ${chunkFiles.length} audio chunks...`);
    combineMP3Files(chunkFiles, outputPath);

    // Cleanup temp directory
    try {
      fs.rmdirSync(tmpDir);
    } catch (e) {}

    const sizeKB = (fs.statSync(outputPath).size / 1024).toFixed(2);
    console.log(`  ✅ Audio saved to ${outputPath} (${sizeKB} KB)`);

    return outputPath;

  } catch (error) {
    console.error('Error converting to audio:', error.message);
    throw error;
  }
}

module.exports = { convertToAudio };
