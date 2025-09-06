import 'dotenv/config';

const platform = process.argv[2] || '';

if (platform === 'discord') {
    await import('./discord-bot.js');
} else if (platform === 'telegram') {
    await import('./telegram-bot.js');
} else {
    console.log('Usage: node index.js [telegram|discord]');
    console.log('Starting both bots...');

    // Start both bots
    await Promise.all([
        import('./telegram-bot.js'),
        import('./discord-bot.js')
    ]);
}
