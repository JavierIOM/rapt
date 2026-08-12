import './style.css'
import Chart from 'chart.js/auto'

let charts = {};

// Temperature limits (will be loaded from localStorage or API config)
function loadTempConfig() {
    const saved = localStorage.getItem('tempConfig');
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            console.warn('Corrupt tempConfig in localStorage, resetting to defaults.');
            localStorage.removeItem('tempConfig');
        }
    }
    return {
        tempDangerMin: 18,
        tempWarningMin: 20,
        tempWarningMax: 26,
        tempDangerMax: 28
    };
}

let tempConfig = loadTempConfig();

// Theme management. Light is the default here (project-specific: this
// dashboard is mostly read in daylight). A stored preference always wins.
let darkMode = localStorage.getItem('darkMode') !== null ? localStorage.getItem('darkMode') === 'true' : false;
let monochromeMode = localStorage.getItem('monochromeMode') === 'true';
let coldCrashMode = localStorage.getItem('coldCrashMode') === 'true';

function applyTheme() {
    const body = document.body;

    if (darkMode) {
        body.classList.add('dark-mode');
    } else {
        body.classList.remove('dark-mode');
    }

    if (monochromeMode) {
        body.classList.add('monochrome-mode');
    } else {
        body.classList.remove('monochrome-mode');
    }

    // Update button states and text
    const darkToggle = document.getElementById('darkModeToggle');
    const coldCrashToggle = document.getElementById('coldCrashToggle');

    if (darkToggle) {
        darkToggle.classList.toggle('active', darkMode);
        // Update button text based on current mode
        const buttonText = darkToggle.querySelector('svg').nextSibling;
        if (buttonText && buttonText.nodeType === Node.TEXT_NODE) {
            buttonText.textContent = darkMode ? '\n            Light Mode\n        ' : '\n            Dark Mode\n        ';
        }
    }
    if (coldCrashToggle) {
        coldCrashToggle.classList.toggle('active', coldCrashMode);
    }

    // Re-render charts with updated colors if they exist
    Object.keys(charts).forEach(deviceId => {
        const device = window.deviceTelemetryData?.[deviceId];
        const select = document.getElementById(`timeRange-${deviceId}`);
        if (device && select) {
            const timeRange = select.value === 'all' ? 'all' : parseInt(select.value);
            createChart(deviceId, device, timeRange);
        }
    });
}

function toggleDarkMode() {
    darkMode = !darkMode;
    localStorage.setItem('darkMode', darkMode);
    applyTheme();
}

function toggleMonochromeMode() {
    monochromeMode = !monochromeMode;
    localStorage.setItem('monochromeMode', monochromeMode);
    applyTheme();
}

function getColdCrashSecret() {
    let secret = localStorage.getItem('coldCrashSecret');
    if (!secret) {
        secret = prompt('Enter the cold crash password:');
        if (!secret) return null;
        localStorage.setItem('coldCrashSecret', secret);
    }
    return secret;
}

async function toggleColdCrashMode() {
    const secret = getColdCrashSecret();
    if (!secret) return;

    coldCrashMode = !coldCrashMode;
    localStorage.setItem('coldCrashMode', coldCrashMode);
    applyTheme();

    // Sync to server so temp-monitor suppresses low-temp Telegram alerts
    try {
        const res = await fetch(`/.netlify/functions/cold-crash?state=${coldCrashMode}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${secret}` }
        });
        if (res.status === 401) {
            // Wrong password — revert and clear stored secret
            coldCrashMode = !coldCrashMode;
            localStorage.setItem('coldCrashMode', coldCrashMode);
            localStorage.removeItem('coldCrashSecret');
            applyTheme();
            alert('Incorrect password. Try again.');
            return;
        }
    } catch {
        // Network error — still allow local toggle, server will catch up
    }

    // Reload data to update temperature warnings
    loadData();
}

// Apply theme on load
applyTheme();

// Rising bubbles. Deliberately sparse and slow: this is ambient texture, not
// a feature. Skipped entirely when the user has asked for reduced motion.
function createBubbles() {
    const bubblesContainer = document.getElementById('bubbles');
    if (!bubblesContainer) return;

    bubblesContainer.innerHTML = '';

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const bubbleCount = 14;

    for (let i = 0; i < bubbleCount; i++) {
        const bubble = document.createElement('div');
        bubble.className = 'bubble';

        const size = Math.random() * 34 + 8;
        bubble.style.width = size + 'px';
        bubble.style.height = size + 'px';

        bubble.style.left = Math.random() * 100 + '%';
        bubble.style.bottom = '-' + (size + 40) + 'px';

        // Gentle horizontal drift on the way up
        const floatX = (Math.random() - 0.5) * 90;
        bubble.style.setProperty('--float-x', floatX + 'px');

        bubble.style.animationDelay = Math.random() * 28 + 's';
        bubble.style.animationDuration = (Math.random() * 22 + 30) + 's';

        bubblesContainer.appendChild(bubble);
    }
}

