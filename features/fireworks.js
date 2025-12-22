// Fireworks feature module
// Exports: createFireworks, removeFireworks

let fireworksInterval = null;

function createFirework(targetX, targetY) {
    // Random firework colors
    const colors = [
        '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff',
        '#ff8800', '#8800ff', '#ff0088', '#88ff00'
    ];
    const color1 = colors[Math.floor(Math.random() * colors.length)];
    const color2 = colors[Math.floor(Math.random() * colors.length)];
    
    // Add random angle variation (-35 to +35 degrees from vertical)
    const angleDeg = (Math.random() * 70 - 35); // -35 to +35 degrees
    const angleRad = angleDeg * (Math.PI / 180);
    
    // Calculate starting position at bottom of screen
    // We need to work backwards from target to find where to start
    const startY = window.innerHeight;
    const verticalDistance = startY - targetY;
    
    // Calculate horizontal offset based on angle
    // tan(angle) = horizontal / vertical
    let horizontalDistance = Math.tan(angleRad) * verticalDistance;
    let startX = targetX - horizontalDistance;
    
    // Clamp startX to keep firework on screen (with some margin)
    const margin = 50;
    if (startX < margin) {
        startX = margin;
        // Recalculate horizontal distance if we had to clamp
        horizontalDistance = targetX - startX;
    } else if (startX > window.innerWidth - margin) {
        startX = window.innerWidth - margin;
        horizontalDistance = targetX - startX;
    }
    
    // Calculate total distance along the angled path
    const totalDistance = Math.sqrt(verticalDistance * verticalDistance + horizontalDistance * horizontalDistance);
    
    // Create firework container at starting position (bottom)
    const firework = document.createElement('div');
    firework.className = 'firework';
    firework.style.left = startX + 'px';
    firework.style.top = startY + 'px';
    
    // Create trail that goes up at an angle
    const trail = document.createElement('div');
    trail.className = 'firework-trail';
    
    // Set trail color (use one of the firework colors)
    trail.style.backgroundColor = color1;
    trail.style.boxShadow = `0 0 10px ${color1}, 0 0 20px ${color1}, 0 0 30px ${color1}`;
    
    // Make trail slightly larger and elongated for visibility
    const trailSize = Math.random() * 2 + 3; // 3-5px
    trail.style.width = trailSize + 'px';
    trail.style.height = trailSize + 'px';
    
    // Set trail animation - it will move along the angled path
    const trailDuration = 0.6; // 0.6 seconds to travel
    trail.style.animationDuration = trailDuration + 's';
    trail.style.setProperty('--x-distance', horizontalDistance + 'px');
    trail.style.setProperty('--y-distance', -verticalDistance + 'px');
    
    firework.appendChild(trail);
    document.body.appendChild(firework);
    
    // Create smoke trail particles that fade behind the trail
    const smokeParticleCount = 20; // Number of smoke particles
    const smokeInterval = trailDuration / smokeParticleCount; // Time between each smoke particle
    
    for (let i = 0; i < smokeParticleCount; i++) {
        setTimeout(() => {
            const smoke = document.createElement('div');
            smoke.className = 'firework-smoke';
            
            // Calculate position along the angled trail path at this moment
            const progress = i / smokeParticleCount;
            const currentX = startX + (horizontalDistance * progress);
            const currentY = startY - (verticalDistance * progress);
            
            // Position smoke particle at current trail position
            smoke.style.left = currentX + 'px';
            smoke.style.top = currentY + 'px';
            
            // Random size for smoke (larger, more diffuse)
            const smokeSize = Math.random() * 8 + 6; // 6-14px
            smoke.style.width = smokeSize + 'px';
            smoke.style.height = smokeSize + 'px';
            
            // Smoke color - darker, more grayish, with slight color tint from firework
            const grayBase = 80 + Math.random() * 40; // 80-120
            const smokeOpacity = 0.5 + Math.random() * 0.3; // 0.5-0.8
            smoke.style.backgroundColor = `rgba(${grayBase}, ${grayBase}, ${grayBase}, ${smokeOpacity})`;
            smoke.style.boxShadow = `0 0 ${smokeSize * 1.5}px rgba(${grayBase}, ${grayBase}, ${grayBase}, 0.6)`;
            
            // Random horizontal drift for smoke (more drift as it fades)
            const drift = (Math.random() * 30 - 15); // -15px to +15px
            smoke.style.setProperty('--drift', drift + 'px');
            
            // Fade out duration (longer than trail, creating lingering effect)
            const fadeDuration = 1.8 + Math.random() * 0.7; // 1.8-2.5s
            smoke.style.animationDuration = fadeDuration + 's';
            smoke.style.animationDelay = '0s'; // Start immediately when created
            
            document.body.appendChild(smoke);
            
            // Remove smoke after animation
            setTimeout(() => {
                if (smoke.parentNode) {
                    smoke.remove();
                }
            }, fadeDuration * 1000);
        }, i * smokeInterval * 1000);
    }
    
    // After trail reaches target, create explosion at target position
    setTimeout(() => {
        // Remove trail
        if (trail.parentNode) {
            trail.remove();
        }
        
        // Move firework container to target position for explosion
        firework.style.left = targetX + 'px';
        firework.style.top = targetY + 'px';
        
        // Create particles for the explosion
        const particleCount = 30;
        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'firework-particle';
            
            // Random angle for particle direction
            const angle = (Math.PI * 2 * i) / particleCount + (Math.random() * 0.5 - 0.25);
            const velocity = Math.random() * 150 + 100; // 100-250px distance
            const xOffset = Math.cos(angle) * velocity;
            const yOffset = Math.sin(angle) * velocity;
            
            // Random size
            const size = Math.random() * 4 + 2; // 2-6px
            particle.style.width = size + 'px';
            particle.style.height = size + 'px';
            
            // Random color (mix of two colors)
            const useColor1 = Math.random() > 0.5;
            particle.style.backgroundColor = useColor1 ? color1 : color2;
            particle.style.boxShadow = `0 0 ${size * 2}px ${useColor1 ? color1 : color2}`;
            
            // Random duration
            const duration = Math.random() * 0.5 + 0.8; // 0.8-1.3s
            particle.style.animationDuration = duration + 's';
            
            // Set transform for explosion direction
            particle.style.setProperty('--x-offset', xOffset + 'px');
            particle.style.setProperty('--y-offset', yOffset + 'px');
            
            firework.appendChild(particle);
        }
    }, trailDuration * 1000);
    
    // Remove firework after all animations complete
    setTimeout(() => {
        if (firework.parentNode) {
            firework.remove();
        }
    }, (trailDuration + 1.5) * 1000);
}

