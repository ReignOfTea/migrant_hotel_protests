# Abolish The Asylum System - Protest Tracker

A web application that tracks and displays information about protests against the UK asylum system. The project consists of a static frontend hosted on GitHub Pages and an automated scheduler for managing recurring events.

## Overview

This project serves as a platform to organize and display information about protests against the UK's asylum system. The frontend is a static website that loads data from JSON files, while the scheduler automatically manages recurring events and cleans up old data.

## Key Features

- **Static Frontend**: Fast, secure, and easily deployable on GitHub Pages
- **Automated Scheduler**: Automatically manages recurring events and cleans up old data
- **Real-time Updates**: Dynamic content loading from JSON data files
- **Mobile Responsive**: Works on all device sizes
- **Search Functionality**: Filter protests by location

## Tech Stack

### Frontend
- HTML5, CSS3, JavaScript (Vanilla)
- GitHub Pages (Hosting)
- JSON for data storage

### Scheduler
- Node.js
- GitHub API (for updating content)
- dotenv (environment variables)
- node-cron (scheduled tasks)
- Telegram API (for error reporting)

## Security and Privacy

- **Complete Separation**: The scheduler runs independently from the static website
- **No User Data**: The website doesn't collect or process any user data
- **Environment Variables**: Sensitive configuration is stored in .env files (not committed to version control)

## Getting Started

### For Website Users

Simply visit https://asylumprotests.com to view protest information. No installation or setup is required.

### For Scheduler Operators

#### Prerequisites
- Node.js (v16 or later)
- npm or yarn
- GitHub Personal Access Token with repo access
- Telegram Bot Token (optional, for error reporting)

#### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/ReignOfTea/migrant_hotel_protests.git
   cd migrant_hotel_protests/scheduler
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   - Copy `.example.env` to `.env`
   - Fill in your GitHub credentials
   - Optionally add Telegram bot token for error logging

4. Start the scheduler:
   - Start daemon: `npm start`
   - Development mode: `npm run dev`
   - Manual cleanup: `npm run cleanup`
   - Manual schedule processing: `npm run schedule` or `npm run repeating`

5. **Trigger repeating events when `repeating-events.json` changes** (optional):
   - **Webhook (recommended)**: Set `GITHUB_WEBHOOK_SECRET` in `.env`, then in GitHub go to Settings → Webhooks → Add webhook. Use your public URL (e.g. `https://your-server.example.com/webhook/github`), set Content type to `application/json`, add the same secret, and choose “Just the push event”. When the repo is pushed (e.g. after editing `repeating-events.json`), the scheduler runs repeating-events processing within seconds.
   - **Polling fallback**: If you can’t receive webhooks (e.g. behind NAT), set `REPEATING_EVENTS_POLL_SECONDS=60` (or another interval) in `.env`. The scheduler will check the file via the GitHub API every N seconds and rerun processing when it changes. Max delay is about N seconds.

## Data Structure

The website loads data from several JSON files:
- `about.json` - General information about the movement
- `attend.json` - Information for attendees
- `live.json` - Currently active events details (Such as live streams, X threads, etc)
- `locations.json` - List of all protest locations
- `more.json` - Additional information for "more" sidebar
- `repeating-events.json` - Information about recurring events, automatically scheduled/added.
- `times.json` - Times of upcoming events

## Development

### Frontend Development
1. Make changes to HTML, CSS, or JavaScript files
2. Test locally by running a local server in the top directory
3. Commit and push changes to the `master` branch to update GitHub Pages

### Scheduler Development
1. Make changes to scheduler files in the `scheduler` directory
2. Test changes using the development scripts
3. Commit and push changes to the `master` branch

## Contributing

Contributions are welcome! Please open an issue or submit a pull request with your proposed changes.

## License

This project is licensed under the AGPL-3.0 License - see the [LICENSE](LICENSE) file for details.

## Support

For support or questions, please open an issue in the GitHub repository.
Or reach out to me on X: https://x.com/ReignTea
