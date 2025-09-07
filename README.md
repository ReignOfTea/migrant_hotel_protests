# Abolish The Asylum System - Protest Tracker

A web application that tracks and displays information about protests against the UK asylum system. The project consists of a static frontend hosted on GitHub Pages and a separate backend bot system for content management.

## Overview

This project serves as a platform to organize and display information about protests against the UK's asylum system. The frontend is a static website that loads data from JSON files, while the backend consists of Discord and Telegram bots that allow authorized users to manage protest information securely.

## Key Features

- **Static Frontend**: Fast, secure, and easily deployable on GitHub Pages
- **Secure Backend**: Bot system completely separated from the frontend for enhanced security
- **Real-time Updates**: Dynamic content loading from JSON data files
- **Mobile Responsive**: Works on all device sizes
- **Search Functionality**: Filter protests by location
- **Dual Bot Support**: Manage content through Discord or Telegram

## Tech Stack

### Frontend
- HTML5, CSS3, JavaScript (Vanilla)
- GitHub Pages (Hosting)
- JSON for data storage

### Backend (Bots)
- Node.js
- Discord.js (v14)
- Grammy (Telegram Bot API)
- GitHub API (for updating content)
- dotenv (environment variables)
- node-cron (scheduled tasks)

## Security and Privacy

- **Complete Separation**: The bot system runs independently from the static website
- **No User Data**: The website doesn't collect or process any user data
- **Secure Authentication**: Bot access is restricted to authorized users only
- **Environment Variables**: Sensitive configuration is stored in .env files (not committed to version control)

## Getting Started

### For Website Users

Simply visit https://reignoftea.github.io/migrant_hotel_protests/ to view protest information. No installation or setup is required.

### For Bot Operators

#### Prerequisites
- Node.js (v16 or later)
- npm or yarn
- Discord Bot Token and/or Telegram Bot Token
- GitHub Personal Access Token with repo access

#### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/ReignOfTea/migrant_hotel_protests.git
   cd migrant_hotel_protests/bot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Fill in your bot tokens and GitHub credentials

4. Start the bot:
   - For Discord: `npm run discord`
   - For Telegram: `npm run telegram`
   - For both: `npm run start`
   - For development with auto-reload: `npm run discord-dev` or `npm run telegram-dev`
   - For development with auto-reload for both: `npm run dev`

## Bot Commands

### Discord Commands

#### About
- `/about add <heading>` - Add a new about section
- `/about remove` - Remove an about section
- `/about edit` - Edit an existing about section
- `/about view` - View all about sections

#### Attend
- `/attend add <heading>` - Add a new attend section
- `/attend remove` - Remove an attend section
- `/attend edit` - Edit an existing attend section
- `/attend view` - View all attend sections

#### Events
- `/events add` - Add a new event
- `/events remove` - Remove an event
- `/events view` - View all events

#### Locations
- `/locations add` - Add a new location
- `/locations remove` - Remove a location
- `/locations view` - View all locations

#### More
- `/more` - Manage additional content sections
  - Add/remove sections
  - Manage section content
  - View current content

#### Schedule
- `/schedule add` - Add a new repeating event
- `/schedule remove` - Remove a repeating event
- `/schedule toggle` - Toggle a repeating event
- `/schedule view` - View all repeating events
- `/schedule cleanup` - Manually trigger event cleanup
- `/schedule process` - Manually process repeating events
- `/schedule status` - View scheduler status

### Telegram Commands

#### About
- `/about` - Manage about sections
  - Add/remove sections
  - View current content

#### Attend
- `/attend` - Manage attend sections
  - Add/remove sections
  - View current content

#### Events
- `/events` - Manage events
  - Add/remove events
  - View all events

#### Live
- `/live` - Manage live streams
  - Add/remove streams
  - View current streams

#### Locations
- `/locations` - Manage locations
  - Add/remove locations
  - View all locations

#### More
- `/more` - Manage additional content
  - Add/remove sections
  - Manage section content
  - View current content

#### Schedule
- `/schedule` - Manage scheduled events
  - Add/remove repeating events
  - Toggle events
  - View all schedules
  - Manual cleanup and processing

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

### Bot Development
1. Make changes to bot files in the `bot` directory
2. Test changes using the development scripts
3. Commit and push changes to the `master` branch

## Contributing

Contributions are welcome! Please open an issue or submit a pull request with your proposed changes.

## License

This project is licensed under the AGPL-3.0 License - see the [LICENSE](LICENSE) file for details.

## Support

For support or questions, please open an issue in the GitHub repository.
Or reach out to me on X: https://x.com/ReignTea
