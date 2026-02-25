/**
 * Fetch surf conditions from Surfline API
 * Returns wave height, period, swell direction, wind quality for Santa Barbara County
 */

const https = require('https');

/**
 * Fetch surf forecast from Surfline API
 * @param {Array<string>} spotIds - Array of Surfline spot IDs
 * @param {string} location - Location name for error messages
 * @returns {Promise<Object>} Surf conditions summary
 */
async function fetchSurflineConditions(spotIds, location) {
  if (!spotIds || spotIds.length === 0) {
    console.log('⚠️  No Surfline spot IDs configured, skipping surf conditions');
    return { summary: 'Surf conditions unavailable (no spots configured)' };
  }

  try {
    const spotId = spotIds[0]; // Use first spot ID for now

    // Surfline API endpoints (public)
    const waveUrl = `https://services.surfline.com/kbyg/spots/forecasts/wave?spotId=${spotId}&days=1`;
    const windUrl = `https://services.surfline.com/kbyg/spots/forecasts/wind?spotId=${spotId}&days=1`;
    const tideUrl = `https://services.surfline.com/kbyg/spots/forecasts/tides?spotId=${spotId}&days=1`;

    console.log(`📊 Fetching surf conditions for ${location}...`);

    // Fetch all forecasts in parallel
    const [waveData, windData, tideData] = await Promise.all([
      fetchJson(waveUrl),
      fetchJson(windUrl),
      fetchJson(tideUrl)
    ]);

    // Parse current/next forecast
    const surfSummary = parseSurfForecast(waveData, windData, tideData, location);

    console.log(`✅ Surf conditions fetched: ${surfSummary.summary}`);
    return surfSummary;

  } catch (error) {
    console.error(`❌ Failed to fetch surf conditions for ${location}:`, error.message);
    return {
      summary: `Surf conditions unavailable for ${location} (API error)`,
      error: error.message
    };
  }
}

/**
 * Parse Surfline API response into readable summary
 */
function parseSurfForecast(waveData, windData, tideData, location) {
  try {
    // Get current wave forecast
    const wave = waveData?.data?.wave?.[0];
    if (!wave) {
      return { summary: `No wave data available for ${location}` };
    }

    const waveHeight = wave.surf?.max
      ? `${Math.round(wave.surf.min)}-${Math.round(wave.surf.max)} ft`
      : 'unknown';

    const swellHeight = wave.swells?.[0]?.height
      ? `${wave.swells[0].height.toFixed(1)} ft`
      : 'unknown';

    const swellPeriod = wave.swells?.[0]?.period
      ? `${Math.round(wave.swells[0].period)}s`
      : 'unknown';

    const swellDirection = wave.swells?.[0]?.direction
      ? degreesToDirection(wave.swells[0].direction)
      : 'unknown';

    // Get wind conditions
    const wind = windData?.data?.wind?.[0];
    const windSpeed = wind?.speed
      ? `${Math.round(wind.speed)} mph`
      : 'unknown';

    const windDirection = wind?.direction
      ? degreesToDirection(wind.direction)
      : 'unknown';

    // Get tide info
    const tide = tideData?.data?.tides?.[0];
    const tideType = tide?.type || 'unknown';
    const tideHeight = tide?.height
      ? `${tide.height.toFixed(1)} ft`
      : 'unknown';

    // Build summary
    const summary = `${location}: ${waveHeight} waves, ${swellHeight} @ ${swellPeriod} from ${swellDirection}. ` +
                    `Wind: ${windSpeed} ${windDirection}. Tide: ${tideType} at ${tideHeight}.`;

    return {
      summary,
      details: {
        waveHeight,
        swellHeight,
        swellPeriod,
        swellDirection,
        windSpeed,
        windDirection,
        tideType,
        tideHeight
      }
    };

  } catch (error) {
    console.error('Error parsing surf forecast:', error.message);
    return { summary: `Error parsing surf data for ${location}` };
  }
}

/**
 * Convert degrees to cardinal direction
 */
function degreesToDirection(degrees) {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                     'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

/**
 * Fetch JSON from URL using https module
 */
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(new Error(`Failed to parse JSON: ${error.message}`));
        }
      });

    }).on('error', (error) => {
      reject(error);
    });
  });
}

module.exports = {
  fetchSurflineConditions
};
