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

// Theme management — dark is the default; only override if user has explicitly set a preference
let darkMode = localStorage.getItem('darkMode') !== null ? localStorage.getItem('darkMode') === 'true' : true;
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

// Create floating bubbles
function createBubbles() {
    const bubblesContainer = document.getElementById('bubbles');
    const bubbleCount = 60;

    // Clear existing bubbles
    bubblesContainer.innerHTML = '';

    for (let i = 0; i < bubbleCount; i++) {
        const bubble = document.createElement('div');
        bubble.className = 'bubble';

        // Random size between 20px and 120px
        const size = Math.random() * 100 + 20;
        bubble.style.width = size + 'px';
        bubble.style.height = size + 'px';

        // Random starting position
        bubble.style.left = Math.random() * 100 + '%';
        bubble.style.bottom = '-' + (size + 50) + 'px';

        // Random horizontal movement during float
        const floatX = (Math.random() - 0.5) * 200;
        bubble.style.setProperty('--float-x', floatX + 'px');

        // Random animation delay and duration
        bubble.style.animationDelay = Math.random() * 15 + 's';
        bubble.style.animationDuration = (Math.random() * 15 + 15) + 's';

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

    // Create dynamic colors for attenuation based on completion (pink -> purple)
    const attenuationColors = sortedData.map(d => {
        const att = d.attenuation || 0;
        if (monochromeMode) {
            // In monochrome, go from light gray to dark gray
            const grayValue = darkMode ?
                Math.floor(212 - (att / 100) * 100) : // 212 -> 112
                Math.floor(64 + (att / 100) * 100);   // 64 -> 164
            return `rgb(${grayValue}, ${grayValue}, ${grayValue})`;
        } else {
            // Interpolate from pink (236, 72, 153) to purple (167, 139, 250)
            const progress = Math.min(att / 100, 1);
            const r = Math.floor(236 - (236 - 167) * progress);
            const g = Math.floor(72 + (139 - 72) * progress);
            const b = Math.floor(153 + (250 - 153) * progress);
            return `rgb(${r}, ${g}, ${b})`;
        }
    });

    // Create dynamic colors for temperature based on value and theme
    const tempColors = sortedData.map(d => {
        const temp = d.temperature;
        // In cold crash mode, ignore low temperatures (treat them as good)
        const isLowTemp = temp < tempConfig.tempDangerMin;
        const isHighTemp = temp > tempConfig.tempDangerMax;

        if (monochromeMode) {
            if ((isLowTemp && !coldCrashMode) || isHighTemp) {
                return darkMode ? 'rgb(212, 212, 212)' : 'rgb(82, 82, 82)'; // danger
            } else if ((temp >= tempConfig.tempDangerMin && temp < tempConfig.tempWarningMin) || (temp > tempConfig.tempWarningMax && temp <= tempConfig.tempDangerMax)) {
                return darkMode ? 'rgb(163, 163, 163)' : 'rgb(115, 115, 115)'; // warning
            } else {
                return darkMode ? 'rgb(115, 115, 115)' : 'rgb(64, 64, 64)'; // good
            }
        } else {
            if ((isLowTemp && !coldCrashMode) || isHighTemp) {
                return 'rgb(239, 68, 68)'; // red-500
            } else if ((temp >= tempConfig.tempDangerMin && temp < tempConfig.tempWarningMin) || (temp > tempConfig.tempWarningMax && temp <= tempConfig.tempDangerMax)) {
                return 'rgb(249, 115, 22)'; // orange-500
            } else {
                return 'rgb(34, 197, 94)'; // green-500
            }
        }
    });

    charts[deviceId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Temperature (°C)',
                    data: temperatures,
                    borderColor: monochromeMode ? (darkMode ? 'rgb(163, 163, 163)' : 'rgb(115, 115, 115)') : 'rgb(34, 197, 94)',
                    backgroundColor: monochromeMode ? (darkMode ? 'rgba(163, 163, 163, 0.1)' : 'rgba(115, 115, 115, 0.1)') : 'rgba(34, 197, 94, 0.1)',
                    yAxisID: 'y',
                    tension: 0.4,
                    pointBackgroundColor: tempColors,
                    pointBorderColor: tempColors,
                    pointRadius: 4,
                    borderWidth: 3
                },
                {
                    label: 'ABV (%)',
                    data: abv,
                    borderColor: monochromeMode ? (darkMode ? 'rgb(163, 163, 163)' : 'rgb(115, 115, 115)') : 'rgb(59, 130, 246)',
                    backgroundColor: monochromeMode ? (darkMode ? 'rgba(163, 163, 163, 0.1)' : 'rgba(115, 115, 115, 0.1)') : 'rgba(59, 130, 246, 0.1)',
                    yAxisID: 'y1',
                    tension: 0.4,
                    borderWidth: 3
                },
                {
                    label: 'Attenuation (%)',
                    data: attenuation,
                    borderColor: function(context) {
                        const index = context.dataIndex;
                        return attenuationColors[index];
                    },
                    segment: {
                        borderColor: function(context) {
                            return attenuationColors[context.p0DataIndex];
                        }
                    },
                    backgroundColor: monochromeMode ? (darkMode ? 'rgba(212, 212, 212, 0.1)' : 'rgba(64, 64, 64, 0.1)') : 'rgba(236, 72, 153, 0.1)',
                    yAxisID: 'y2',
                    tension: 0.4,
                    pointBackgroundColor: attenuationColors,
                    pointBorderColor: attenuationColors,
                    pointRadius: 4,
                    borderWidth: 3
                },
                {
                    label: 'Gravity Velocity (ppd)',
                    data: gravityVelocity,
                    borderColor: monochromeMode ? (darkMode ? 'rgb(212, 212, 212)' : 'rgb(82, 82, 82)') : 'rgb(234, 179, 8)',
                    backgroundColor: monochromeMode ? (darkMode ? 'rgba(212, 212, 212, 0.1)' : 'rgba(82, 82, 82, 0.1)') : 'rgba(234, 179, 8, 0.1)',
                    yAxisID: 'y3',
                    tension: 0.4,
                    pointRadius: 3,
                    borderWidth: 2
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
                    labels: {
                        color: darkMode ? 'rgb(203, 213, 225)' : '#222222',
                        font: {
                            size: 14,
                            weight: '600'
                        },
                        padding: 20
                    }
                },
                title: {
                    display: true,
                    text: `Fermentation Metrics - ${timeRange === 'all' ? 'All Time' : `Last ${timeRange} Hours`} (${sortedData.length} readings)`,
                    color: darkMode ? 'rgb(248, 250, 252)' : '#222222',
                    font: {
                        size: 16,
                        weight: '700'
                    },
                    padding: 20
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    ticks: { color: darkMode ? 'rgb(148, 163, 184)' : '#595959' },
                    title: {
                        display: true,
                        text: 'Temperature (°C)',
                        color: darkMode ? 'rgb(203, 213, 225)' : '#595959',
                        font: {
                            size: 14,
                            weight: '600'
                        }
                    },
                    grid: {
                        color: darkMode ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.06)'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    ticks: { color: darkMode ? 'rgb(148, 163, 184)' : '#595959' },
                    title: {
                        display: true,
                        text: 'ABV (%)',
                        color: darkMode ? 'rgb(203, 213, 225)' : '#595959',
                        font: {
                            size: 14,
                            weight: '600'
                        }
                    },
                    grid: {
                        drawOnChartArea: false,
                    }
                },
                y2: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    ticks: { color: darkMode ? 'rgb(148, 163, 184)' : '#595959' },
                    title: {
                        display: true,
                        text: 'Attenuation (%)',
                        color: darkMode ? 'rgb(203, 213, 225)' : '#595959',
                        font: {
                            size: 14,
                            weight: '600'
                        }
                    },
                    grid: {
                        drawOnChartArea: false,
                    },
                    offset: true
                },
                y3: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    ticks: { color: darkMode ? 'rgb(148, 163, 184)' : '#595959' },
                    title: {
                        display: true,
                        text: 'Gravity Velocity (ppd)',
                        color: darkMode ? 'rgb(203, 213, 225)' : '#595959',
                        font: {
                            size: 14,
                            weight: '600'
                        }
                    },
                    grid: {
                        drawOnChartArea: false,
                    },
                    offset: true
                },
                x: {
                    ticks: { color: darkMode ? 'rgb(148, 163, 184)' : '#595959' },
                    grid: {
                        color: darkMode ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.06)'
                    }
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
            ? `<div class="alert alert-warning mb-4">Low Battery Warning: ${latestData.battery.toFixed(0)}% — Please charge soon</div>`
            : '';

        // Check for temperature warnings (ignore low temps in cold crash mode)
        const highTemp = latestData && latestData.temperature > tempConfig.tempDangerMax;
        const lowTemp = latestData && latestData.temperature < tempConfig.tempDangerMin && !coldCrashMode;
        const tempWarning = highTemp
            ? `<div class="alert alert-danger mb-4">High Temperature Warning: ${latestData.temperature.toFixed(1)}°C — Temperature exceeds ${tempConfig.tempDangerMax}°C</div>`
            : lowTemp
            ? `<div class="alert alert-danger mb-4">Low Temperature Warning: ${latestData.temperature.toFixed(1)}°C — Temperature below ${tempConfig.tempDangerMin}°C</div>`
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

        // Extra stat cards (brew day, target FG, est. final ABV, ETA)
        const extraCards = [
            brewDay !== null ? `
                <div class="info-card" style="min-width:140px;flex:1;max-width:220px">
                    <div class="info-card-label mb-1 text-xs">Brew Day</div>
                    <div class="info-card-value text-2xl">Day ${brewDay}</div>
                </div>` : '',
            estFinalABV !== null ? `
                <div class="info-card" style="min-width:140px;flex:1;max-width:220px">
                    <div class="info-card-label mb-1 text-xs">Est. Final ABV</div>
                    <div class="info-card-value text-2xl">${estFinalABV.toFixed(2)}%</div>
                </div>` : '',
            etaDays !== null ? `
                <div class="info-card" style="min-width:140px;flex:1;max-width:220px">
                    <div class="info-card-label mb-1 text-xs">ETA to FG</div>
                    <div class="info-card-value text-2xl">${etaDays}d</div>
                </div>` : '',
        ].join('');

        const deviceCard = document.createElement('div');
        deviceCard.className = 'card';
        deviceCard.innerHTML = `
            ${batteryWarning}
            ${tempWarning}
            <div class="device-card-header flex justify-between items-center mb-6 pb-6">
                <div>
                    <h2 class="device-name text-3xl font-bold">
                        ${displayName}
                    </h2>
                    <div class="device-meta text-sm mt-1">
                        Firmware: ${displayFirmware}
                        ${device.isLatestFirmware === false ? '<span class="firmware-update">Update Available</span>' : ''}
                        ${displayProfile ? `<span class="device-meta-sep">|</span> Current profile: ${displayProfile}` : ''}
                    </div>
                </div>
                <div class="text-right">
                    <div class="device-id font-mono text-sm">ID: ${displayId}</div>
                    ${latestData ? `<div class="device-stats text-xs mt-1">Battery: ${latestData.battery?.toFixed(0) || 'N/A'}% | Signal: ${latestData.rssi || 'N/A'} dBm | ${formatTime(device.lastActivityTime)}</div>` : ''}
                </div>
            </div>

            ${latestData ? `
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-3">
                    <div class="${tempClass}">
                        <div class="info-card-label mb-1 text-xs">Temperature</div>
                        <div class="info-card-value text-2xl">${latestData.temperature?.toFixed(1) || 'N/A'}°C</div>
                    </div>
                    <div class="info-card">
                        <div class="info-card-label mb-1 text-xs">Gravity</div>
                        <div class="info-card-value text-xl">${curSG ? curSG.toFixed(3) : 'N/A'}</div>
                    </div>
                    ${tFGSG !== null ? `
                    <div class="info-card">
                        <div class="info-card-label mb-1 text-xs">Target FG</div>
                        <div class="info-card-value text-xl">${tFGSG.toFixed(3)}</div>
                    </div>` : ''}
                    <div class="info-card">
                        <div class="info-card-label mb-1 text-xs">ABV</div>
                        <div class="info-card-value text-2xl">${latestData.abv?.toFixed(2) || 'N/A'}%</div>
                    </div>
                    <div class="info-card">
                        <div class="info-card-label mb-1 text-xs">Attenuation</div>
                        <div class="info-card-value text-2xl">${latestData.attenuation?.toFixed(1) || 'N/A'}%</div>
                    </div>
                </div>

                ${extraCards ? `<div class="flex flex-wrap justify-center gap-3 mb-6">${extraCards}</div>` : '<div class="mb-6"></div>'}

                ${progressBar}

                <div class="hidden md:block">
                    <div class="mb-4">
                        <label for="timeRange-${device.id}" class="block text-sm font-medium time-range-label mb-2">Time Range:</label>
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

// Load data on page load
loadData();

// Sync cold crash state from server on load (authoritative — overrides stale localStorage)
fetch('/.netlify/functions/cold-crash')
    .then(r => r.json())
    .then(({ coldCrash }) => {
        if (coldCrash !== coldCrashMode) {
            coldCrashMode = coldCrash;
            localStorage.setItem('coldCrashMode', coldCrashMode);
            applyTheme();
        }
    })
    .catch(() => {});

