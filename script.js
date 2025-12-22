let allEvents = [];
let filteredEvents = [];
let locations = [];
let times = [];
let liveData = [];
let userLocation = null;
let holidayConfig = null;
let activeHoliday = null;
let holidayStyleElement = null;
let loadedFeatures = {}; // Track which features have been loaded

// Detect if we're in local test mode
function isLocalTestMode() {
    const hostname = window.location.hostname;
    const urlParams = new URLSearchParams(window.location.search);
    // Check for localhost variants or explicit test mode parameter
    return hostname === 'localhost' || 
           hostname === '127.0.0.1' || 
           hostname === '[::1]' ||
           hostname.startsWith('127.') || // Any 127.x.x.x IPv4 localhost
           hostname === '0.0.0.0' ||
           urlParams.get('test') === 'local';
}

// Get data path based on mode
function getDataPath(filename) {
    if (isLocalTestMode()) {
        // In local test mode, try data/ first, then fall back to data/
        // You can also override with ?test=local&datapath=your/path
        const urlParams = new URLSearchParams(window.location.search);
        const customPath = urlParams.get('datapath');
        if (customPath) {
            return `${customPath}/${filename}`;
        }
        // Default to data/ for testing, but fall back to data/ if not found
        return `data/${filename}`;
    }
    return `data/${filename}`;
}

// Generate cache buster timestamp
function getCacheBuster() {
    return Date.now();
}

// Check if current time is within a holiday's start/end range
function getActiveHoliday(holidayConfig) {
    if (!holidayConfig || !holidayConfig.holidays || !Array.isArray(holidayConfig.holidays)) {
        return null;
    }

    const now = new Date();
    const activeHolidays = [];
    
    // Find all active holidays
    for (const holiday of holidayConfig.holidays) {
        if (!holiday.start || !holiday.end) continue;
        
        const startDate = new Date(holiday.start);
        const endDate = new Date(holiday.end);
        
        if (now >= startDate && now <= endDate) {
            activeHolidays.push(holiday);
        }
    }
    
    if (activeHolidays.length === 0) {
        return null;
    }
    
    // If only one active holiday, return it
    if (activeHolidays.length === 1) {
        return activeHolidays[0];
    }
    
    // If multiple active holidays, prioritize by most recent start date
    // This ensures NewYear takes precedence over Christmas if both are active
    activeHolidays.sort((a, b) => {
        const aStart = new Date(a.start);
        const bStart = new Date(b.start);
        return bStart - aStart; // Most recent first
    });
    
    // Merge features from all active holidays
    const primaryHoliday = activeHolidays[0];
    const mergedFeatures = new Set();
    
    activeHolidays.forEach(holiday => {
        if (holiday.features && Array.isArray(holiday.features)) {
            holiday.features.forEach(feature => mergedFeatures.add(feature));
        }
    });
    
    // Return the primary holiday (most recent) with merged features
    return {
        ...primaryHoliday,
        features: Array.from(mergedFeatures)
    };
}

// Inject holiday-specific CSS styles
function injectHolidayStyles(holiday) {
    // Remove existing holiday styles
    if (holidayStyleElement) {
        holidayStyleElement.remove();
        holidayStyleElement = null;
    }

    if (!holiday || !holiday.styles) {
        return;
    }

    const styles = holiday.styles;
    const holidayType = holiday.type ? holiday.type.toLowerCase() : 'holiday';
    const className = `holiday-message-${holidayType}`;
    
    let css = `.${className} { ${styles.message || ''} }\n`;
    
    if (styles.before) {
        css += `.${className}::before { ${styles.before} }\n`;
    }
    
    if (styles.after) {
        css += `.${className}::after { ${styles.after} }\n`;
    }
    
    // Add keyframes if they exist
    if (styles.keyframes) {
        for (const [name, keyframe] of Object.entries(styles.keyframes)) {
            css += `@keyframes ${name} { ${keyframe} }\n`;
        }
    }
    
    // Inject the styles
    holidayStyleElement = document.createElement('style');
    holidayStyleElement.id = 'holiday-styles';
    holidayStyleElement.textContent = css;
    document.head.appendChild(holidayStyleElement);
}

