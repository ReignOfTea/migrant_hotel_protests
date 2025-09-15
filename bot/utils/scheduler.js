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
            await this.cleanupOldExcludedDates();
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

    async cleanupOldExcludedDates() {
        try {
            const { data: repeatingEvents, sha } = await getFileContent(REPEATING_EVENTS_FILE_PATH);

            if (!Array.isArray(repeatingEvents) || repeatingEvents.length === 0) {
                console.log('No repeating events to process for excluded dates cleanup');
                return;
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            let totalCleaned = 0;
            let hasChanges = false;

            const updatedRepeatingEvents = repeatingEvents.map(event => {
                if (!event.excludedDates || !Array.isArray(event.excludedDates)) {
                    return event;
                }

                const initialCount = event.excludedDates.length;
                const filteredDates = event.excludedDates.filter(dateStr => {
                    const excludedDate = new Date(dateStr);
                    excludedDate.setHours(0, 0, 0, 0);
                    return excludedDate >= today;
                });

                const cleanedCount = initialCount - filteredDates.length;
                totalCleaned += cleanedCount;

                if (cleanedCount > 0) {
                    hasChanges = true;
                    return { ...event, excludedDates: filteredDates };
                }

                return event;
            });

            if (hasChanges) {
                await updateFileContent(
                    REPEATING_EVENTS_FILE_PATH,
                    updatedRepeatingEvents,
                    sha,
                    `Cleanup: Remove ${totalCleaned} old excluded date(s)`
                );

                console.log(`Cleaned up ${totalCleaned} old excluded dates`);

                if (this.auditLogger) {
                    await this.auditLogger.log(
                        'Excluded Dates Cleanup',
                        `Automatically removed ${totalCleaned} excluded dates that have passed`,
                        'system',
                        'Event Scheduler'
                    );
                }
            } else {
                console.log('No old excluded dates to cleanup');
            }

        } catch (error) {
            console.error('Error during excluded dates cleanup:', error);

            if (this.auditLogger) {
                await this.auditLogger.logError(
                    error,
                    'Excluded Dates Cleanup Error',
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

            const today = new Date();
            const endDate = new Date();
            endDate.setDate(today.getDate() + (config.REPEATING_EVENT_ADVANCE_WEEKS * 7));

            let eventsAdded = 0;
            let eventsRemoved = 0;
            let newEvents = [...currentEvents];
            const addedEventDetails = [];
            const removedEventDetails = [];

            for (const repeatingEvent of repeatingEvents) {
                if (!repeatingEvent.enabled) {
                    continue;
                }

                const excludedDates = repeatingEvent.excludedDates || [];
                const excludedDateStrings = excludedDates.map(date => new Date(date).toISOString().slice(0, 10));

                // Remove existing events that match excluded dates
                const initialEventCount = newEvents.length;
                newEvents = newEvents.filter(event => {
                    if (event.locationId !== repeatingEvent.locationId) {
                        return true;
                    }

                    const eventDateString = new Date(event.datetime).toISOString().slice(0, 10);
                    const isExcluded = excludedDateStrings.includes(eventDateString);

                    if (isExcluded) {
                        removedEventDetails.push({
                            name: repeatingEvent.name,
                            locationId: repeatingEvent.locationId,
                            datetime: event.datetime,
                            formattedDate: new Date(event.datetime).toLocaleDateString('en-GB', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                            })
                        });
                        console.log(`Removed excluded event: ${repeatingEvent.name} on ${event.datetime}`);
                    }

                    return !isExcluded;
                });
                eventsRemoved += initialEventCount - newEvents.length;

                // Find ALL occurrences of this weekday within the date range
                const occurrences = this.getAllWeekdayOccurrences(
                    today,
                    endDate,
                    repeatingEvent.weekday,
                    repeatingEvent.time
                );

                for (const occurrence of occurrences) {
                    const eventDatetime = occurrence.toISOString().slice(0, 19);
                    const eventDateString = occurrence.toISOString().slice(0, 10);

                    // Skip if this date is excluded
                    if (excludedDateStrings.includes(eventDateString)) {
                        continue;
                    }

                    // Check if this event already exists
                    const eventExists = newEvents.some(event =>
                        event.locationId === repeatingEvent.locationId &&
                        event.datetime === eventDatetime
                    );

                    if (!eventExists) {
                        newEvents.push({
                            locationId: repeatingEvent.locationId,
                            datetime: eventDatetime
                        });
                        eventsAdded++;

                        // Store details for audit log
                        addedEventDetails.push({
                            name: repeatingEvent.name,
                            locationId: repeatingEvent.locationId,
                            datetime: eventDatetime,
                            formattedDate: occurrence.toLocaleDateString('en-GB', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                            }),
                            formattedTime: occurrence.toLocaleTimeString('en-GB', {
                                hour: '2-digit',
                                minute: '2-digit'
                            })
                        });

                        console.log(`Added repeating event: ${repeatingEvent.name} on ${occurrence.toISOString()}`);
                    }
                }
            }

            if (eventsAdded > 0 || eventsRemoved > 0) {
                // Sort events by datetime
                newEvents.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

                const commitMessage = [];
                if (eventsAdded > 0) commitMessage.push(`add ${eventsAdded} repeating event(s)`);
                if (eventsRemoved > 0) commitMessage.push(`remove ${eventsRemoved} excluded event(s)`);

                await updateFileContent(
                    EVENTS_FILE_PATH,
                    newEvents,
                    sha,
                    `Auto-process repeating events: ${commitMessage.join(', ')}`
                );

                console.log(`Processed repeating events: ${eventsAdded} added, ${eventsRemoved} removed`);

                if (this.auditLogger) {
                    // Create detailed audit message
                    const auditMessage = this.formatRepeatingEventsAuditMessage(
                        addedEventDetails,
                        removedEventDetails,
                        config.REPEATING_EVENT_ADVANCE_WEEKS
                    );

                    await this.auditLogger.log(
                        'Repeating Events',
                        auditMessage,
                        'system',
                        'Event Scheduler'
                    );
                }
            } else {
                console.log('No repeating events changes needed');
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

    formatRepeatingEventsAuditMessage(addedEvents, removedEvents, weeksAhead) {
        const parts = [];

        if (addedEvents.length > 0) {
            parts.push(`Added ${addedEvents.length} repeating events for ${weeksAhead} weeks ahead:`);
            const addedList = addedEvents.map(event =>
                `• ${event.name} - ${event.formattedDate} at ${event.formattedTime}`
            ).join('\n');
            parts.push(addedList);
        }

        if (removedEvents.length > 0) {
            if (parts.length > 0) parts.push('');
            parts.push(`Removed ${removedEvents.length} excluded events:`);
            const removedList = removedEvents.map(event =>
                `• ${event.name} - ${event.formattedDate}`
            ).join('\n');
            parts.push(removedList);
        }

        return parts.join('\n\n');
    }

    getAllWeekdayOccurrences(startDate, endDate, weekday, time) {
        const [hours, minutes, seconds] = time.split(':').map(Number);
        const occurrences = [];

        // Start from the beginning of the start date
        const current = new Date(startDate);
        current.setHours(0, 0, 0, 0);

        // Find the first occurrence of the target weekday
        const daysUntilTarget = (weekday - current.getDay() + 7) % 7;
        current.setDate(current.getDate() + daysUntilTarget);

        // Set the time
        current.setHours(hours, minutes, seconds, 0);

        // If the first occurrence is in the past (same day but time has passed), move to next week
        if (current <= startDate) {
            current.setDate(current.getDate() + 7);
        }

        // Collect all occurrences within the date range
        while (current <= endDate) {
            occurrences.push(new Date(current));
            current.setDate(current.getDate() + 7); // Move to next week
        }

        return occurrences;
    }

    // Manual trigger methods for testing
    async triggerCleanup() {
        console.log('Manually triggering event cleanup...');
        await this.cleanupOldEvents();
        await this.cleanupOldExcludedDates();
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