// Initialize bubbles on load
createBubbles();

// Show status message
function showStatus(message, type = 'loading') {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
}

// Fetch hydrometers data from our API
async function fetchHydrometers() {
    showStatus('Fetching device data...', 'loading');

    try {
        const response = await fetch('/.netlify/functions/hydrometers');

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        // Update temperature config if provided
        if (data.config) {
            tempConfig = data.config;
        }

        // Hide status after successful load
        document.getElementById('status').style.display = 'none';
        return data.devices || data;
    } catch (error) {
        showStatus(`Error fetching data: ${error.message}`, 'error');
        console.error('Fetch error:', error);
        return [];
    }
}

// Format timestamp
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString();
}

// Chart colours for the current theme. Mirrors the tokens in style.css.
function palette() {
    if (monochromeMode) {
        return darkMode ? {
            text: '#EDEDEC', muted: '#A6A6A3', grid: 'rgba(255,255,255,0.06)',
            good: '#A8A8A5', warning: '#C9C9C6', danger: '#EDEDEC',
            temp: '#787875', abv: '#9A9A97', attenuation: '#C9C9C6', velocity: '#6A6A67'
        } : {
            text: '#1F1F1E', muted: '#575756', grid: 'rgba(0,0,0,0.06)',
            good: '#4A4A48', warning: '#6E6E6B', danger: '#1F1F1E',
            temp: '#82827F', abv: '#5E5E5B', attenuation: '#33332F', velocity: '#9C9C99'
        };
    }
    return darkMode ? {
        text: '#EDEAE5', muted: '#A8A29A', grid: 'rgba(255,255,255,0.06)',
        good: '#7FA87A', warning: '#D0A25E', danger: '#D98078',
        temp: '#8A847C', abv: '#79A6B5', attenuation: '#A3B074', velocity: '#D0A25E'
    } : {
        text: '#26231F', muted: '#5C5751', grid: 'rgba(38,35,31,0.07)',
        good: '#4A7A46', warning: '#96652A', danger: '#A34840',
        temp: '#8A847C', abv: '#4E7A8A', attenuation: '#6F7D43', velocity: '#B0763C'
    };
}