// Load a feature module dynamically
function loadFeature(featureName) {
    return new Promise((resolve, reject) => {
        // Check if already loaded
        if (loadedFeatures[featureName]) {
            resolve();
            return;
        }
        
        const script = document.createElement('script');
        script.src = `features/${featureName}.js`;
        script.onload = () => {
            loadedFeatures[featureName] = true;
            resolve();
        };
        script.onerror = () => {
            console.error(`Failed to load feature: ${featureName}`);
            reject(new Error(`Failed to load feature: ${featureName}`));
        };
        document.head.appendChild(script);
    });
}

// Activate holiday features based on the features array
async function activateHolidayFeatures(holiday) {
    if (!holiday || !holiday.features || !Array.isArray(holiday.features)) {
        // No holiday or no features, remove all features
        if (window.snowFeature) {
            window.snowFeature.removeSnow();
        }
        if (window.fireworksFeature) {
            window.fireworksFeature.removeFireworks();
        }
        return;
    }

    // Load and activate features
    if (holiday.features.includes('snow')) {
        try {
            await loadFeature('snow');
            if (window.snowFeature) {
                window.snowFeature.createSnow();
            }
        } catch (error) {
            console.error('Failed to activate snow feature:', error);
        }
    } else {
        if (window.snowFeature) {
            window.snowFeature.removeSnow();
        }
    }

    if (holiday.features.includes('fireworks')) {
        try {
            await loadFeature('fireworks');
            if (window.fireworksFeature) {
                window.fireworksFeature.createFireworks();
            }
        } catch (error) {
            console.error('Failed to activate fireworks feature:', error);
        }
    } else {
        if (window.fireworksFeature) {
            window.fireworksFeature.removeFireworks();
        }
    }
}

// Generate Google Maps URL from coordinates and venue info
function generateGoogleMapsUrl(lat, lng) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

// Generate What3Words URL from coordinates
function generateWhat3WordsUrl(lat, lng) {
    return `https://what3words.com/${lat},${lng}`;
}

// Check if event is in the past (more than 1 day ago)
function isEventPast(datetimeString) {
    const eventDate = new Date(datetimeString);
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

    return eventDate < oneDayAgo;
}

// Check if event is currently live (started within last 3 hours)
function isEventLive(datetimeString) {
    const eventDate = new Date(datetimeString);
    const now = new Date();
    const threeHoursAgo = new Date(now.getTime() - (3 * 60 * 60 * 1000));

    return eventDate >= threeHoursAgo && eventDate <= now;
}

// Check if event is starting soon (within next 3 hours)
function isEventStartingSoon(datetimeString) {
    const eventDate = new Date(datetimeString);
    const now = new Date();
    const threeHoursFromNow = new Date(now.getTime() + (3 * 60 * 60 * 1000));

    return eventDate > now && eventDate <= threeHoursFromNow;
}

// Check if event has live content
function getEventLiveContent(locationId, datetime) {
    return liveData.find(live =>
        live.locationId === locationId &&
        live.datetime === datetime
    );
}

// Load live data
async function loadLiveData() {
    try {
        const cacheBuster = getCacheBuster();
        const dataPath = getDataPath('live.json');
        const response = await fetch(`${dataPath}?v=${cacheBuster}`);
        if (response.ok) {
            liveData = await response.json();
        } else {
            // In local test mode, try fallback to data/ if data/ doesn't exist
            if (isLocalTestMode() && dataPath.startsWith('data/')) {
                const fallbackResponse = await fetch(`data/live.json?v=${cacheBuster}`);
                if (fallbackResponse.ok) {
                    liveData = await fallbackResponse.json();
                } else {
                    liveData = [];
                }
            } else {
                liveData = []; // File doesn't exist or error, use empty array
            }
        }
    } catch (error) {
        console.log('No live.json file found or error loading it');
        liveData = [];
    }
}

// Toggle live content visibility
function toggleLiveContent(eventId) {
    const contentRow = document.getElementById(`live-${eventId}`);
    const button = document.querySelector(`button[onclick="toggleLiveContent('${eventId}')"]`);

    if (contentRow.style.display === 'none') {
        contentRow.style.display = 'table-row';
        button.innerHTML = '▲';
        button.classList.add('expanded');
    } else {
        contentRow.style.display = 'none';
        button.innerHTML = '▼';
        button.classList.remove('expanded');
    }
}

