// Snow feature module
// Exports: createSnow, removeSnow

let snowInterval = null;

function createSnowflake(snowContainer) {
    // Limit max snowflakes on screen for performance
    const maxSnowflakes = 35;
    if (snowContainer.children.length >= maxSnowflakes) {
        return;
    }
    
    const snowflake = document.createElement('div');
    
    // Randomly assign one of 4 animation variants for visual variety
    const variant = Math.floor(Math.random() * 4) + 1;
    snowflake.className = `snowflake variant-${variant}`;
    
    // Random starting position across the top
    const startX = Math.random() * 100;
    snowflake.style.left = startX + '%';
    
    // Random size (1.5px to 4px - slightly smaller for performance)
    const size = Math.random() * 2.5 + 1.5;
    snowflake.style.width = size + 'px';
    snowflake.style.height = size + 'px';
    
    // Random opacity (0.4 to 0.9 for depth)
    snowflake.style.opacity = Math.random() * 0.5 + 0.4;
    
    // Varied fall speeds
    const fallDuration = Math.random() * 8 + 6; // 6s to 14s
    snowflake.style.animationDuration = fallDuration + 's';
    
    // Random starting delay
    snowflake.style.animationDelay = Math.random() * 2 + 's';
    
    // Remove snowflake when animation completes (using single event delegation)
    snowflake.dataset.removeOnEnd = 'true';
    
    snowContainer.appendChild(snowflake);
}

function createSnow() {
    // Remove existing snow if any
    removeSnow();
    
    const snowContainer = document.createElement('div');
    snowContainer.id = 'snowContainer';
    snowContainer.className = 'snow-container';
    document.body.appendChild(snowContainer);
    
    // Use event delegation for better performance (single listener instead of one per flake)
    snowContainer.addEventListener('animationend', (e) => {
        if (e.target.dataset.removeOnEnd === 'true' && e.target.parentNode) {
            e.target.remove();
        }
    });
    
    // Create initial batch of snowflakes (reduced for performance)
    const initialCount = 20;
    for (let i = 0; i < initialCount; i++) {
        createSnowflake(snowContainer);
    }
    
    // Continuously spawn new snowflakes for constant downfall
    // Reduced frequency for better performance (300-600ms instead of 100-300ms)
    snowInterval = setInterval(() => {
        if (document.getElementById('snowContainer')) {
            createSnowflake(snowContainer);
        } else {
            // Container was removed, stop spawning
            if (snowInterval) {
                clearInterval(snowInterval);
                snowInterval = null;
            }
        }
    }, Math.random() * 300 + 300); // 300ms to 600ms intervals
}

function removeSnow() {
    // Stop spawning new snowflakes
    if (snowInterval) {
        clearInterval(snowInterval);
        snowInterval = null;
    }
    
    // Remove snow container (this will also remove all snowflakes)
    const snowContainer = document.getElementById('snowContainer');
    if (snowContainer) {
        snowContainer.remove();
    }
}

// Export functions to global scope for script.js to use
window.snowFeature = {
    createSnow: createSnow,
    removeSnow: removeSnow
};