// Create chart for a device
function createChart(deviceId, telemetryData, timeRange = 24) {
    const canvasId = `chart-${deviceId}`;
    const canvas = document.getElementById(canvasId);

    if (!canvas) return;

    // Destroy existing chart if it exists
    if (charts[deviceId]) {
        charts[deviceId].destroy();
    }

    const ctx = canvas.getContext('2d');

    // Filter data based on time range
    const now = new Date();
    let recentData;

    if (timeRange === 'all') {
        recentData = telemetryData;
    } else {
        const cutoffTime = new Date(now.getTime() - (timeRange * 60 * 60 * 1000));
        recentData = telemetryData.filter(d => {
            const dataTime = new Date(d.createdOn);
            return dataTime >= cutoffTime;
        });
    }

    // Sort data by time
    const sortedData = [...recentData].sort((a, b) =>
        new Date(a.createdOn) - new Date(b.createdOn)
    );

    // Prepare data with better time formatting
    const labels = sortedData.map(d => {
        const date = new Date(d.createdOn);
        return date.toLocaleTimeString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    });
    const temperatures = sortedData.map(d => d.temperature);
    const abv = sortedData.map(d => d.abv);
    const attenuation = sortedData.map(d => d.attenuation);
    // Cap gravity velocity to a sane range — the RAPT API occasionally returns extreme
    // outlier values (e.g. -200,000 ppd) which blow up the chart scale. Normal active
    // fermentation is typically 0 to -30 ppd. Anything beyond ±100 is instrument noise.
    const VELOCITY_MAX = 100;
    const gravityVelocity = sortedData.map(d => {
        const v = d.gravityVelocity;
        if (v == null) return null;
        return Math.abs(v) > VELOCITY_MAX ? null : v;
    });

    // Chart palette. Kept in step with the CSS tokens in style.css: muted,
    // earthy, one colour per series. The temperature line stays neutral on
    // purpose so its status-coloured points are the thing you read.
    const p = palette();

    // Temperature points carry the status colour. In cold crash mode low
    // temperatures are expected, so they are not flagged.
    const tempColors = sortedData.map(d => {
        const temp = d.temperature;
        const isLowTemp = temp < tempConfig.tempDangerMin;
        const isHighTemp = temp > tempConfig.tempDangerMax;

        if ((isLowTemp && !coldCrashMode) || isHighTemp) {
            return p.danger;
        } else if ((temp >= tempConfig.tempDangerMin && temp < tempConfig.tempWarningMin) || (temp > tempConfig.tempWarningMax && temp <= tempConfig.tempDangerMax)) {
            return p.warning;
        }
        return p.good;
    });

    charts[deviceId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Temperature (°C)',
                    data: temperatures,
                    borderColor: p.temp,
                    backgroundColor: 'transparent',
                    yAxisID: 'y',
                    tension: 0.3,
                    pointBackgroundColor: tempColors,
                    pointBorderColor: tempColors,
                    pointRadius: 2.5,
                    borderWidth: 1.5
                },
                {
                    label: 'ABV (%)',
                    data: abv,
                    borderColor: p.abv,
                    backgroundColor: 'transparent',
                    yAxisID: 'y1',
                    tension: 0.3,
                    pointRadius: 0,
                    borderWidth: 1.5
                },
                {
                    label: 'Attenuation (%)',
                    data: attenuation,
                    borderColor: p.attenuation,
                    backgroundColor: 'transparent',
                    yAxisID: 'y2',
                    tension: 0.3,
                    pointRadius: 0,
                    borderWidth: 1.5
                },
                {
                    label: 'Gravity Velocity (ppd)',
                    data: gravityVelocity,
                    borderColor: p.velocity,
                    backgroundColor: 'transparent',
                    yAxisID: 'y3',
                    tension: 0.3,
                    pointRadius: 0,
                    borderWidth: 1.5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    position: 'top',
                    align: 'start',
                    labels: {
                        color: p.muted,
                        font: { size: 11 },
                        boxWidth: 10,
                        boxHeight: 2,
                        padding: 16,
                        usePointStyle: false
                    }
                },
                title: {
                    display: true,
                    align: 'start',
                    text: `${sortedData.length} readings`,
                    color: p.muted,
                    font: { size: 11, weight: '400' },
                    padding: { top: 0, bottom: 12 }
                },
                tooltip: {
                    backgroundColor: p.text,
                    titleColor: darkMode ? '#141312' : '#FBFAF8',
                    bodyColor: darkMode ? '#141312' : '#FBFAF8',
                    borderWidth: 0,
                    cornerRadius: 6,
                    padding: 10,
                    titleFont: { size: 11, weight: '500' },
                    bodyFont: { size: 11 }
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    ticks: { color: p.muted, font: { size: 10 } },
                    border: { display: false },
                    grid: { color: p.grid }
                },
                // The three right-hand axes drop their titles and colour their
                // ticks to match their series instead. Three stacked rotated
                // titles was most of the chart's clutter, and the legend
                // already names every series.
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    ticks: { color: p.abv, font: { size: 10 } },
                    border: { display: false },
                    grid: { drawOnChartArea: false }
                },
                y2: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    ticks: { color: p.attenuation, font: { size: 10 } },
                    border: { display: false },
                    grid: { drawOnChartArea: false },
                    offset: true
                },
                y3: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    ticks: { color: p.velocity, font: { size: 10 } },
                    border: { display: false },
                    grid: { drawOnChartArea: false },
                    offset: true
                },
                x: {
                    ticks: {
                        color: p.muted,
                        font: { size: 10 },
                        maxRotation: 0,
                        autoSkipPadding: 24
                    },
                    border: { display: false },
                    grid: { color: p.grid }
                }
            }
        }
    });
}

// Escape HTML to prevent XSS when injecting API strings into innerHTML
function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Store device telemetry data globally for theme switching
window.deviceTelemetryData = {};