function createFireworks() {
    // Remove existing fireworks if any
    removeFireworks();
    
    // Launch fireworks periodically
    const launchFirework = () => {
        // Random position on screen
        const x = Math.random() * window.innerWidth;
        const y = Math.random() * (window.innerHeight * 0.6) + (window.innerHeight * 0.2); // Upper 60% of screen
        
        createFirework(x, y);
    };
    
    // Launch initial firework
    launchFirework();
    
    // Launch fireworks every 1-3 seconds
    fireworksInterval = setInterval(() => {
        launchFirework();
    }, Math.random() * 2000 + 1000); // 1-3 seconds
}

function removeFireworks() {
    // Stop launching new fireworks
    if (fireworksInterval) {
        clearInterval(fireworksInterval);
        fireworksInterval = null;
    }
    
    // Remove all existing fireworks
    const fireworks = document.querySelectorAll('.firework');
    fireworks.forEach(firework => {
        firework.remove();
    });
    
    // Remove all existing smoke particles
    const smoke = document.querySelectorAll('.firework-smoke');
    smoke.forEach(smokeParticle => {
        smokeParticle.remove();
    });
}

// Export functions to global scope for script.js to use
window.fireworksFeature = {
    createFireworks: createFireworks,
    removeFireworks: removeFireworks
};