// Format datetime for display
function formatDateTime(datetimeString) {
    const date = new Date(datetimeString);
    const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const monthNames = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
        'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

    const dayName = dayNames[date.getDay()];
    const dayNumber = date.getDate();
    const monthName = monthNames[date.getMonth()];

    // Add ordinal suffix
    const getOrdinal = (n) => {
        const s = ['TH', 'ST', 'ND', 'RD'];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    const dayWithOrdinal = getOrdinal(dayNumber);

    // Format time with minutes
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 should be 12

    // Include minutes if thee are any
    const timeDisplay = minutes > 0 ? `${hours}.${minutes.toString().padStart(2, '0')}${ampm}` : `${hours}${ampm}`;

    return {
        dayBanner: `${dayName} ${dayWithOrdinal} ${monthName}`,
        timeDisplay: timeDisplay,
        sortKey: date.getTime()
    };
}

// Load sidebar content
async function loadSidebarContent() {
    try {
        const cacheBuster = getCacheBuster();
        const aboutPath = getDataPath('about.json');
        const attendPath = getDataPath('attend.json');
        const morePath = getDataPath('more.json');
        
        const [aboutResponse, attendResponse, moreResponse] = await Promise.all([
            fetch(`${aboutPath}?v=${cacheBuster}`),
            fetch(`${attendPath}?v=${cacheBuster}`),
            fetch(`${morePath}?v=${cacheBuster}`)
        ]);

        // Handle fallback for local test mode
        let aboutData, attendData, moreData;
        
        if (!aboutResponse.ok && isLocalTestMode() && aboutPath.startsWith('data/')) {
            const fallback = await fetch(`data/about.json?v=${cacheBuster}`);
            aboutData = fallback.ok ? await fallback.json() : await aboutResponse.json();
        } else {
            aboutData = await aboutResponse.json();
        }
        
        if (!attendResponse.ok && isLocalTestMode() && attendPath.startsWith('data/')) {
            const fallback = await fetch(`data/attend.json?v=${cacheBuster}`);
            attendData = fallback.ok ? await fallback.json() : await attendResponse.json();
        } else {
            attendData = await attendResponse.json();
        }
        
        if (!moreResponse.ok && isLocalTestMode() && morePath.startsWith('data/')) {
            const fallback = await fetch(`data/more.json?v=${cacheBuster}`);
            moreData = fallback.ok ? await fallback.json() : await moreResponse.json();
        } else {
            moreData = await moreResponse.json();
        }

        populateAboutSidebar(aboutData);
        populateAttendSidebar(attendData);
        populatemoreSidebar(moreData);

    } catch (error) {
        console.error('Error loading sidebar content:', error);
    }
}

function populateAboutSidebar(data) {
    const sidebar = document.querySelector('.sidebar');

    let html = `<h3>${data.title}</h3><div class="sidebar-content">`;

    data.sections.forEach(section => {
        html += `
            <h4>${section.heading}</h4>
            <p>${section.content}</p>
        `;
    });

    html += '</div>';
    sidebar.innerHTML = html;
}

function populateAttendSidebar(data) {
    const attendBox = document.querySelector('.sidebar-box:first-child .sidebar-content');

    let html = `<h3>${data.title}</h3>`;

    data.sections.forEach(section => {
        html += `
            <h4>${section.heading}</h4>
            <p>${section.content}</p>
        `;
    });

    attendBox.innerHTML = html;
}

function populatemoreSidebar(data) {
    const moreBox = document.querySelector('.sidebar-box:last-child .sidebar-content');

    let html = `<h3>${data.title}</h3>`;

    data.sections.forEach(section => {
        html += `<h5>${section.heading}</h5><ul>`;

        if (section.content && section.content.length > 0) {
            section.content.forEach(item => {
                html += `<li>${item.text}</li>`;
            });
        }

        html += '</ul>';
    });

    moreBox.innerHTML = html;
}

async function loadData() {
    try {
        const cacheBuster = getCacheBuster();
        const locationsPath = getDataPath('locations.json');
        const timesPath = getDataPath('times.json');
        const holidayPath = getDataPath('holiday.json');
        
        const [locationsResponse, timesResponse, holidayResponse] = await Promise.all([
            fetch(`${locationsPath}?v=${cacheBuster}`),
            fetch(`${timesPath}?v=${cacheBuster}`),
            fetch(`${holidayPath}?v=${cacheBuster}`),
            loadLiveData()
        ]);

        // Handle fallback for local test mode
        if (!locationsResponse.ok && isLocalTestMode() && locationsPath.startsWith('data/')) {
            const fallback = await fetch(`data/locations.json?v=${cacheBuster}`);
            if (fallback.ok) {
                locations = await fallback.json();
            } else {
                throw new Error('Failed to load locations.json');
            }
        } else if (!locationsResponse.ok) {
            throw new Error('Failed to load locations.json');
        } else {
            locations = await locationsResponse.json();
        }

        if (!timesResponse.ok && isLocalTestMode() && timesPath.startsWith('data/')) {
            const fallback = await fetch(`data/times.json?v=${cacheBuster}`);
            if (fallback.ok) {
                times = await fallback.json();
            } else {
                times = [];
            }
        } else if (!timesResponse.ok) {
            times = [];
        } else {
            times = await timesResponse.json();
        }
        
        // Load holiday config (optional, won't fail if missing)
        if (holidayResponse.ok) {
            holidayConfig = await holidayResponse.json();
        } else if (isLocalTestMode() && holidayPath.startsWith('data/')) {
            const fallback = await fetch(`data/holiday.json?v=${cacheBuster}`);
            if (fallback.ok) {
                holidayConfig = await fallback.json();
            } else {
                holidayConfig = { holidays: [] };
            }
        } else {
            holidayConfig = { holidays: [] };
        }

        // Check for active holiday based on current time
        activeHoliday = getActiveHoliday(holidayConfig);

        mergeEventData();
        renderEvents(); // Show table immediately
        
        // Activate holiday features
        activateHolidayFeatures(activeHoliday);
        
        requestUserLocation(); // Then try to get location

    } catch (error) {
        console.error('Error loading data:', error);
        showError('FAILED TO LOAD EVENT DATA');
    }
}

function requestUserLocation() {
    if (!navigator.geolocation) {
        console.log('Geolocation not supported');
        return;
    }

    // Show subtle location request message
    showLocationRequest();

    navigator.geolocation.getCurrentPosition(
        (position) => {
            userLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };
            console.log('User location obtained:', userLocation);
            calculateDistances();
            renderEvents(); // Re-render with distances and new sorting
        },
        (error) => {
            console.log('Location access denied or failed:', error.message);
            hideLocationRequest();
        },
        {
            timeout: 10000,
            enableHighAccuracy: false,
            maximumAge: 300000
        }
    );
}