// Display devices
function displayDevices(hydrometers) {
    const devicesContainer = document.getElementById('devices');
    devicesContainer.innerHTML = '';

    if (hydrometers.length === 0) {
        devicesContainer.innerHTML = '<div class="card">No devices found</div>';
        return;
    }

    // Store telemetry data
    hydrometers.forEach(device => {
        if (device.telemetry && device.telemetry.length > 0) {
            window.deviceTelemetryData[device.id] = device.telemetry;
        }
    });

    hydrometers.forEach(device => {
        // Get the most recent telemetry data
        const latestData = device.telemetry && device.telemetry.length > 0
            ? device.telemetry.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn))[0]
            : null;

        // Check for low battery (< 20%)
        const lowBattery = latestData && latestData.battery < 20;
        const batteryWarning = lowBattery
            ? `<div class="alert alert-warning mb-4">Battery at ${latestData.battery.toFixed(0)}%. Charge it soon.</div>`
            : '';

        // Check for temperature warnings (ignore low temps in cold crash mode)
        const highTemp = latestData && latestData.temperature > tempConfig.tempDangerMax;
        const lowTemp = latestData && latestData.temperature < tempConfig.tempDangerMin && !coldCrashMode;
        const tempWarning = highTemp
            ? `<div class="alert alert-danger mb-4">Running hot at ${latestData.temperature.toFixed(1)}°C, above your ${tempConfig.tempDangerMax}°C limit.</div>`
            : lowTemp
            ? `<div class="alert alert-danger mb-4">Running cold at ${latestData.temperature.toFixed(1)}°C, below your ${tempConfig.tempDangerMin}°C limit.</div>`
            : '';

        // Determine temperature color class (ignore low temps in cold crash mode)
        let tempClass = 'info-card';
        if (latestData) {
            const temp = latestData.temperature;
            const isLowDanger = temp < tempConfig.tempDangerMin && !coldCrashMode;
            const isHighDanger = temp > tempConfig.tempDangerMax;

            if (isLowDanger || isHighDanger) {
                tempClass = 'info-card temp-danger';
            } else if ((temp >= tempConfig.tempDangerMin && temp < tempConfig.tempWarningMin) || (temp > tempConfig.tempWarningMax && temp <= tempConfig.tempDangerMax)) {
                tempClass = 'info-card temp-warning';
            } else if (temp >= tempConfig.tempWarningMin && temp <= tempConfig.tempWarningMax) {
                tempClass = 'info-card temp-good';
            } else if (coldCrashMode && temp < tempConfig.tempDangerMin) {
                // In cold crash mode, low temps are okay (show as good)
                tempClass = 'info-card temp-good';
            }
        }

        const displayName = escapeHtml(device.name || 'Unnamed Device');
        const displayId = escapeHtml(device.id);
        const displayFirmware = escapeHtml(device.firmwareVersion || 'Unknown');
        const displayProfile = device.profileName ? escapeHtml(device.profileName) : null;

        // Brew session stats
        const ogSG   = device.og     ? device.og / 1000     : null;
        const tFGSG  = device.targetFG ? device.targetFG / 1000 : null;
        const curSG  = latestData ? latestData.gravity / 1000 : null;

        // Brew day — "Day N" since session pitch
        let brewDay = null;
        if (device.sessionStartDate) {
            const msElapsed = Date.now() - new Date(device.sessionStartDate).getTime();
            brewDay = Math.floor(msElapsed / 86400000) + 1;
        }

        // Estimated final ABV from target FG
        const estFinalABV = (ogSG && tFGSG) ? Math.max(0, (ogSG - tFGSG) * 131.25) : null;

        // Fermentation progress % (OG → targetFG)
        let progressPct = null;
        if (ogSG && tFGSG && curSG && ogSG > tFGSG) {
            progressPct = Math.min(100, Math.max(0, ((ogSG - curSG) / (ogSG - tFGSG)) * 100));
        }

        // ETA to target FG using gravity velocity (ppd in RAPT units)
        let etaDays = null;
        if (tFGSG && curSG && latestData && latestData.gravityVelocity != null) {
            const vel = latestData.gravityVelocity; // RAPT units/day (negative = dropping)
            const pointsRemaining = latestData.gravity - device.targetFG;
            if (vel < 0 && pointsRemaining > 0 && Math.abs(vel) <= 100) {
                etaDays = Math.ceil(pointsRemaining / Math.abs(vel));
            }
        }

        // Progress bar HTML
        const progressBar = (progressPct !== null) ? `
            <div class="ferment-progress-wrap">
                <div class="ferment-progress-labels">
                    <span>OG ${ogSG.toFixed(3)}</span>
                    <span class="ferment-label-center">${progressPct.toFixed(0)}% fermented</span>
                    <span>Target ${tFGSG.toFixed(3)}</span>
                </div>
                <div class="ferment-progress-bar">
                    <div class="ferment-progress-fill" style="width: ${progressPct.toFixed(1)}%"></div>
                </div>
            </div>` : '';

        // Session stat tiles (brew day, est. final ABV, ETA). Same tile shape as
        // the main row so the two rows line up rather than floating centred.
        const extraCards = [
            brewDay !== null ? `
                <div class="info-card" data-tooltip="Days since fermentation started">
                    <div class="info-card-label mb-1">Brew Day</div>
                    <div class="info-card-value">Day ${brewDay}</div>
                </div>` : '',
            estFinalABV !== null ? `
                <div class="info-card" data-tooltip="Estimated ABV when gravity hits your target FG">
                    <div class="info-card-label mb-1">Est. Final ABV</div>
                    <div class="info-card-value">${estFinalABV.toFixed(2)}%</div>
                </div>` : '',
            etaDays !== null ? `
                <div class="info-card" data-tooltip="Estimated days to reach target FG based on the current drop rate">
                    <div class="info-card-label mb-1">ETA to FG</div>
                    <div class="info-card-value">${etaDays}d</div>
                </div>` : '',
        ].join('');

        const deviceCard = document.createElement('div');
        deviceCard.className = 'card';
        deviceCard.innerHTML = `
            ${batteryWarning}
            ${tempWarning}
            <div class="device-card-header flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-5 pb-4">
                <div>
                    <h2 class="device-name text-lg">${displayName}</h2>
                    <div class="device-meta text-xs mt-0.5">
                        Firmware ${displayFirmware}
                        ${device.isLatestFirmware === false ? '<span class="firmware-update">update available</span>' : ''}
                        ${displayProfile ? `<span class="device-meta-sep">/</span> ${displayProfile}` : ''}
                    </div>
                </div>
                <div class="text-xs text-left sm:text-right">
                    ${latestData ? `<div class="device-stats">${latestData.battery?.toFixed(0) ?? 'N/A'}% battery <span class="device-meta-sep">/</span> ${latestData.rssi ?? 'N/A'} dBm <span class="device-meta-sep">/</span> ${formatTime(device.lastActivityTime)}</div>` : ''}
                    <div class="device-id font-mono mt-0.5">${displayId}</div>
                </div>
            </div>

            ${latestData ? `
                <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
                    <div class="${tempClass}" data-tooltip="Current fermentation temperature">
                        <div class="info-card-label mb-1">Temperature</div>
                        <div class="info-card-value">${latestData.temperature?.toFixed(1) || 'N/A'}°C</div>
                    </div>
                    <div class="info-card" data-tooltip="Current specific gravity, the sugar still left in there">
                        <div class="info-card-label mb-1">Gravity</div>
                        <div class="info-card-value">${curSG ? curSG.toFixed(3) : 'N/A'}</div>
                    </div>
                    ${tFGSG !== null ? `
                    <div class="info-card" data-tooltip="Target final gravity set in your RAPT profile">
                        <div class="info-card-label mb-1">Target FG</div>
                        <div class="info-card-value">${tFGSG.toFixed(3)}</div>
                    </div>` : ''}
                    <div class="info-card" data-tooltip="Alcohol by volume, calculated from OG and current gravity">
                        <div class="info-card-label mb-1">ABV</div>
                        <div class="info-card-value">${latestData.abv?.toFixed(2) || 'N/A'}%</div>
                    </div>
                    <div class="info-card" data-tooltip="How much of the available sugar has been eaten">
                        <div class="info-card-label mb-1">Attenuation</div>
                        <div class="info-card-value">${latestData.attenuation?.toFixed(1) || 'N/A'}%</div>
                    </div>
                    ${extraCards}
                </div>

                ${progressBar}

                <div class="hidden md:block">
                    <div class="mb-4">
                        <label for="timeRange-${device.id}" class="block time-range-label mb-1.5">Time range</label>
                        <select id="timeRange-${device.id}" class="time-range-select">
                            <option value="3">Last 3 Hours</option>
                            <option value="6" selected>Last 6 Hours</option>
                            <option value="12">Last 12 Hours</option>
                            <option value="18">Last 18 Hours</option>
                            <option value="24">Last 24 Hours</option>
                            <option value="36">Last 36 Hours</option>
                            <option value="all">All Time</option>
                        </select>
                    </div>
                    <div class="relative h-96 mt-6">
                        <canvas id="chart-${device.id}"></canvas>
                    </div>
                </div>
            ` : '<p class="device-meta text-center py-8">No telemetry data available</p>'}
        `;

        devicesContainer.appendChild(deviceCard);

        // Create chart if we have telemetry data
        if (device.telemetry && device.telemetry.length > 0) {
            setTimeout(() => {
                createChart(device.id, device.telemetry, 6);

                // Add event listener for time range change
                const timeRangeSelect = document.getElementById(`timeRange-${device.id}`);
                if (timeRangeSelect) {
                    timeRangeSelect.addEventListener('change', (e) => {
                        const selectedRange = e.target.value === 'all' ? 'all' : parseInt(e.target.value);
                        createChart(device.id, device.telemetry, selectedRange);
                    });
                }
            }, 100);
        }
    });
}

