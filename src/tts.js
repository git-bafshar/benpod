/**
 * Text-to-Speech Converter
 *
 * Converts script text to MP3 audio using Google Cloud TTS
 */

const textToSpeech = require('@google-cloud/text-to-speech');
const fs = require('fs');

/**
 * Convert script to audio using Google Cloud TTS
 */
async function convertToAudio(script, outputPath) {
  console.log('Converting script to audio with Google Cloud TTS...');

  try {
    const client = new textToSpeech.TextToSpeechClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });

    const request = {
      input: { text: script },
      voice: {
        languageCode: 'en-US',
        name: 'en-US-Journey-D',  // Best neural voice (male)
        // Alternative: 'en-US-Journey-F' for female
        // Alternative: 'en-US-Neural2-A' for standard quality
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 1.05,  // Slightly faster than default
        pitch: 0,
        effectsProfileId: ['large-home-entertainment-class-device']
      },
    };

    const [response] = await client.synthesizeSpeech(request);

    // Write audio to file
    fs.writeFileSync(outputPath, response.audioContent, 'binary');

    const sizeKB = (response.audioContent.length / 1024).toFixed(2);
    console.log(`  ✅ Audio saved to ${outputPath} (${sizeKB} KB)`);

    return outputPath;

  } catch (error) {
    console.error('Error converting to audio:', error.message);
    throw error;
  }
}

module.exports = { convertToAudio };
