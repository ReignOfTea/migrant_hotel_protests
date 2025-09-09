let allEvents = [];
let filteredEvents = [];
let locations = [];
let times = [];
let liveData = [];
let userLocation = null;

// Generate cache buster timestamp
function getCacheBuster() {
    return Date.now();
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
        const response = await fetch(`data/live.json?v=${cacheBuster}`);
        if (response.ok) {
            liveData = await response.json();
        } else {
            liveData = []; // File doesn't exist or error, use empty array
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

    // Format time
    let hours = date.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 should be 12

    return {
        dayBanner: `${dayName} ${dayWithOrdinal} ${monthName}`,
        timeDisplay: `${hours}${ampm}`,
        sortKey: date.getTime()
    };
}

// Load sidebar content
async function loadSidebarContent() {
    try {
        const cacheBuster = getCacheBuster();
        const [aboutResponse, attendResponse, moreResponse] = await Promise.all([
            fetch(`data/about.json?v=${cacheBuster}`),
            fetch(`data/attend.json?v=${cacheBuster}`),
            fetch(`data/more.json?v=${cacheBuster}`)
        ]);

        const aboutData = await aboutResponse.json();
        const attendData = await attendResponse.json();
        const moreData = await moreResponse.json();

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
        const [locationsResponse, timesResponse] = await Promise.all([
            fetch(`data/locations.json?v=${cacheBuster}`),
            fetch(`data/times.json?v=${cacheBuster}`),
            loadLiveData()
        ]);

        if (!locationsResponse.ok || !timesResponse.ok) {
            throw new Error('Failed to load data files');
        }

        locations = await locationsResponse.json();
        times = await timesResponse.json();

        mergeEventData();
        renderEvents(); // Show table immediately
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
                `<button class="info-button" onclick="showInfoPopup('${event.about.replace(/'/g, "\\'").replace(/\n/g, '<br>')}')" title="More info">ℹ️</button>` : 
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
    
    // Initialize events
    initializeEvents();
});