// Main load function
async function loadData() {
    const refreshBtn = document.getElementById('refreshBtn');
    refreshBtn.disabled = true;

    const hydrometers = await fetchHydrometers();
    displayDevices(hydrometers);

    refreshBtn.disabled = false;
}

// Refresh button handler
document.getElementById('refreshBtn').addEventListener('click', loadData);

// Theme toggle handlers
document.getElementById('coldCrashToggle').addEventListener('click', toggleColdCrashMode);
document.getElementById('darkModeToggle').addEventListener('click', toggleDarkMode);

// Settings modal handlers
const modal = document.getElementById('settingsModal');
const settingsBtn = document.getElementById('settingsToggle');
const closeBtn = document.getElementById('closeModal');
const saveBtn = document.getElementById('saveSettings');
const resetBtn = document.getElementById('resetSettings');

function openSettings() {
    // Load current values into inputs
    document.getElementById('tempDangerMin').value = tempConfig.tempDangerMin;
    document.getElementById('tempWarningMin').value = tempConfig.tempWarningMin;
    document.getElementById('tempWarningMax').value = tempConfig.tempWarningMax;
    document.getElementById('tempDangerMax').value = tempConfig.tempDangerMax;

    modal.classList.add('active');
}

function closeSettings() {
    modal.classList.remove('active');
}

