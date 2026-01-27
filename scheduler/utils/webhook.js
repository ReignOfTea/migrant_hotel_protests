import http from 'http';
import crypto from 'crypto';
import { config } from '../config/config.js';
import { getFileContent } from './github.js';

const REPEATING_EVENTS_FILE_PATH = 'data/repeating-events.json';

/**
 * Verify GitHub webhook signature using X-Hub-Signature-256.
 * @param {Buffer} body - Raw request body
 * @param {string} signature - X-Hub-Signature-256 header value
 * @param {string} secret - Webhook secret
 * @returns {boolean}
 */
function verifySignature(body, signature, secret) {
    if (!signature || !secret) return false;
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
    if (signature.length !== expected.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'));
    } catch {
        return false;
    }
}

/**
 * Check if a GitHub push payload touches data/repeating-events.json.
 * Push payload does not include file lists by default, so we treat any push
 * to the watched ref as a trigger. processRepeatingEvents is idempotent.
 * @param {object} payload - Parsed webhook payload
 * @returns {boolean}
 */
function isRepeatingEventsRelevant(payload) {
    const ref = payload.ref || '';
    const branch = config.WEBHOOK_BRANCH || 'refs/heads/master';
    if (ref !== branch) return false;
    // If the payload includes commits with filenames (e.g. from a service that adds them), we could
    // check for REPEATING_EVENTS_FILE_PATH here. Standard push does not, so we trigger on any push.
    return true;
}

/**
 * Create an HTTP server that accepts GitHub push webhooks and triggers
 * repeating-events processing when the watched branch is updated.
 * @param {(function(): Promise<void>)} onTrigger - Called when we should run processRepeatingEvents
 * @param {{ log?(msg: string): void }} logger - Optional logger
 * @returns {http.Server}
 */
export function createWebhookServer(onTrigger, logger = {}) {
    const log = (msg) => (logger.log ? logger.log(msg) : console.log(msg));

    const server = http.createServer(async (req, res) => {
        if (req.method !== 'POST' || req.url !== (config.WEBHOOK_PATH || '/webhook/github')) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
            return;
        }

        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks);

        const event = req.headers['x-github-event'];
        const signature = req.headers['x-hub-signature-256'];

        if (event !== 'push') {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('OK');
            return;
        }

        if (!config.GITHUB_WEBHOOK_SECRET) {
            log('Webhook received but GITHUB_WEBHOOK_SECRET is not set; ignoring.');
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('OK');
            return;
        }

        if (!verifySignature(body, signature, config.GITHUB_WEBHOOK_SECRET)) {
            log('Webhook signature verification failed.');
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end('Invalid signature');
            return;
        }

        let payload;
        try {
            payload = JSON.parse(body.toString('utf8'));
        } catch {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Invalid JSON');
            return;
        }

        if (!isRepeatingEventsRelevant(payload)) {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('OK');
            return;
        }

        res.writeHead(202, { 'Content-Type': 'text/plain' });
        res.end('Accepted');

        try {
            log('Webhook: push to watched branch, triggering repeating events processing...');
            await onTrigger();
        } catch (err) {
            console.error('Webhook-triggered repeating events failed:', err);
        }
    });

    return server;
}

/**
 * Poll GitHub for changes to data/repeating-events.json and call onTrigger when sha changes.
 * @param {(function(): Promise<void>)} onTrigger - Called when repeating-events.json may have changed
 * @param {number} intervalSeconds - Poll interval in seconds
 * @param {{ log?(msg: string): void }} logger - Optional logger
 * @returns {NodeJS.Timeout} - Interval id for clearInterval
 */
export function startRepeatingEventsPolling(onTrigger, intervalSeconds, logger = {}) {
    const log = (msg) => (logger.log ? logger.log(msg) : console.log(msg));
    let lastSha = null;

    const poll = async () => {
        try {
            const { sha } = await getFileContent(REPEATING_EVENTS_FILE_PATH);
            if (lastSha !== null && lastSha !== sha) {
                log(`Poll: repeating-events.json changed (sha ${sha}), triggering processing...`);
                await onTrigger();
            }
            lastSha = sha;
        } catch (err) {
            // File might not exist yet or API error; don't spam logs
            if (lastSha !== undefined) console.error('Poll check failed:', err.message);
        }
    };

    log(`Starting repeating-events polling every ${intervalSeconds}s`);
    poll(); // run once immediately to set lastSha
    return setInterval(poll, intervalSeconds * 1000);
}
