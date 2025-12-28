import './style.css'
import Chart from 'chart.js/auto'

let charts = {};

// Theme management
let darkMode = localStorage.getItem('darkMode') === 'true';
let monochromeMode = localStorage.getItem('monochromeMode') === 'true';

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

    // Update button states
    const darkToggle = document.getElementById('darkModeToggle');
    const monoToggle = document.getElementById('monochromeToggle');

    if (darkToggle) {
        darkToggle.classList.toggle('active', darkMode);
    }
    if (monoToggle) {
        monoToggle.classList.toggle('active', monochromeMode);
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

        // Hide status after successful load
        document.getElementById('status').style.display = 'none';
        return data;
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
        if (monochromeMode) {
            if (temp < 18 || temp > 28) {
                return darkMode ? 'rgb(212, 212, 212)' : 'rgb(82, 82, 82)'; // danger
            } else if ((temp >= 18 && temp < 20) || (temp > 26 && temp <= 28)) {
                return darkMode ? 'rgb(163, 163, 163)' : 'rgb(115, 115, 115)'; // warning
            } else {
                return darkMode ? 'rgb(115, 115, 115)' : 'rgb(64, 64, 64)'; // good
            }
        } else {
            if (temp < 18 || temp > 28) {
                return 'rgb(239, 68, 68)'; // red-500
            } else if ((temp >= 18 && temp < 20) || (temp > 26 && temp <= 28)) {
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
                    borderColor: function(context) {
                        const index = context.dataIndex;
                        return tempColors[index];
                    },
                    segment: {
                        borderColor: function(context) {
                            return tempColors[context.p0DataIndex];
                        }
                    },
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
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
                    title: {
                        display: true,
                        text: 'Temperature (°C)',
                        font: {
                            size: 14,
                            weight: '600'
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'ABV (%)',
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
                    title: {
                        display: true,
                        text: 'Attenuation (%)',
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
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                }
            }
        }
    });
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
        console.log('Processing device:', device.name, 'Telemetry count:', device.telemetry?.length);

        // Get the most recent telemetry data
        const latestData = device.telemetry && device.telemetry.length > 0
            ? device.telemetry.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn))[0]
            : null;

        console.log('Latest data:', latestData);

        // Check for low battery (< 20%)
        const lowBattery = latestData && latestData.battery < 20;
        const batteryWarning = lowBattery
            ? `<div class="alert alert-warning mb-4">⚠️ Low Battery Warning: ${latestData.battery.toFixed(0)}% - Please charge soon!</div>`
            : '';

        // Check for high temperature
        const highTemp = latestData && latestData.temperature > 28;
        const tempWarning = highTemp
            ? `<div class="alert alert-danger mb-4">🌡️ High Temperature Warning: ${latestData.temperature.toFixed(1)}°C - Temperature exceeds 28°C!</div>`
            : '';

        // Determine temperature color class
        let tempClass = 'info-card';
        if (latestData) {
            const temp = latestData.temperature;
            if (temp < 18 || temp > 28) {
                tempClass = 'info-card temp-danger';
            } else if ((temp >= 18 && temp < 20) || (temp > 26 && temp <= 28)) {
                tempClass = 'info-card temp-warning';
            } else if (temp >= 20 && temp <= 26) {
                tempClass = 'info-card temp-good';
            }
        }

        const displayName = device.name || 'Unnamed Device';

        const deviceCard = document.createElement('div');
        deviceCard.className = 'card';
        deviceCard.innerHTML = `
            ${batteryWarning}
            ${tempWarning}
            <div class="flex justify-between items-center mb-6 pb-6 border-b-2 border-slate-100">
                <h2 class="text-3xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
                    ${displayName}
                </h2>
                <div class="text-slate-500 font-mono text-sm">ID: ${device.id}</div>
            </div>

            ${latestData ? `
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
                    <div class="${tempClass}">
                        <div class="info-card-label mb-2">Temperature</div>
                        <div class="info-card-value">${latestData.temperature?.toFixed(1) || 'N/A'}°C</div>
                    </div>
                    <div class="info-card">
                        <div class="info-card-label mb-2">ABV</div>
                        <div class="info-card-value">${latestData.abv?.toFixed(2) || 'N/A'}%</div>
                    </div>
                    <div class="info-card">
                        <div class="info-card-label mb-2">Gravity</div>
                        <div class="info-card-value text-2xl">${latestData.gravity?.toFixed(3) || 'N/A'}</div>
                    </div>
                    <div class="info-card">
                        <div class="info-card-label mb-2">Attenuation</div>
                        <div class="info-card-value">${latestData.attenuation?.toFixed(1) || 'N/A'}%</div>
                    </div>
                    <div class="info-card col-span-2 md:col-span-1">
                        <div class="info-card-label mb-2">Last Activity</div>
                        <div class="info-card-value text-xl">${formatTime(latestData.createdOn)}</div>
                    </div>
                </div>

                <div class="mb-4">
                    <label for="timeRange-${device.id}" class="block text-sm font-medium text-slate-700 mb-2">Time Range:</label>
                    <select id="timeRange-${device.id}" class="w-full md:w-64 px-4 py-2 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-purple-500 bg-white font-medium">
                        <option value="6">Last 6 Hours</option>
                        <option value="12">Last 12 Hours</option>
                        <option value="18">Last 18 Hours</option>
                        <option value="24" selected>Last 24 Hours</option>
                        <option value="36">Last 36 Hours</option>
                        <option value="all">All Time</option>
                    </select>
                </div>
                <div class="relative h-96 mt-6">
                    <canvas id="chart-${device.id}"></canvas>
                </div>
            ` : '<p class="text-slate-500 text-center py-8">No telemetry data available</p>'}
        `;

        devicesContainer.appendChild(deviceCard);

        // Create chart if we have telemetry data
        if (device.telemetry && device.telemetry.length > 0) {
            setTimeout(() => {
                createChart(device.id, device.telemetry, 24);

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
document.getElementById('darkModeToggle').addEventListener('click', toggleDarkMode);
document.getElementById('monochromeToggle').addEventListener('click', toggleMonochromeMode);

// Load data on page load
loadData();
