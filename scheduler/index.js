import 'dotenv/config';
import { EventScheduler } from './utils/scheduler.js';
import { TelegramLogger } from './utils/logger.js';
import { createWebhookServer, startRepeatingEventsPolling } from './utils/webhook.js';
import { config } from './config/config.js';

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
    console.log('Usage: node index.js [cleanup|schedule|repeating]');
    console.log('  cleanup   - Run cleanup (remove old events and excluded dates)');
    console.log('  schedule  - Run repeating events processing');
    console.log('  repeating - Same as schedule');
    console.log('  (no args) - Start the scheduler daemon');
    process.exit(1);
} else {
    // No command - start the scheduler daemon
    scheduler.start();
    console.log('Event scheduler started successfully');

    const triggerRepeating = () => scheduler.triggerRepeatingEvents();
    const infraLog = { log: (msg) => console.log(msg) };

    if (config.GITHUB_WEBHOOK_SECRET) {
        const webhook = createWebhookServer(triggerRepeating, infraLog);
        webhook.listen(config.WEBHOOK_PORT, '0.0.0.0', () => {
            console.log(`Webhook listening on 0.0.0.0:${config.WEBHOOK_PORT} at ${config.WEBHOOK_PATH || '/webhook/github'}`);
        });
    } else {
        console.log('GITHUB_WEBHOOK_SECRET not set; webhook disabled.');
    }

    if (config.REPEATING_EVENTS_POLL_SECONDS > 0) {
        startRepeatingEventsPolling(triggerRepeating, config.REPEATING_EVENTS_POLL_SECONDS, infraLog);
    }

    console.log('Use "node index.js cleanup" to run cleanup manually');
    console.log('Use "node index.js schedule" or "node index.js repeating" to process repeating events manually');
}
