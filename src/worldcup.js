/**
 * FIFA World Cup updates and event detection
 * Fetches standings and match results when World Cup is active
 */

/**
 * Check if World Cup is currently active
 * @returns {Object} {active: boolean, year: number|null}
 */
function isWorldCupActive() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  // World Cup date ranges (approximate, adjust as needed)
  const worldCupDates = [
    // 2026 FIFA World Cup - USA/Canada/Mexico
    { year: 2026, startMonth: 5, endMonth: 6 }, // June-July 2026

    // 2030 FIFA World Cup - Spain/Portugal/Morocco
    { year: 2030, startMonth: 5, endMonth: 6 }
  ];

  for (const worldCup of worldCupDates) {
    if (currentYear !== worldCup.year) continue;

    if (currentMonth >= worldCup.startMonth && currentMonth <= worldCup.endMonth) {
      return {
        active: true,
        year: worldCup.year
      };
    }
  }

  return { active: false, year: null };
}

/**
 * Fetch World Cup standings and matches
 * @returns {Promise<Object>} World Cup summary with standings and recent results
 */
async function fetchWorldCupUpdates() {
  const worldCupStatus = isWorldCupActive();

  if (!worldCupStatus.active) {
    return {
      summary: 'No World Cup currently active',
      active: false
    };
  }

  try {
    console.log(`📊 Fetching World Cup updates for ${worldCupStatus.year}...`);

    // For now, return a placeholder since World Cup isn't currently active
    // When active, this would call ESPN World Cup API or parse FIFA RSS
    const summary = `${worldCupStatus.year} FIFA World Cup: ` +
                    `Live coverage available. Check official sources for group standings and match schedules.`;

    console.log(`✅ World Cup updates: ${summary}`);

    return {
      summary,
      active: true,
      year: worldCupStatus.year
    };

  } catch (error) {
    console.error('❌ Failed to fetch World Cup updates:', error.message);
    return {
      summary: 'World Cup updates unavailable (API error)',
      active: true,
      error: error.message
    };
  }
}

module.exports = {
  isWorldCupActive,
  fetchWorldCupUpdates
};
