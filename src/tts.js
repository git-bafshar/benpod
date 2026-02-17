/**
 * Text-to-Speech Converter
 *
 * Converts script text to MP3 audio with multiple voices using Google Cloud TTS
 */

const textToSpeech = require('@google-cloud/text-to-speech');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const { parseScript } = require('./synthesizer');

ffmpeg.setFfmpegPath(ffmpegPath);

// Voice configurations for each speaker
const VOICES = {
  alex: {
    languageCode: 'en-US',
    name: 'en-US-Journey-D',  // Male voice
  },
  jordan: {
    languageCode: 'en-US',
    name: 'en-US-Journey-F',  // Female voice
  }
};

/**
 * Generate audio for a single text segment
 */
async function generateSegmentAudio(client, text, voiceConfig, outputPath) {
  const request = {
    input: { text },
    voice: voiceConfig,
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 1.05,
      pitch: 0,
      effectsProfileId: ['large-home-entertainment-class-device']
    },
  };

  const [response] = await client.synthesizeSpeech(request);
  fs.writeFileSync(outputPath, response.audioContent, 'binary');
  return outputPath;
}

/**
 * Combine multiple audio files into one
 */
function combineAudioFiles(inputFiles, outputPath) {
  return new Promise((resolve, reject) => {
    // Create a concat file list for ffmpeg
    const listFile = path.join('/tmp', 'concat-list.txt');
    const listContent = inputFiles
      .map(file => `file '${file}'`)
      .join('\n');

    fs.writeFileSync(listFile, listContent);

    ffmpeg()
      .input(listFile)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(['-c', 'copy'])
      .output(outputPath)
      .on('end', () => {
        fs.unlinkSync(listFile);
        resolve(outputPath);
      })
      .on('error', (err) => {
        if (fs.existsSync(listFile)) {
          fs.unlinkSync(listFile);
        }
        reject(err);
      })
      .run();
  });
}

/**
 * Convert script to audio with multiple voices
 */
async function convertToAudio(script, outputPath) {
  console.log('Converting script to audio with multiple voices...');

  try {
    const client = new textToSpeech.TextToSpeechClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });

    // Parse script into segments
    const segments = parseScript(script);

    if (segments.length === 0) {
      console.log('  No speaker-tagged segments found, using single voice...');
      return await convertToAudioSingleVoice(script, outputPath);
    }

    console.log(`  Found ${segments.length} segments from ${new Set(segments.map(s => s.speaker)).size} speakers`);

    // Generate audio for each segment
    const tmpDir = '/tmp/audio-segments';
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const segmentFiles = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const voiceConfig = VOICES[segment.speaker] || VOICES.alex;
      const segmentPath = path.join(tmpDir, `segment-${i.toString().padStart(3, '0')}.mp3`);

      process.stdout.write(`  Generating segment ${i + 1}/${segments.length} (${segment.speaker})...\r`);

      await generateSegmentAudio(client, segment.text, voiceConfig, segmentPath);
      segmentFiles.push(segmentPath);
    }

    console.log(); // New line after progress

    // Combine all segments
    console.log('  Combining audio segments...');
    await combineAudioFiles(segmentFiles, outputPath);

    // Cleanup temporary files
    segmentFiles.forEach(file => {
      try {
        fs.unlinkSync(file);
      } catch (e) {}
    });

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

/**
 * Convert script to audio using single voice (fallback)
 */
async function convertToAudioSingleVoice(script, outputPath) {
  const client = new textToSpeech.TextToSpeechClient({
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
  });

  const request = {
    input: { text: script },
    voice: VOICES.alex,
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 1.05,
      pitch: 0,
      effectsProfileId: ['large-home-entertainment-class-device']
    },
  };

  const [response] = await client.synthesizeSpeech(request);
  fs.writeFileSync(outputPath, response.audioContent, 'binary');

  const sizeKB = (response.audioContent.length / 1024).toFixed(2);
  console.log(`  Audio saved to ${outputPath} (${sizeKB} KB)`);

  return outputPath;
}

module.exports = { convertToAudio };