function showLocationRequest() {
    // Add a subtle banner above the events
    const eventsContainer = document.getElementById('eventsContainer');
    if (eventsContainer && !document.getElementById('locationBanner')) {
        const banner = document.createElement('div');
        banner.id = 'locationBanner';
        banner.className = 'location-banner';
        banner.innerHTML = `
            <div style="text-align: center; padding: 8px; background: rgba(178, 34, 34, 0.8); color: #dacbb6; font-size: 0.8em; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px;">
                📍 ALLOW LOCATION ACCESS TO SORT BY NEAREST VENUES
            </div>
        `;
        eventsContainer.parentNode.insertBefore(banner, eventsContainer);
    }
}

function hideLocationRequest() {
    const banner = document.getElementById('locationBanner');
    if (banner) {
        banner.remove();
    }
}

function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 3959; // Earth's radius in miles
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRadians(degrees) {
    return degrees * (Math.PI / 180);
}

function calculateDistances() {
    if (!userLocation) return;

    allEvents.forEach(event => {
        if (event.lat && event.lng) {
            event.distance = calculateDistance(
                userLocation.lat,
                userLocation.lng,
                event.lat,
                event.lng
            );
        } else {
            event.distance = Infinity;
        }
    });

    filteredEvents = [...allEvents];
    hideLocationRequest(); // Remove the location request banner
}

