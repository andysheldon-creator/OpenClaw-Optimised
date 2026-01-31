/**
 * Repo Monitor V2 - Dashboard Generator
 * Generates a beautiful HTML dashboard with charts
 */

import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { HistoricalData, HistoricalDataPoint } from "./history.js";
import { aggregateHistory } from "./history.js";

export function generateDashboard(outputPath: string, history: HistoricalData): void {
  const html = buildDashboardHTML(history);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, html);
}

function buildDashboardHTML(history: HistoricalData): string {
  const points = history.dataPoints;
  const metrics = aggregateHistory(history);
  const latest = points[points.length - 1];
  
  // Prepare data for charts (last 50 points for readability)
  const chartPoints = points.slice(-50);
  
  // Format dates for x-axis
  const labels = chartPoints.map(p => {
    const d = new Date(p.timestamp);
    return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  
  // Data series
  const prsCreated = chartPoints.map(p => p.prsCreated);
  const prsClosed = chartPoints.map(p => p.prsClosed);
  const prsMerged = chartPoints.map(p => p.prsMerged);
  const prsOpen = chartPoints.map(p => p.prsOpen);
  const issuesCreated = chartPoints.map(p => p.issuesCreated);
  const issuesClosed = chartPoints.map(p => p.issuesClosed);
  const issuesOpen = chartPoints.map(p => p.issuesOpen);
  const mergeRates = chartPoints.map(p => p.mergeRate);
  const totalActivity = chartPoints.map(p => p.totalActivity);
  
  // Hot zones aggregated
  const hotZoneMap = new Map<string, number>();
  for (const p of chartPoints) {
    for (const z of p.hotZones) {
      hotZoneMap.set(z.label, (hotZoneMap.get(z.label) ?? 0) + z.count);
    }
  }
  const topHotZones = [...hotZoneMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  // Contributors aggregated
  const contribMap = new Map<string, number>();
  for (const p of chartPoints) {
    for (const c of p.topContributors) {
      contribMap.set(c.login, (contribMap.get(c.login) ?? 0) + c.activity);
    }
  }
  const topContribs = [...contribMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  // Health distribution
  const healthData = chartPoints.reduce((acc, p) => {
    acc[p.health]++;
    return acc;
  }, { healthy: 0, warning: 0, critical: 0 });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>📊 Repo Monitor - ${history.repo}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    :root {
      --bg-primary: #0d1117;
      --bg-secondary: #161b22;
      --bg-tertiary: #21262d;
      --border: #30363d;
      --text-primary: #e6edf3;
      --text-secondary: #8b949e;
      --accent-blue: #58a6ff;
      --accent-green: #3fb950;
      --accent-yellow: #d29922;
      --accent-red: #f85149;
      --accent-purple: #a371f7;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.5;
      min-height: 100vh;
    }
    
    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 24px;
    }
    
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 32px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }
    
    h1 {
      font-size: 24px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    h1 a {
      color: var(--accent-blue);
      text-decoration: none;
    }
    
    h1 a:hover {
      text-decoration: underline;
    }
    
    .meta {
      color: var(--text-secondary);
      font-size: 14px;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    
    .stat-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 16px;
    }
    
    .stat-card .label {
      font-size: 12px;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    
    .stat-card .value {
      font-size: 28px;
      font-weight: 600;
    }
    
    .stat-card .delta {
      font-size: 14px;
      margin-top: 4px;
    }
    
    .stat-card .delta.positive { color: var(--accent-green); }
    .stat-card .delta.negative { color: var(--accent-red); }
    .stat-card .delta.neutral { color: var(--text-secondary); }
    
    .stat-card.healthy { border-left: 4px solid var(--accent-green); }
    .stat-card.warning { border-left: 4px solid var(--accent-yellow); }
    .stat-card.critical { border-left: 4px solid var(--accent-red); }
    
    .charts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
      gap: 24px;
      margin-bottom: 32px;
    }
    
    .chart-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 20px;
    }
    
    .chart-card h2 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 16px;
      color: var(--text-primary);
    }
    
    .chart-container {
      position: relative;
      height: 300px;
    }
    
    .lists-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 24px;
    }
    
    .list-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 20px;
    }
    
    .list-card h2 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 16px;
    }
    
    .list-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid var(--border);
    }
    
    .list-item:last-child {
      border-bottom: none;
    }
    
    .list-item .name {
      color: var(--text-primary);
    }
    
    .list-item .count {
      background: var(--bg-tertiary);
      color: var(--text-secondary);
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 12px;
    }
    
    .progress-bar {
      height: 8px;
      background: var(--bg-tertiary);
      border-radius: 4px;
      overflow: hidden;
      margin-top: 8px;
    }
    
    .progress-bar .fill {
      height: 100%;
      border-radius: 4px;
    }
    
    footer {
      margin-top: 48px;
      padding-top: 24px;
      border-top: 1px solid var(--border);
      text-align: center;
      color: var(--text-secondary);
      font-size: 14px;
    }
    
    @media (max-width: 768px) {
      .charts-grid {
        grid-template-columns: 1fr;
      }
      
      .chart-container {
        height: 250px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>
        📊 <a href="https://github.com/${history.repo}" target="_blank">${history.repo}</a>
      </h1>
      <div class="meta">
        Last updated: ${new Date(history.updatedAt).toLocaleString()}<br>
        Data points: ${points.length} | Since: ${new Date(history.createdAt).toLocaleDateString()}
      </div>
    </header>
    
    <!-- Stats Cards -->
    <div class="stats-grid">
      <div class="stat-card ${latest?.health ?? 'healthy'}">
        <div class="label">Open PRs</div>
        <div class="value">${latest?.prsOpen.toLocaleString() ?? 0}</div>
        <div class="delta ${(latest?.prsNetDelta ?? 0) > 0 ? 'negative' : (latest?.prsNetDelta ?? 0) < 0 ? 'positive' : 'neutral'}">
          ${(latest?.prsNetDelta ?? 0) >= 0 ? '+' : ''}${latest?.prsNetDelta ?? 0} net (last run)
        </div>
      </div>
      
      <div class="stat-card">
        <div class="label">Open Issues</div>
        <div class="value">${latest?.issuesOpen.toLocaleString() ?? 0}</div>
        <div class="delta ${(latest?.issuesNetDelta ?? 0) > 0 ? 'negative' : (latest?.issuesNetDelta ?? 0) < 0 ? 'positive' : 'neutral'}">
          ${(latest?.issuesNetDelta ?? 0) >= 0 ? '+' : ''}${latest?.issuesNetDelta ?? 0} net (last run)
        </div>
      </div>
      
      <div class="stat-card">
        <div class="label">Merge Rate</div>
        <div class="value">${latest?.mergeRate ?? 0}%</div>
        <div class="delta neutral">Avg: ${metrics.avgMergeRate}%</div>
      </div>
      
      <div class="stat-card">
        <div class="label">PRs Merged (Total)</div>
        <div class="value">${metrics.totalPRsMerged.toLocaleString()}</div>
        <div class="delta neutral">${metrics.avgPRsPerDay} PRs/day avg</div>
      </div>
      
      <div class="stat-card">
        <div class="label">Issues Closed (Total)</div>
        <div class="value">${metrics.totalIssuesClosed.toLocaleString()}</div>
        <div class="delta neutral">${metrics.avgIssuesPerDay} issues/day avg</div>
      </div>
      
      <div class="stat-card">
        <div class="label">Health Status</div>
        <div class="value">${latest?.health ?? 'unknown'}</div>
        <div class="delta neutral">
          ✅${healthData.healthy} ⚠️${healthData.warning} 🚨${healthData.critical}
        </div>
      </div>
    </div>
    
    <!-- Charts -->
    <div class="charts-grid">
      <div class="chart-card">
        <h2>📈 PR Activity Over Time</h2>
        <div class="chart-container">
          <canvas id="prActivityChart"></canvas>
        </div>
      </div>
      
      <div class="chart-card">
        <h2>📋 Issue Activity Over Time</h2>
        <div class="chart-container">
          <canvas id="issueActivityChart"></canvas>
        </div>
      </div>
      
      <div class="chart-card">
        <h2>📊 Backlog Trend</h2>
        <div class="chart-container">
          <canvas id="backlogChart"></canvas>
        </div>
      </div>
      
      <div class="chart-card">
        <h2>🔄 Merge Rate Trend</h2>
        <div class="chart-container">
          <canvas id="mergeRateChart"></canvas>
        </div>
      </div>
      
      <div class="chart-card">
        <h2>⚡ Total Activity</h2>
        <div class="chart-container">
          <canvas id="activityChart"></canvas>
        </div>
      </div>
      
      <div class="chart-card">
        <h2>❤️ Health Distribution</h2>
        <div class="chart-container">
          <canvas id="healthChart"></canvas>
        </div>
      </div>
    </div>
    
    <!-- Lists -->
    <div class="lists-grid">
      <div class="list-card">
        <h2>🔥 Hot Zones (Labels)</h2>
        ${topHotZones.map(([label, count]) => `
          <div class="list-item">
            <span class="name">${label}</span>
            <span class="count">${count}</span>
          </div>
        `).join('')}
      </div>
      
      <div class="list-card">
        <h2>👥 Top Contributors</h2>
        ${topContribs.map(([login, activity]) => `
          <div class="list-item">
            <span class="name">@${login}</span>
            <span class="count">${activity} activities</span>
          </div>
        `).join('')}
      </div>
    </div>
    
    <footer>
      Generated by Repo Monitor V2 • Data refreshes every run
    </footer>
  </div>
  
  <script>
    // Chart.js default config
    Chart.defaults.color = '#8b949e';
    Chart.defaults.borderColor = '#30363d';
    
    const labels = ${JSON.stringify(labels)};
    
    // PR Activity Chart
    new Chart(document.getElementById('prActivityChart'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Created',
            data: ${JSON.stringify(prsCreated)},
            borderColor: '#58a6ff',
            backgroundColor: 'rgba(88, 166, 255, 0.1)',
            fill: true,
            tension: 0.3,
          },
          {
            label: 'Closed',
            data: ${JSON.stringify(prsClosed)},
            borderColor: '#f85149',
            backgroundColor: 'rgba(248, 81, 73, 0.1)',
            fill: true,
            tension: 0.3,
          },
          {
            label: 'Merged',
            data: ${JSON.stringify(prsMerged)},
            borderColor: '#3fb950',
            backgroundColor: 'rgba(63, 185, 80, 0.1)',
            fill: true,
            tension: 0.3,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true } }
      }
    });
    
    // Issue Activity Chart
    new Chart(document.getElementById('issueActivityChart'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Created',
            data: ${JSON.stringify(issuesCreated)},
            borderColor: '#d29922',
            backgroundColor: 'rgba(210, 153, 34, 0.1)',
            fill: true,
            tension: 0.3,
          },
          {
            label: 'Closed',
            data: ${JSON.stringify(issuesClosed)},
            borderColor: '#a371f7',
            backgroundColor: 'rgba(163, 113, 247, 0.1)',
            fill: true,
            tension: 0.3,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true } }
      }
    });
    
    // Backlog Chart
    new Chart(document.getElementById('backlogChart'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Open PRs',
            data: ${JSON.stringify(prsOpen)},
            borderColor: '#58a6ff',
            tension: 0.3,
          },
          {
            label: 'Open Issues',
            data: ${JSON.stringify(issuesOpen)},
            borderColor: '#d29922',
            tension: 0.3,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    });
    
    // Merge Rate Chart
    new Chart(document.getElementById('mergeRateChart'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Merge Rate %',
          data: ${JSON.stringify(mergeRates)},
          borderColor: '#3fb950',
          backgroundColor: 'rgba(63, 185, 80, 0.2)',
          fill: true,
          tension: 0.3,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, max: 100 } }
      }
    });
    
    // Activity Chart
    new Chart(document.getElementById('activityChart'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Total Activity',
          data: ${JSON.stringify(totalActivity)},
          backgroundColor: 'rgba(88, 166, 255, 0.7)',
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
    
    // Health Distribution Chart
    new Chart(document.getElementById('healthChart'), {
      type: 'doughnut',
      data: {
        labels: ['Healthy', 'Warning', 'Critical'],
        datasets: [{
          data: [${healthData.healthy}, ${healthData.warning}, ${healthData.critical}],
          backgroundColor: ['#3fb950', '#d29922', '#f85149'],
          borderWidth: 0,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    });
  </script>
</body>
</html>`;
}
