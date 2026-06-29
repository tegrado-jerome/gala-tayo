const { searchAskAiMaps } = require('../dist/src/services/askAiMapsService.js');

async function run() {
  const query = process.argv[2];

  if (!query) {
    console.error('Usage: node scripts/debugAskAiMaps.cjs "<query>"');
    process.exit(1);
    return;
  }

  const logger = {
    log(message) {
      console.log(message);
    },
  };

  try {
    const result = await searchAskAiMaps({ query }, logger);
    console.log('=== RESULT JSON START ===');
    console.log(JSON.stringify(result, null, 2));
    console.log('=== RESULT JSON END ===');
  } catch (error) {
    console.error('=== ERROR START ===');
    console.error(error && error.stack ? error.stack : error);
    console.error('=== ERROR END ===');
    process.exit(1);
  }
}

run();
