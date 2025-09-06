import cron from 'node-cron';
import { getFileContent, updateFileContent } from './github.js';
import { config } from '../config/config.js';

const EVENTS_FILE_PATH = 'data/times.json';
const REPEATING_EVENTS_FILE_PATH = 'data/repeating-events.json';

export class EventScheduler {
    constructor(auditLogger = null) {
        this.auditLogger = auditLogger;
        this.jobs = new Map();
        this.isRunning = false;
    }

    start() {
        if (this.isRunning) {
            console.log('Event scheduler is already running');
            return;
        }

        console.log('Starting event scheduler...');

        // Schedule cleanup job to run daily at midnight
        const cleanupJob = cron.schedule('0 0 * * *', async () => {
            console.log('Running daily event cleanup...');
            await this.cleanupOldEvents();
        }, {
            scheduled: false,
            timezone: 'Europe/London'
        });

        // Schedule repeating events job to run daily at 00:05
        const repeatingJob = cron.schedule('5 0 * * *', async () => {
            console.log('Running daily repeating events check...');
            await this.processRepeatingEvents();
        }, {
            scheduled: false,
            timezone: 'Europe/London'
        });

        this.jobs.set('cleanup', cleanupJob);
        this.jobs.set('repeating', repeatingJob);

        // Start all jobs
        cleanupJob.start();
        repeatingJob.start();

        this.isRunning = true;
        console.log('Event scheduler started successfully');
    }

    stop() {
        if (!this.isRunning) {
            console.log('Event scheduler is not running');
            return;
        }

        console.log('Stopping event scheduler...');

        for (const [name, job] of this.jobs) {
            job.destroy();
            console.log(`Stopped ${name} job`);
        }

        this.jobs.clear();
        this.isRunning = false;
        console.log('Event scheduler stopped');
    }

    async cleanupOldEvents() {
        try {
            const { data: events, sha } = await getFileContent(EVENTS_FILE_PATH);

            if (!Array.isArray(events) || events.length === 0) {
                console.log('No events to cleanup');
                return;
            }

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - config.EVENT_CLEANUP_DAYS);

            const initialCount = events.length;
            const filteredEvents = events.filter(event => {
                const eventDate = new Date(event.datetime);
                return eventDate >= cutoffDate;
            });

            const removedCount = initialCount - filteredEvents.length;

            if (removedCount > 0) {
                await updateFileContent(
                    EVENTS_FILE_PATH,
                    filteredEvents,
                    sha,
                    `Cleanup: Remove ${removedCount} old event(s) older than ${config.EVENT_CLEANUP_DAYS} days`
                );

                console.log(`Cleaned up ${removedCount} old events`);

                if (this.auditLogger) {
                    await this.auditLogger.log(
                        'Event Cleanup',
                        `Automatically removed ${removedCount} events older than ${config.EVENT_CLEANUP_DAYS} days`,
                        'system',
                        'Event Scheduler'
                    );
                }
            } else {
                console.log('No old events to cleanup');
            }

        } catch (error) {
            console.error('Error during event cleanup:', error);

            if (this.auditLogger) {
                await this.auditLogger.logError(
                    error,
                    'Event Cleanup Error',
                    'system',
                    'Event Scheduler'
                );
            }
        }
    }

    async processRepeatingEvents() {
        try {
            // Get repeating events configuration
            const { data: repeatingEvents } = await getFileContent(REPEATING_EVENTS_FILE_PATH);

            if (!Array.isArray(repeatingEvents) || repeatingEvents.length === 0) {
                console.log('No repeating events configured');
                return;
            }

            // Get current events
            const { data: currentEvents, sha } = await getFileContent(EVENTS_FILE_PATH);

            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + (config.REPEATING_EVENT_ADVANCE_WEEKS * 7));

            let eventsAdded = 0;
            const newEvents = [...currentEvents];

            for (const repeatingEvent of repeatingEvents) {
                if (!repeatingEvent.enabled) {
                    continue;
                }

                // Find the next occurrence of this weekday at the target time
                const nextOccurrence = this.getNextWeekdayOccurrence(
                    targetDate,
                    repeatingEvent.weekday,
                    repeatingEvent.time
                );

                // Check if this event already exists
                const eventExists = currentEvents.some(event =>
                    event.locationId === repeatingEvent.locationId &&
                    event.datetime === nextOccurrence.toISOString().slice(0, 19)
                );

                if (!eventExists) {
                    newEvents.push({
                        locationId: repeatingEvent.locationId,
                        datetime: nextOccurrence.toISOString().slice(0, 19)
                    });
                    eventsAdded++;
                    console.log(`Added repeating event: ${repeatingEvent.name} on ${nextOccurrence.toISOString()}`);
                }
            }

            if (eventsAdded > 0) {
                // Sort events by datetime
                newEvents.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

                await updateFileContent(
                    EVENTS_FILE_PATH,
                    newEvents,
                    sha,
                    `Auto-add ${eventsAdded} repeating event(s) for ${config.REPEATING_EVENT_ADVANCE_WEEKS} weeks ahead`
                );

                console.log(`Added ${eventsAdded} repeating events`);

                if (this.auditLogger) {
                    await this.auditLogger.log(
                        'Repeating Events',
                        `Automatically added ${eventsAdded} repeating events for ${config.REPEATING_EVENT_ADVANCE_WEEKS} weeks ahead`,
                        'system',
                        'Event Scheduler'
                    );
                }
            } else {
                console.log('No new repeating events to add');
            }

        } catch (error) {
            console.error('Error processing repeating events:', error);

            if (this.auditLogger) {
                await this.auditLogger.logError(
                    error,
                    'Repeating Events Error',
                    'system',
                    'Event Scheduler'
                );
            }
        }
    }

    getNextWeekdayOccurrence(targetDate, weekday, time) {
        // weekday: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
        // time: "HH:MM:SS" format

        const [hours, minutes, seconds] = time.split(':').map(Number);

        const result = new Date(targetDate);
        result.setHours(hours, minutes, seconds, 0);

        // Calculate days until target weekday
        const daysUntilTarget = (weekday - result.getDay() + 7) % 7;

        if (daysUntilTarget === 0) {
            // If it's the same weekday, check if we've passed the time
            const now = new Date();
            if (result < now) {
                // Move to next week
                result.setDate(result.getDate() + 7);
            }
        } else {
            result.setDate(result.getDate() + daysUntilTarget);
        }

        return result;
    }

    // Manual trigger methods for testing
    async triggerCleanup() {
        console.log('Manually triggering event cleanup...');
        await this.cleanupOldEvents();
    }

    async triggerRepeatingEvents() {
        console.log('Manually triggering repeating events...');
        await this.processRepeatingEvents();
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            jobCount: this.jobs.size,
            jobs: Array.from(this.jobs.keys())
        };
    }
}