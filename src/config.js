/**
 * Configuration loader for multi-podcast support
 * Loads and validates podcast-specific configuration from JSON files
 */

const fs = require('fs');
const path = require('path');

/**
 * Load configuration for a specific podcast
 * @param {string} podcastId - The podcast identifier (e.g., 'benpod', 'matchmass')
 * @returns {Object} Validated configuration object
 * @throws {Error} If config file doesn't exist or is invalid
 */
function loadConfig(podcastId = 'benpod') {
  const configPath = path.join(__dirname, '..', 'configs', `${podcastId}.json`);

  if (!fs.existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  let config;
  try {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    config = JSON.parse(configContent);
  } catch (error) {
    throw new Error(`Failed to parse configuration file ${configPath}: ${error.message}`);
  }

  // Validate required fields
  validateConfig(config, podcastId);

  return config;
}

/**
 * Validate configuration structure
 * @param {Object} config - Configuration object to validate
 * @param {string} podcastId - Podcast identifier for error messages
 * @throws {Error} If required fields are missing or invalid
 */
function validateConfig(config, podcastId) {
  const requiredFields = [
    'id',
    'metadata.title',
    'metadata.author',
    'metadata.description',
    'metadata.email',
    'location.city',
    'location.state',
    'location.latitude',
    'location.longitude',
    'location.timezone',
    'paths.feedFile',
    'paths.episodesDir',
    'paths.episodeMemoryFile',
    'paths.artworkFile',
    'content',
    'voices.host',
    'voices.cohost'
  ];

  for (const field of requiredFields) {
    const keys = field.split('.');
    let value = config;

    for (const key of keys) {
      if (value === undefined || value === null) {
        throw new Error(`Missing required configuration field: ${field} in ${podcastId}.json`);
      }
      value = value[key];
    }

    if (value === undefined || value === null) {
      throw new Error(`Missing required configuration field: ${field} in ${podcastId}.json`);
    }
  }

  // Validate latitude/longitude ranges
  if (config.location.latitude < -90 || config.location.latitude > 90) {
    throw new Error(`Invalid latitude in ${podcastId}.json: ${config.location.latitude}`);
  }
  if (config.location.longitude < -180 || config.location.longitude > 180) {
    throw new Error(`Invalid longitude in ${podcastId}.json: ${config.location.longitude}`);
  }

  // Validate voices have required fields
  if (!config.voices.host.languageCode || !config.voices.host.name) {
    throw new Error(`Invalid host voice configuration in ${podcastId}.json`);
  }
  if (!config.voices.cohost.languageCode || !config.voices.cohost.name) {
    throw new Error(`Invalid cohost voice configuration in ${podcastId}.json`);
  }
}

module.exports = {
  loadConfig
};