function mergeEventData() {
    const locationMap = {};
    locations.forEach(location => {
        locationMap[location.id] = location;
    });

    allEvents = times
        .filter(timeEntry => !isEventPast(timeEntry.datetime)) // Filter out past events
        .map(timeEntry => {
            const location = locationMap[timeEntry.locationId];

            if (!location) {
                console.warn(`Location not found for ID: ${timeEntry.locationId}`);
                return null;
            }

            const dateTimeInfo = formatDateTime(timeEntry.datetime);

            const event = {
                locationId: timeEntry.locationId,
                datetime: timeEntry.datetime,
                date: dateTimeInfo.dayBanner,
                location: location.location,
                venue: location.venue,
                time: dateTimeInfo.timeDisplay,
                lat: location.lat,
                lng: location.lng,
                distance: null,
                sortKey: dateTimeInfo.sortKey,
                googleMapsUrl: generateGoogleMapsUrl(location.lat, location.lng),
                what3WordsUrl: generateWhat3WordsUrl(location.lat, location.lng)
            };
            
            // Include the about field if it exists in the time entry
            if (timeEntry.about) {
                event.about = timeEntry.about;
            }
            
            return event;
        }).filter(event => event !== null);

    filteredEvents = [...allEvents];
}

function initializeEvents() {
    // Log test mode status
    if (isLocalTestMode()) {
        console.log('🧪 Local test mode enabled - loading from data/');
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('datapath')) {
            console.log(`📁 Custom data path: ${urlParams.get('datapath')}`);
        }
    }
    
    setupFilter();
    loadSidebarContent(); // Load sidebar content
    loadData(); // Load events data and show table immediately
}

function setupFilter() {
    const filterInput = document.getElementById('filterInput');
    if (filterInput) {
        filterInput.addEventListener('input', handleFilter);
    }
}

function handleFilter(event) {
    const searchTerm = event.target.value.toLowerCase().trim();

    if (searchTerm === '') {
        filteredEvents = [...allEvents];
    } else {
        filteredEvents = allEvents.filter(event =>
            event.location.toLowerCase().includes(searchTerm) ||
            event.venue.toLowerCase().includes(searchTerm)
        );
    }

    renderEvents();
}

function showError(message) {
    const container = document.getElementById('eventsContainer');
    if (container) {
        container.innerHTML = `<div class="no-events">${message}</div>`;
    }
}

function addPulseToExpandButtons() {
    const expandButtons = document.querySelectorAll('.expand-btn');
    expandButtons.forEach(button => {
        button.classList.add('pulse');
    });

    // Remove pulse after 4 seconds
    setTimeout(() => {
        expandButtons.forEach(button => {
            button.classList.remove('pulse');
        });
    }, 4000);
}

