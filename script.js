let allEvents = [];
let filteredEvents = [];
let locations = [];
let times = [];
let userLocation = null;

// Generate cache buster timestamp
function getCacheBuster() {
    return Date.now();
}

// Check if event is in the past (more than 1 day ago)
function isEventPast(datetimeString) {
    const eventDate = new Date(datetimeString);
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

    return eventDate < oneDayAgo;
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
        const [aboutResponse, attendResponse, socialsResponse] = await Promise.all([
            fetch(`data/about.json?v=${cacheBuster}`),
            fetch(`data/attend.json?v=${cacheBuster}`),
            fetch(`data/socials.json?v=${cacheBuster}`)
        ]);

        const aboutData = await aboutResponse.json();
        const attendData = await attendResponse.json();
        const socialsData = await socialsResponse.json();

        populateAboutSidebar(aboutData);
        populateAttendSidebar(attendData);
        populateSocialsSidebar(socialsData);

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

function populateSocialsSidebar(data) {
    const socialsBox = document.querySelector('.sidebar-box:last-child .sidebar-content');

    let html = `<h3>${data.title}</h3>`;

    data.sections.forEach(section => {
        if (section.type === 'links') {
            html += `<h5>${section.heading}</h5><ul>`;
            section.links.forEach(link => {
                html += `<li><a href="${link.url}" target="_blank">${link.text}</a></li>`;
            });
            html += '</ul>';
        } else {
            html += `
                <h4>${section.heading}</h4>
                <p>${section.content}</p>
            `;
        }
    });

    socialsBox.innerHTML = html;
}

async function loadData() {
    try {
        const cacheBuster = getCacheBuster();
        const [locationsResponse, timesResponse] = await Promise.all([
            fetch(`data/locations.json?v=${cacheBuster}`),
            fetch(`data/times.json?v=${cacheBuster}`)
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

            return {
                locationId: timeEntry.locationId,
                datetime: timeEntry.datetime,
                date: dateTimeInfo.dayBanner,
                location: location.location,
                venue: location.venue,
                time: dateTimeInfo.timeDisplay,
                mapUrl: location.mapUrl,
                lat: location.lat,
                lng: location.lng,
                distance: null,
                sortKey: dateTimeInfo.sortKey
            };
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
                        <th>MAP</th>
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
            const distanceCell = userLocation && event.distance !== null && event.distance !== Infinity ?
                `<td>${event.distance.toFixed(1)} MI</td>` :
                (userLocation ? '<td>-</td>' : '');

            html += `
                <tr>
                    <td>${event.location}</td>
                    <td>${event.venue}</td>
                    <td>${event.time}</td>
                    ${distanceCell}
                    <td><a href="${event.mapUrl}" target="_blank" class="map-link">VIEW MAP</a></td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;
    });

    container.innerHTML = html;
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initializeEvents);