function saveSettings() {
    const newConfig = {
        tempDangerMin: parseFloat(document.getElementById('tempDangerMin').value) || 18,
        tempWarningMin: parseFloat(document.getElementById('tempWarningMin').value) || 20,
        tempWarningMax: parseFloat(document.getElementById('tempWarningMax').value) || 26,
        tempDangerMax: parseFloat(document.getElementById('tempDangerMax').value) || 28
    };

    tempConfig = newConfig;
    localStorage.setItem('tempConfig', JSON.stringify(newConfig));

    closeSettings();
    loadData(); // Reload to apply new settings
}

function resetSettings() {
    const defaults = {
        tempDangerMin: 18,
        tempWarningMin: 20,
        tempWarningMax: 26,
        tempDangerMax: 28
    };

    document.getElementById('tempDangerMin').value = defaults.tempDangerMin;
    document.getElementById('tempWarningMin').value = defaults.tempWarningMin;
    document.getElementById('tempWarningMax').value = defaults.tempWarningMax;
    document.getElementById('tempDangerMax').value = defaults.tempDangerMax;
}

settingsBtn.addEventListener('click', openSettings);
closeBtn.addEventListener('click', closeSettings);
saveBtn.addEventListener('click', saveSettings);
resetBtn.addEventListener('click', resetSettings);

// Close modal when clicking outside
modal.addEventListener('click', (e) => {
    if (e.target === modal) {
        closeSettings();
    }
});

// Load data on page load, then auto-refresh every 15 minutes
loadData();
setInterval(loadData, 15 * 60 * 1000);

// Sync cold crash state on load.
// If the user has never explicitly set cold crash (no localStorage key), treat as false
// and push that to the server to clear any stale Blobs state.
// If they have set it locally, trust localStorage and sync server to match.
fetch('/.netlify/functions/cold-crash')
    .then(r => r.json())
    .then(({ coldCrash }) => {
        const hasLocalState = localStorage.getItem('coldCrashMode') !== null;
        if (!hasLocalState) {
            // No local preference — force off and clear server state if needed
            if (coldCrash) {
                const secret = localStorage.getItem('coldCrashSecret');
                if (secret) {
                    fetch('/.netlify/functions/cold-crash?state=false', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${secret}` }
                    }).catch(() => {});
                }
            }
            coldCrashMode = false;
            applyTheme();
        } else if (coldCrash !== coldCrashMode) {
            // Has local state — push it to server
            const secret = localStorage.getItem('coldCrashSecret');
            if (secret) {
                fetch(`/.netlify/functions/cold-crash?state=${coldCrashMode}`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${secret}` }
                }).catch(() => {});
            }
        }
    })
    .catch(() => {});