function renderEvents() {
    const container = document.getElementById('eventsContainer');
    if (!container) return;

    // Check for active holiday mode
    if (activeHoliday && filteredEvents.length === 0) {
        // Inject holiday styles first, then render
        injectHolidayStyles(activeHoliday);
        
        const holidayType = activeHoliday.type ? activeHoliday.type.toLowerCase() : '';
        const holidayClass = holidayType ? `holiday-message holiday-message-${holidayType}` : 'holiday-message';
        container.innerHTML = `<div class="${holidayClass}">${activeHoliday.message}</div>`;
        
        // Activate holiday features
        activateHolidayFeatures(activeHoliday);
        
        return;
    } else {
        // No active holiday, remove all features and styles
        injectHolidayStyles(null);
        activateHolidayFeatures(null);
    }

    if (filteredEvents.length === 0) {
        container.innerHTML = '<div class="no-events">NO EVENTS FOUND</div>';
        return;
    }

    // Group events by date
    const eventsByDate = {};
    filteredEvents.forEach(event => {
        if (!eventsByDate[event.date]) {
            eventsByDate[event.date] = [];
        }
        eventsByDate[event.date].push(event);
    });

    let html = '';

    // Sort dates chronologically using sortKey
    const sortedDates = Object.keys(eventsByDate).sort((a, b) => {
        const eventsA = eventsByDate[a];
        const eventsB = eventsByDate[b];
        return eventsA[0].sortKey - eventsB[0].sortKey;
    });

    sortedDates.forEach(date => {
        html += `<div class="day-banner">${date}</div>`;
        html += `
            <table class="event-table">
                <thead>
                    <tr>
                        <th>LOCATION</th>
                        <th>VENUE</th>
                        <th>TIME</th>
                        ${userLocation ? '<th>DISTANCE</th>' : ''}
                        <th>MAPS</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
        `;

        // Sort events within each day
        eventsByDate[date].sort((a, b) => {
            // If we have user location, sort by distance first
            if (userLocation && a.distance !== null && b.distance !== null) {
                if (Math.abs(a.distance - b.distance) > 0.1) {
                    return a.distance - b.distance;
                }
            }
            // Fall back to time sorting using sortKey
            return a.sortKey - b.sortKey;
        });

        eventsByDate[date].forEach(event => {
            const isLive = isEventLive(event.datetime);
            const isStartingSoon = isEventStartingSoon(event.datetime);
            const liveContent = getEventLiveContent(event.locationId, event.datetime);
            const hasLiveContent = liveContent && liveContent.live && liveContent.live.length > 0;

            let rowClass = '';
            let badge = '';

            if (isLive) {
                rowClass = ' class="live-event"';
                badge = ' <span class="live-badge">NOW</span>';
            } else if (isStartingSoon) {
                rowClass = ' class="starting-soon-event"';
                badge = ' <span class="starting-soon-badge">STARTING SOON</span>';
            }

            const distanceCell = userLocation && event.distance !== null && event.distance !== Infinity ?
                `<td>${event.distance.toFixed(1)} MI</td>` :
                (userLocation ? '<td>-</td>' : '');

            const expandButton = hasLiveContent ?
                `<td><button class="expand-btn" onclick="toggleLiveContent('${event.locationId}-${event.datetime}')">▼</button></td>` :
                '<td></td>';

            // Add info button if event has about information
            const infoButton = event.about ? 
                `<button class="info-button" data-about="${event.about.replace(/"/g, '&quot;')}" title="More info">ℹ️</button>` : 
                '';
                
            html += `
                <tr${rowClass}>
                    <td>${event.location}${infoButton}</td>
                    <td>${event.venue}${badge}</td>
                    <td>${event.time}</td>
                    ${distanceCell}
                    <td>
                        <a href="${event.googleMapsUrl}" target="_blank" class="map-link">GMAPS</a> | 
                        <a href="${event.what3WordsUrl}" target="_blank" class="map-link">W3W</a>
                    </td>
                    ${expandButton}
                </tr>
            `;

            // Add live content row (initially hidden)
            if (hasLiveContent) {
                const colSpan = userLocation ? 6 : 5;
                html += `
                    <tr class="live-content-row" id="live-${event.locationId}-${event.datetime}" style="display: none;">
                        <td colspan="${colSpan}" class="live-content">
                            <div class="live-items">
                `;

                liveContent.live.forEach(item => {
                    let logoHtml = '';
                    if (item.logo && item.logo !== 'none') {
                        logoHtml = `<img src='images/icons/${item.logo}.png' alt='' class='inline-icon icon-${item.logo}'>`;
                    }
                    html += `<div class="live-item"><a href="${item.link}" class="live-link" target="_blank">${logoHtml}${item.name}</a> ${item.comment}</div>`;
                });

                html += `
                            </div>
                        </td>
                    </tr>
                `;
            }
        });

        html += `
                </tbody>
            </table>
        `;
    });

    container.innerHTML = html;

    addPulseToExpandButtons();
}

// Show info popup with content
function showInfoPopup(content) {
    const popup = document.getElementById('infoPopup');
    const popupContent = document.getElementById('popupContent');
    
    // Create a temporary div to parse the HTML content
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    
    // Clear previous content and append the parsed nodes
    popupContent.innerHTML = '';
    while (tempDiv.firstChild) {
        popupContent.appendChild(tempDiv.firstChild);
    }
    
    popup.style.display = 'flex';
}

// Close info popup
function closeInfoPopup() {
    const popup = document.getElementById('infoPopup');
    popup.style.display = 'none';
}

// Add event listeners for popup close button
document.addEventListener('DOMContentLoaded', () => {
    // Close popup when clicking the close button
    document.querySelector('.close-popup').addEventListener('click', closeInfoPopup);
    
    // Close popup when clicking outside the content
    document.getElementById('infoPopup').addEventListener('click', (e) => {
        if (e.target === document.getElementById('infoPopup')) {
            closeInfoPopup();
        }
    });
    
    // Handle info button clicks using event delegation
    document.addEventListener('click', (e) => {
        const infoButton = e.target.closest('.info-button');
        if (infoButton) {
            e.preventDefault();
            const aboutContent = infoButton.getAttribute('data-about');
            if (aboutContent) {
                showInfoPopup(aboutContent);
            }
        }
    });
    
    // Initialize events
    initializeEvents();
});
