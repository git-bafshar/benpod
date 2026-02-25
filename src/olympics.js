/**
 * Olympics updates and event detection
 * Fetches medal counts and event highlights when Olympics are active
 */

/**
 * Check if Olympics are currently active based on date
 * @returns {Object} {active: boolean, type: 'summer'|'winter'|null, year: number|null}
 */
function areOlympicsActive() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed
  const currentDay = now.getDate();

  // Olympic date ranges (approximate, adjust as needed)
  const olympicDates = [
    // 2026 Winter Olympics - Milan-Cortina
    { year: 2026, type: 'winter', startMonth: 1, startDay: 6, endMonth: 1, endDay: 22 },

    // 2028 Summer Olympics - Los Angeles
    { year: 2028, type: 'summer', startMonth: 6, startDay: 21, endMonth: 7, endDay: 6 },

    // 2030 Winter Olympics - French Alps
    { year: 2030, type: 'winter', startMonth: 1, startDay: 10, endMonth: 1, endDay: 26 }
  ];

  for (const olympics of olympicDates) {
    if (currentYear !== olympics.year) continue;

    const startDate = new Date(olympics.year, olympics.startMonth, olympics.startDay);
    const endDate = new Date(olympics.year, olympics.endMonth, olympics.endDay);

    if (now >= startDate && now <= endDate) {
      return {
        active: true,
        type: olympics.type,
        year: olympics.year
      };
    }
  }

  return { active: false, type: null, year: null };
}

/**
 * Fetch Olympics updates when active
 * @returns {Promise<Object>} Olympics summary with medal counts and highlights
 */
async function fetchOlympicsUpdates() {
  const olympicsStatus = areOlympicsActive();

  if (!olympicsStatus.active) {
    return {
      summary: 'No Olympics currently active',
      active: false
    };
  }

  try {
    console.log(`📊 Fetching ${olympicsStatus.type} Olympics updates for ${olympicsStatus.year}...`);

    // For now, return a placeholder since Olympics aren't currently active
    // When active, this would call ESPN Olympics API or parse Olympics.com RSS
    const summary = `${olympicsStatus.year} ${olympicsStatus.type.charAt(0).toUpperCase() + olympicsStatus.type.slice(1)} Olympics: ` +
                    `Live coverage available. Check official sources for medal counts and event schedules.`;

    console.log(`✅ Olympics updates: ${summary}`);

    return {
      summary,
      active: true,
      type: olympicsStatus.type,
      year: olympicsStatus.year
    };

  } catch (error) {
    console.error('❌ Failed to fetch Olympics updates:', error.message);
    return {
      summary: 'Olympics updates unavailable (API error)',
      active: true,
      error: error.message
    };
  }
}

module.exports = {
  areOlympicsActive,
  fetchOlympicsUpdates
};
