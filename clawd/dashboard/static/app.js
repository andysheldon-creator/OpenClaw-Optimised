/* ===========================================
   LIAM'S DASHBOARD - CLIENT JAVASCRIPT
   Real-time updates, ECharts, keyboard shortcuts
   =========================================== */

// === CONFIGURATION ===
const REFRESH_INTERVAL = 5000; // 5 seconds
const CHART_HISTORY = 60; // 60 data points

// === STATE ===
let currentFilter = 'all';
let chatVisible = false;
let cpuChart = null;
let memChart = null;

// === INITIALIZATION ===
document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    fetchData();
    fetchChartData();
    setupFilterButtons();
    setupKeyboardShortcuts();
    setupChatKeyboard();

    // Auto-refresh
    setInterval(fetchData, REFRESH_INTERVAL);
    setInterval(fetchChartData, REFRESH_INTERVAL);
});

// === DATA FETCHING ===
async function fetchData() {
    try {
        const res = await fetch('/api/data');
        const data = await res.json();
        updateDashboard(data);
    } catch (err) {
        console.error('Failed to fetch data:', err);
    }
}

async function fetchChartData() {
    try {
        const res = await fetch(`/api/metrics/recent?limit=${CHART_HISTORY}`);
        const data = await res.json();
        updateCharts(data);
    } catch (err) {
        console.error('Failed to fetch chart data:', err);
    }
}

// === DASHBOARD UPDATE ===
function updateDashboard(data) {
    // Timestamp
    const ts = new Date(data.timestamp);
    document.getElementById('timestamp').textContent = ts.toLocaleTimeString();

    // Gateway status
    const statusEl = document.getElementById('gateway-status');
    const dot = statusEl.querySelector('.status-dot');
    const text = statusEl.querySelector('.status-text');
    dot.className = `status-dot ${data.gateway.status}`;
    text.textContent = data.gateway.status.toUpperCase();

    // Metrics
    updateMetric('cpu', data.resources.cpu_percent);
    updateMetric('mem', data.resources.mem_percent);
    updateMetric('disk', data.resources.disk_percent);
    document.getElementById('sessions-value').textContent = data.sessions.length;

    // Sessions table
    updateSessionsTable(data.sessions);

    // Subagents tree
    updateSubagentsTree(data.subagents);

    // Queue table
    updateQueueTable(data.queue);
}

function updateMetric(name, value) {
    const valueEl = document.getElementById(`${name}-value`);
    const barEl = document.getElementById(`${name}-bar`);

    valueEl.textContent = `${value}%`;
    barEl.style.width = `${value}%`;

    // Color coding
    barEl.className = 'metric-fill';
    if (value >= 80) barEl.classList.add('high');
    else if (value >= 50) barEl.classList.add('medium');
    else barEl.classList.add('low');
}

// === SESSIONS TABLE ===
function updateSessionsTable(sessions) {
    const tbody = document.querySelector('#sessions-table tbody');

    if (sessions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="empty">No active sessions</td></tr>';
        return;
    }

    tbody.innerHTML = sessions.map(s => `
        <tr>
            <td>${escapeHtml(s.agent)}</td>
            <td>${escapeHtml(s.channel)}</td>
            <td>${escapeHtml(s.updated)}</td>
        </tr>
    `).join('');
}

// === SUBAGENTS TREE ===
function updateSubagentsTree(subagents) {
    const container = document.getElementById('subagents-tree');

    if (subagents.length === 0) {
        container.innerHTML = '<div class="empty">No active subagents</div>';
        return;
    }

    // Build ASCII tree
    const lines = subagents.map((s, i) => {
        const prefix = i === subagents.length - 1 ? '└─' : '├─';
        const statusClass = s.status;
        return `<div class="tree-item ${statusClass}">${prefix} ${escapeHtml(s.label || s.task)} [${s.status}]</div>`;
    });

    container.innerHTML = lines.join('');
}

