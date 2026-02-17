/**
 * Weather Fetcher
 *
 * Fetches current weather and forecast for Austin, TX
 */

const axios = require('axios');

/**
 * Get weather for Austin, TX
 */
async function getAustinWeather() {
  console.log('Fetching Austin weather...');

  try {
    // Using wttr.in - free weather API, no key needed
    const response = await axios.get('https://wttr.in/Austin,TX?format=j1', {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    const data = response.data;
    const current = data.current_condition[0];
    const today = data.weather[0];

    const weather = {
      temperature: current.temp_F,
      feelsLike: current.FeelsLikeF,
      condition: current.weatherDesc[0].value,
      high: today.maxtempF,
      low: today.mintempF,
      humidity: current.humidity,
      chanceOfRain: today.hourly[4]?.chanceofrain || '0', // Midday rain chance
    };

    console.log(`  Current: ${weather.temperature}°F, ${weather.condition}`);
    console.log(`  High: ${weather.high}°F, Low: ${weather.low}°F`);

    return weather;

  } catch (error) {
    console.error('  ⚠️  Weather fetch failed:', error.message);

    // Return fallback data
    return {
      temperature: 'unknown',
      condition: 'unavailable',
      high: 'unknown',
      low: 'unknown',
      chanceOfRain: '0',
      error: true
    };
  }
}

/**
 * Format weather for natural speech
 */
function formatWeatherForSpeech(weather) {
  if (weather.error) {
    return "Weather data unavailable today";
  }

  let speech = `It's currently ${weather.temperature} degrees`;

  if (weather.condition.toLowerCase() !== 'unknown') {
    speech += ` and ${weather.condition.toLowerCase()}`;
  }

  speech += ` in Austin. Today's high will be ${weather.high} with a low of ${weather.low}`;

  const rainChance = parseInt(weather.chanceOfRain);
  if (rainChance > 30) {
    speech += `, and there's a ${rainChance} percent chance of rain`;
  }

  return speech;
}

module.exports = { getAustinWeather, formatWeatherForSpeech };
