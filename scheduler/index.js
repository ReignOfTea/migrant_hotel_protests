import 'dotenv/config';
import { EventScheduler } from './utils/scheduler.js';
import { TelegramLogger } from './utils/logger.js';

// Initialize logger
const logger = new TelegramLogger();

// Initialize scheduler
const scheduler = new EventScheduler(logger);

// Check for command-line arguments
const command = process.argv[2];

if (command === 'cleanup') {
    // Run cleanup and exit
    console.log('Running manual cleanup...');
    scheduler.triggerCleanup()
        .then(() => {
            console.log('Cleanup completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Cleanup failed:', error);
            process.exit(1);
        });
} else if (command === 'schedule' || command === 'repeating') {
    // Run repeating events processing and exit
    console.log('Running manual repeating events processing...');
    scheduler.triggerRepeatingEvents()
        .then(() => {
            console.log('Repeating events processing completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Repeating events processing failed:', error);
            process.exit(1);
        });
} else if (command) {
    // Unknown command
    console.log('Usage: node index.js [cleanup|schedule]');
    console.log('  cleanup  - Run cleanup (remove old events and excluded dates)');
    console.log('  schedule - Run repeating events processing');
    console.log('  (no args) - Start the scheduler daemon');
    process.exit(1);
} else {
    // No command - start the scheduler daemon
    scheduler.start();
    console.log('Event scheduler started successfully');
    console.log('Use "node index.js cleanup" to run cleanup manually');
    console.log('Use "node index.js schedule" to process repeating events manually');
}