// === QUEUE TABLE ===
function updateQueueTable(queue) {
    const tbody = document.querySelector('#queue-table tbody');

    // Filter
    const filtered = currentFilter === 'all'
        ? queue
        : queue.filter(q => q.status === currentFilter);

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="empty">No items</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(q => `
        <tr>
            <td>${escapeHtml(q.id)}</td>
            <td>${escapeHtml(q.title)}</td>
            <td><span class="status-pill ${q.status}">${q.status.toUpperCase()}</span></td>
        </tr>
    `).join('');
}

function setupFilterButtons() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            fetchData(); // Refresh to apply filter
        });
    });
}

// === ECHARTS ===
function initCharts() {
    // CPU Chart
    const cpuDom = document.getElementById('cpu-chart');
    cpuChart = echarts.init(cpuDom);
    cpuChart.setOption(getChartOption('CPU USAGE', '#ff4444'));

    // Memory Chart
    const memDom = document.getElementById('mem-chart');
    memChart = echarts.init(memDom);
    memChart.setOption(getChartOption('MEMORY USAGE', '#0088ff'));

    // Resize handler
    window.addEventListener('resize', () => {
        cpuChart.resize();
        memChart.resize();
    });
}

function getChartOption(title, color) {
    return {
        backgroundColor: 'transparent',
        title: {
            text: title,
            textStyle: { color: '#888888', fontSize: 12, fontWeight: 'normal' },
            left: 0,
            top: 0
        },
        grid: { left: 40, right: 10, top: 30, bottom: 25 },
        xAxis: {
            type: 'time',
            boundaryGap: false,
            axisLine: { lineStyle: { color: '#2a2a2a' } },
            axisLabel: { color: '#666666', fontSize: 10 },
            splitLine: { show: false }
        },
        yAxis: {
            type: 'value',
            min: 0,
            max: 100,
            axisLine: { lineStyle: { color: '#2a2a2a' } },
            axisLabel: { color: '#666666', fontSize: 10, formatter: '{value}%' },
            splitLine: { lineStyle: { color: '#1a1a1a' } }
        },
        series: [{
            type: 'line',
            smooth: true,
            symbol: 'none',
            lineStyle: { color: color, width: 2 },
            areaStyle: { color: color + '20' },
            data: []
        }]
    };
}

function updateCharts(data) {
    if (data.length === 0) return;

    const cpuData = data.map(d => [new Date(d.timestamp), d.cpu_percent]);
    const memData = data.map(d => [new Date(d.timestamp), d.mem_percent]);

    cpuChart.setOption({ series: [{ data: cpuData }] });
    memChart.setOption({ series: [{ data: memData }] });
}

// === CHAT TOGGLE ===
function toggleChat() {
    chatVisible = !chatVisible;
    const chatFrame = document.getElementById('chat-frame');
    const chatToggle = document.getElementById('chat-toggle');
    chatFrame.style.display = chatVisible ? 'block' : 'none';
    chatToggle.textContent = chatVisible ? 'CLOSE' : 'CHAT';
    chatToggle.setAttribute('aria-pressed', chatVisible.toString());
}

function setupChatKeyboard() {
    const chatToggle = document.getElementById('chat-toggle');
    if (!chatToggle) return;

    chatToggle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleChat();
        }
    });
}

// === KEYBOARD SHORTCUTS ===
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ignore if typing in input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch(e.key.toLowerCase()) {
            case 'r':
                fetchData();
                fetchChartData();
                break;
            case 'c':
                toggleChat();
                break;
            case '?':
                showShortcuts();
                break;
            case 'escape':
                closeShortcuts();
                document.getElementById('chat-frame').style.display = 'none';
                chatVisible = false;
                document.getElementById('chat-toggle').textContent = 'CHAT';
                break;
        }
    });
}

function showShortcuts() {
    document.getElementById('shortcuts-modal').style.display = 'flex';
}

function closeShortcuts() {
    document.getElementById('shortcuts-modal').style.display = 'none';
}

// === UTILITIES ===
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
}
