import { html, svg, nothing } from "lit";

// Inline styles for usage view (app uses light DOM, so static styles don't work)
const usageStylesString = `
  /* ===== FILTERS & HEADER ===== */
  .usage-filters-inline {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .usage-filters-inline input[type="date"] {
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
    font-size: 13px;
  }
  .usage-filters-inline .btn-sm {
    padding: 6px 12px;
    font-size: 14px;
  }
  .usage-refresh-indicator {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: rgba(255, 77, 77, 0.1);
    border-radius: 4px;
    font-size: 12px;
    color: #ff4d4d;
  }
  .usage-refresh-indicator::before {
    content: "";
    width: 10px;
    height: 10px;
    border: 2px solid #ff4d4d;
    border-top-color: transparent;
    border-radius: 50%;
    animation: usage-spin 0.6s linear infinite;
  }
  @keyframes usage-spin {
    to { transform: rotate(360deg); }
  }
  .active-filters {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .filter-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px 4px 12px;
    background: var(--accent-subtle);
    border: 1px solid var(--accent);
    border-radius: 16px;
    font-size: 12px;
  }
  .filter-chip-label {
    color: var(--accent);
    font-weight: 500;
  }
  .filter-chip-remove {
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    padding: 2px 4px;
    font-size: 14px;
    line-height: 1;
    opacity: 0.7;
    transition: opacity 0.15s;
  }
  .filter-chip-remove:hover {
    opacity: 1;
  }
  .filter-clear-btn {
    padding: 4px 10px !important;
    font-size: 12px !important;
    line-height: 1 !important;
    margin-left: 8px;
  }
  .usage-query-bar {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .usage-query-input {
    min-width: 220px;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
    font-size: 13px;
  }
  .usage-query-suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
  }
  .usage-query-suggestion {
    padding: 4px 8px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg-secondary);
    font-size: 11px;
    color: var(--text);
    cursor: pointer;
    transition: background 0.15s;
  }
  .usage-query-suggestion:hover {
    background: var(--bg-hover);
  }
  .usage-query-hint {
    font-size: 11px;
    color: var(--text-muted);
  }
  .usage-columns-panel {
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 10px;
    background: var(--bg);
    font-size: 12px;
  }
  .usage-columns-panel summary {
    cursor: pointer;
    font-weight: 500;
    color: var(--text);
  }
  .usage-columns-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }
  .usage-columns-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }
  .usage-summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 12px;
    margin-top: 12px;
  }
  .usage-summary-card {
    padding: 12px;
    border-radius: 8px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
  }
  .usage-summary-title {
    font-size: 11px;
    color: var(--text-muted);
    margin-bottom: 6px;
  }
  .usage-summary-value {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-strong);
  }
  .usage-summary-sub {
    font-size: 11px;
    color: var(--text-muted);
    margin-top: 4px;
  }
  .usage-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .usage-list-item {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 12px;
    color: var(--text);
  }
  .usage-list-item .muted {
    font-size: 11px;
  }
  .usage-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .usage-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    border: 1px solid var(--border);
    border-radius: 999px;
    font-size: 11px;
    background: var(--bg);
    color: var(--text);
  }
  .usage-meta-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px;
  }
  .usage-meta-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
  }
  .usage-meta-item span {
    color: var(--text-muted);
    font-size: 11px;
  }
  .usage-insights-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
    margin-top: 12px;
  }
  .usage-insight-card {
    padding: 14px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg-secondary);
  }
  .usage-insight-title {
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 10px;
  }
  .usage-insight-subtitle {
    font-size: 11px;
    color: var(--text-muted);
    margin-top: 6px;
  }

  /* ===== CHART TOGGLE ===== */
  .chart-toggle {
    display: flex;
    background: var(--bg);
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid var(--border);
  }
  .chart-toggle .toggle-btn {
    padding: 6px 14px;
    font-size: 13px;
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s;
  }
  .chart-toggle .toggle-btn:hover {
    color: var(--text);
  }
  .chart-toggle .toggle-btn.active {
    background: #ff4d4d;
    color: white;
  }

  /* ===== DAILY BAR CHART ===== */
  .daily-chart {
    margin-top: 12px;
  }
  .daily-chart-bars {
    display: flex;
    align-items: flex-end;
    height: 200px;
    gap: 2px;
    padding: 8px 4px 24px;
  }
  .daily-bar-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    justify-content: flex-end;
    cursor: pointer;
    position: relative;
    border-radius: 4px 4px 0 0;
    transition: background 0.15s;
    min-width: 0;
  }
  .daily-bar-wrapper:hover {
    background: var(--bg-hover);
  }
  .daily-bar-wrapper.selected {
    background: var(--accent-subtle);
  }
  .daily-bar-wrapper.selected .daily-bar {
    background: var(--accent);
  }
  .daily-bar {
    width: 100%;
    max-width: var(--bar-max-width, 32px);
    background: #ff4d4d;
    border-radius: 3px 3px 0 0;
    min-height: 2px;
    transition: all 0.15s;
  }
  .daily-bar-wrapper:hover .daily-bar {
    background: #cc3d3d;
  }
  .daily-bar-label {
    position: absolute;
    bottom: -18px;
    font-size: 10px;
    color: var(--text-muted);
    white-space: nowrap;
    text-align: center;
  }
  .daily-bar-tooltip {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 12px;
    white-space: nowrap;
    z-index: 100;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .daily-bar-wrapper:hover .daily-bar-tooltip {
    opacity: 1;
  }

  /* ===== COST/TOKEN BREAKDOWN BAR ===== */
  .cost-breakdown {
    margin-top: 18px;
    padding: 16px;
    background: var(--bg-secondary);
    border-radius: 8px;
  }
  .cost-breakdown-header {
    font-weight: 600;
    font-size: 15px;
    letter-spacing: -0.02em;
    margin-bottom: 12px;
    color: var(--text-strong);
  }
  .cost-breakdown-bar {
    height: 28px;
    background: var(--bg);
    border-radius: 6px;
    overflow: hidden;
    display: flex;
  }
  .cost-segment {
    height: 100%;
    transition: width 0.3s ease;
    position: relative;
  }
  .cost-segment.output {
    background: #ef4444;
  }
  .cost-segment.input {
    background: #f59e0b;
  }
  .cost-segment.cache-write {
    background: #10b981;
  }
  .cost-segment.cache-read {
    background: #06b6d4;
  }
  .cost-breakdown-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-top: 12px;
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text);
    cursor: help;
  }
  .legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .legend-dot.output {
    background: #ef4444;
  }
  .legend-dot.input {
    background: #f59e0b;
  }
  .legend-dot.cache-write {
    background: #10b981;
  }
  .legend-dot.cache-read {
    background: #06b6d4;
  }
  .legend-dot.system {
    background: #ff4d4d;
  }
  .legend-dot.skills {
    background: #8b5cf6;
  }
  .legend-dot.tools {
    background: #ec4899;
  }
  .legend-dot.files {
    background: #f59e0b;
  }
  .cost-breakdown-note {
    margin-top: 10px;
    font-size: 11px;
    color: var(--text-muted);
    line-height: 1.4;
  }

  /* ===== SESSION BARS (scrollable list) ===== */
  .session-bars {
    margin-top: 16px;
    max-height: 400px;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
  }
  .session-bar-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    transition: background 0.15s;
  }
  .session-bar-row:last-child {
    border-bottom: none;
  }
  .session-bar-row:hover {
    background: var(--bg-hover);
  }
  .session-bar-row.selected {
    background: var(--accent-subtle);
  }
  .session-bar-label {
    flex: 0 0 180px;
    font-size: 13px;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .session-bar-meta {
    font-size: 10px;
    color: var(--text-muted);
    font-weight: 400;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .session-bar-track {
    flex: 1;
    height: 8px;
    background: var(--bg-secondary);
    border-radius: 4px;
    overflow: hidden;
  }
  .session-bar-fill {
    height: 100%;
    background: #ff4d4d;
    border-radius: 4px;
    transition: width 0.3s ease;
  }
  .session-bar-value {
    flex: 0 0 70px;
    text-align: right;
    font-size: 12px;
    font-family: var(--font-mono);
    color: var(--text-muted);
  }

  /* ===== TIME SERIES CHART ===== */
  .session-timeseries {
    margin-top: 24px;
    padding: 16px;
    background: var(--bg-secondary);
    border-radius: 8px;
  }
  .timeseries-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  .timeseries-header {
    font-weight: 600;
    color: var(--text);
  }
  .timeseries-chart {
    width: 100%;
    overflow: hidden;
  }
  .timeseries-svg {
    width: 100%;
    height: auto;
    display: block;
  }
  .timeseries-svg .axis-label {
    font-size: 10px;
    fill: var(--text-muted);
  }
  .timeseries-svg .ts-area {
    fill: #ff4d4d;
    fill-opacity: 0.1;
  }
  .timeseries-svg .ts-line {
    fill: none;
    stroke: #ff4d4d;
    stroke-width: 2;
  }
  .timeseries-svg .ts-dot {
    fill: #ff4d4d;
    transition: r 0.15s, fill 0.15s;
  }
  .timeseries-svg .ts-dot:hover {
    r: 5;
  }
  .timeseries-svg .ts-bar {
    fill: #ff4d4d;
    transition: fill 0.15s;
  }
  .timeseries-svg .ts-bar:hover {
    fill: #cc3d3d;
  }
  .timeseries-summary {
    margin-top: 12px;
    font-size: 13px;
    color: var(--text-muted);
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .timeseries-loading {
    padding: 24px;
    text-align: center;
    color: var(--text-muted);
  }

  /* ===== SESSION LOGS ===== */
  .session-logs {
    margin-top: 24px;
    background: var(--bg-secondary);
    border-radius: 8px;
    overflow: hidden;
  }
  .session-logs-header {
    padding: 12px 16px;
    font-weight: 600;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .session-logs-loading {
    padding: 24px;
    text-align: center;
    color: var(--text-muted);
  }
  .session-logs-list {
    max-height: 400px;
    overflow-y: auto;
  }
  .session-log-entry {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
  }
  .session-log-entry:last-child {
    border-bottom: none;
  }
  .session-log-entry.user {
    background: var(--bg);
  }
  .session-log-entry.assistant {
    background: var(--bg-secondary);
  }
  .session-log-meta {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 8px;
    font-size: 11px;
    color: var(--text-muted);
  }
  .session-log-role {
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .session-log-entry.user .session-log-role {
    color: var(--accent);
  }
  .session-log-entry.assistant .session-log-role {
    color: var(--text-muted);
  }
  .session-log-content {
    font-size: 13px;
    line-height: 1.6;
    color: var(--text);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 200px;
    overflow-y: auto;
  }

  /* ===== CONTEXT WEIGHT BREAKDOWN ===== */
  .context-weight-breakdown {
    margin-top: 24px;
    padding: 16px;
    background: var(--bg-secondary);
    border-radius: 8px;
  }
  .context-weight-breakdown .context-weight-header {
    font-weight: 600;
    font-size: 13px;
    margin-bottom: 4px;
    color: var(--text);
  }
  .context-weight-desc {
    font-size: 12px;
    color: var(--text-muted);
    margin: 0 0 12px 0;
  }
  .context-stacked-bar {
    height: 24px;
    background: var(--bg);
    border-radius: 6px;
    overflow: hidden;
    display: flex;
  }
  .context-segment {
    height: 100%;
    transition: width 0.3s ease;
  }
  .context-segment.system {
    background: #ff4d4d;
  }
  .context-segment.skills {
    background: #8b5cf6;
  }
  .context-segment.tools {
    background: #ec4899;
  }
  .context-segment.files {
    background: #f59e0b;
  }
  .context-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-top: 12px;
  }
  .context-total {
    margin-top: 10px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
  }
  .context-details {
    margin-top: 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }
  .context-details summary {
    padding: 10px 14px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
  }
  .context-details[open] summary {
    border-bottom: 1px solid var(--border);
  }
  .context-list {
    max-height: 200px;
    overflow-y: auto;
  }
  .context-list-header {
    display: flex;
    justify-content: space-between;
    padding: 8px 14px;
    font-size: 11px;
    text-transform: uppercase;
    color: var(--text-muted);
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
  }
  .context-list-item {
    display: flex;
    justify-content: space-between;
    padding: 8px 14px;
    font-size: 12px;
    border-bottom: 1px solid var(--border);
  }
  .context-list-item:last-child {
    border-bottom: none;
  }
  .context-list-item .mono {
    font-family: var(--font-mono);
    color: var(--text);
  }
  .context-list-item .muted {
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  /* ===== NO CONTEXT NOTE ===== */
  .no-context-note {
    margin-top: 24px;
    padding: 16px;
    background: var(--bg-secondary);
    border-radius: 8px;
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.5;
  }

  /* ===== TWO COLUMN LAYOUT ===== */
  .usage-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
    margin-top: 18px;
    align-items: stretch;
  }
  .usage-grid-left {
    display: flex;
    flex-direction: column;
  }
  .usage-grid-right {
    display: flex;
    flex-direction: column;
  }
  
  /* ===== LEFT CARD (Daily + Breakdown) ===== */
  .usage-left-card {
    /* inherits background, border, shadow from .card */
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .usage-left-card .daily-chart-bars {
    flex: 1;
    min-height: 200px;
  }
  .usage-left-card .sessions-panel-title {
    font-weight: 600;
    font-size: 14px;
    margin-bottom: 12px;
  }
  
  /* ===== COMPACT DAILY CHART ===== */
  .daily-chart-compact {
    margin-bottom: 16px;
  }
  .daily-chart-compact .sessions-panel-title {
    margin-bottom: 8px;
  }
  .daily-chart-compact .daily-chart-bars {
    height: 100px;
    padding-bottom: 20px;
  }
  
  /* ===== COMPACT COST BREAKDOWN ===== */
  .cost-breakdown-compact {
    padding: 0;
    margin: 0;
    background: transparent;
    border-top: 1px solid var(--border);
    padding-top: 12px;
  }
  .cost-breakdown-compact .cost-breakdown-header {
    margin-bottom: 8px;
  }
  .cost-breakdown-compact .cost-breakdown-legend {
    gap: 12px;
  }
  .cost-breakdown-compact .cost-breakdown-note {
    display: none;
  }
  
  /* ===== SESSIONS CARD ===== */
  .sessions-card {
    /* inherits background, border, shadow from .card */
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .sessions-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .sessions-card-title {
    font-weight: 600;
    font-size: 14px;
  }
  .sessions-card-count {
    font-size: 12px;
    color: var(--text-muted);
  }
  .sessions-card-hint {
    font-size: 11px;
    color: var(--text-muted);
    margin-bottom: 8px;
  }
  .sessions-card .session-bars {
    max-height: 280px;
    background: var(--bg);
    border-radius: 6px;
    border: 1px solid var(--border);
    margin: 0;
    overflow-y: auto;
    padding: 8px;
  }
  .sessions-card .session-bar-row {
    padding: 8px 10px;
    border-radius: 6px;
    margin-bottom: 4px;
    border: 1px solid transparent;
    transition: all 0.15s;
  }
  .sessions-card .session-bar-row:hover {
    border-color: var(--border);
    background: var(--bg-hover);
  }
  .sessions-card .session-bar-row.selected {
    border-color: var(--accent);
    background: rgba(255, 77, 77, 0.08);
  }
  .sessions-card .session-bar-label {
    flex: 0 0 140px;
    font-size: 12px;
  }
  .sessions-card .session-bar-value {
    flex: 0 0 60px;
    font-size: 11px;
  }
  
  /* ===== EMPTY DETAIL STATE ===== */
  .session-detail-empty {
    margin-top: 18px;
    background: var(--bg-secondary);
    border-radius: 8px;
    border: 2px dashed var(--border);
    padding: 32px;
    text-align: center;
  }
  .session-detail-empty-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 8px;
  }
  .session-detail-empty-desc {
    font-size: 13px;
    color: var(--text-muted);
    margin-bottom: 16px;
    line-height: 1.5;
  }
  .session-detail-empty-features {
    display: flex;
    justify-content: center;
    gap: 24px;
    flex-wrap: wrap;
  }
  .session-detail-empty-feature {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-muted);
  }
  .session-detail-empty-feature .icon {
    font-size: 16px;
  }
  
  /* ===== SESSION DETAIL PANEL ===== */
  .session-detail-panel {
    margin-top: 18px;
    /* inherits background, border-radius, shadow from .card */
    border: 2px solid var(--accent) !important;
  }
  .session-detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
  }
  .session-detail-header:hover {
    background: var(--bg-hover);
  }
  .session-detail-title {
    font-weight: 600;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .session-close-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 2px 6px;
    font-size: 18px;
    line-height: 1;
    border-radius: 4px;
    transition: background 0.15s, color 0.15s;
  }
  .session-close-btn:hover {
    background: var(--bg-hover);
    color: var(--text);
  }
  .session-detail-stats {
    display: flex;
    gap: 16px;
    font-size: 13px;
    color: var(--text-muted);
  }
  .session-detail-stats strong {
    color: var(--text);
    font-family: var(--font-mono);
  }
  .session-detail-content {
    padding: 16px;
  }
  .session-summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }
  .session-summary-card {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px;
    background: var(--bg-secondary);
  }
  .session-summary-title {
    font-size: 11px;
    color: var(--text-muted);
    margin-bottom: 4px;
  }
  .session-summary-value {
    font-size: 14px;
    font-weight: 600;
  }
  .session-summary-meta {
    font-size: 11px;
    color: var(--text-muted);
    margin-top: 4px;
  }
  .session-detail-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 16px;
  }
  .session-detail-bottom {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .session-detail-bottom .session-logs-compact {
    margin: 0;
  }
  .session-detail-bottom .session-logs-compact .session-logs-list {
    max-height: 320px;
  }
  .context-details-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--bg);
    border-radius: 6px;
    border: 1px solid var(--border);
    padding: 12px;
  }
  
  /* ===== COMPACT TIMESERIES ===== */
  .session-timeseries-compact {
    background: var(--bg);
    border-radius: 6px;
    border: 1px solid var(--border);
    padding: 12px;
    margin: 0;
  }
  .session-timeseries-compact .timeseries-header-row {
    margin-bottom: 8px;
  }
  .session-timeseries-compact .timeseries-header {
    font-size: 12px;
  }
  .session-timeseries-compact .timeseries-summary {
    font-size: 11px;
    margin-top: 8px;
  }
  
  /* ===== COMPACT CONTEXT ===== */
  .context-weight-compact {
    background: var(--bg);
    border-radius: 6px;
    border: 1px solid var(--border);
    padding: 12px;
    margin: 0;
  }
  .context-weight-compact .context-weight-header {
    font-size: 12px;
    margin-bottom: 4px;
  }
  .context-weight-compact .context-weight-desc {
    font-size: 11px;
    margin-bottom: 8px;
  }
  .context-weight-compact .context-stacked-bar {
    height: 16px;
  }
  .context-weight-compact .context-legend {
    font-size: 11px;
    gap: 10px;
    margin-top: 8px;
  }
  .context-weight-compact .context-total {
    font-size: 11px;
    margin-top: 6px;
  }
  .context-weight-compact .context-details {
    margin-top: 8px;
  }
  .context-weight-compact .context-details summary {
    font-size: 12px;
    padding: 6px 10px;
  }
  
  /* ===== COMPACT LOGS ===== */
  .session-logs-compact {
    background: var(--bg);
    border-radius: 6px;
    border: 1px solid var(--border);
    overflow: hidden;
    margin: 0;
  }
  .session-logs-compact .session-logs-header {
    padding: 8px 12px;
    font-size: 12px;
  }
  .session-logs-compact .session-logs-list {
    max-height: 250px;
  }
  .session-logs-compact .session-log-entry {
    padding: 8px 12px;
  }
  .session-logs-compact .session-log-content {
    font-size: 12px;
    max-height: 150px;
  }

  /* ===== RESPONSIVE ===== */
  @media (max-width: 900px) {
    .usage-grid {
      grid-template-columns: 1fr;
    }
    .session-detail-row {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 600px) {
    .session-bar-label {
      flex: 0 0 100px;
    }
    .cost-breakdown-legend {
      gap: 10px;
    }
    .legend-item {
      font-size: 11px;
    }
  }
`;

export type UsageSessionEntry = {
  key: string;
  label?: string;
  sessionId?: string;
  updatedAt?: number;
  agentId?: string;
  channel?: string;
  chatType?: string;
  origin?: {
    label?: string;
    provider?: string;
    surface?: string;
    chatType?: string;
    from?: string;
    to?: string;
    accountId?: string;
    threadId?: string | number;
  };
  modelOverride?: string;
  providerOverride?: string;
  modelProvider?: string;
  model?: string;
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    totalCost: number;
    inputCost?: number;
    outputCost?: number;
    cacheReadCost?: number;
    cacheWriteCost?: number;
    missingCostEntries: number;
    firstActivity?: number;
    lastActivity?: number;
    durationMs?: number;
    activityDates?: string[]; // YYYY-MM-DD dates when session had activity
    dailyBreakdown?: Array<{ date: string; tokens: number; cost: number }>; // Per-day breakdown
    dailyMessageCounts?: Array<{
      date: string;
      total: number;
      user: number;
      assistant: number;
      toolCalls: number;
      toolResults: number;
      errors: number;
    }>;
    messageCounts?: {
      total: number;
      user: number;
      assistant: number;
      toolCalls: number;
      toolResults: number;
      errors: number;
    };
    toolUsage?: {
      totalCalls: number;
      uniqueTools: number;
      tools: Array<{ name: string; count: number }>;
    };
    modelUsage?: Array<{
      provider?: string;
      model?: string;
      count: number;
      totals: UsageTotals;
    }>;
  } | null;
  contextWeight?: {
    systemPrompt: { chars: number; projectContextChars: number; nonProjectContextChars: number };
    skills: { promptChars: number; entries: Array<{ name: string; blockChars: number }> };
    tools: {
      listChars: number;
      schemaChars: number;
      entries: Array<{ name: string; summaryChars: number; schemaChars: number }>;
    };
    injectedWorkspaceFiles: Array<{
      name: string;
      path: string;
      rawChars: number;
      injectedChars: number;
      truncated: boolean;
    }>;
  } | null;
};

export type UsageTotals = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  totalCost: number;
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  missingCostEntries: number;
};

export type CostDailyEntry = UsageTotals & { date: string };

export type UsageAggregates = {
  messages: {
    total: number;
    user: number;
    assistant: number;
    toolCalls: number;
    toolResults: number;
    errors: number;
  };
  tools: {
    totalCalls: number;
    uniqueTools: number;
    tools: Array<{ name: string; count: number }>;
  };
  byModel: Array<{
    provider?: string;
    model?: string;
    count: number;
    totals: UsageTotals;
  }>;
  byProvider: Array<{
    provider?: string;
    model?: string;
    count: number;
    totals: UsageTotals;
  }>;
  byAgent: Array<{ agentId: string; totals: UsageTotals }>;
  byChannel: Array<{ channel: string; totals: UsageTotals }>;
  daily: Array<{
    date: string;
    tokens: number;
    cost: number;
    messages: number;
    toolCalls: number;
    errors: number;
  }>;
};

export type UsageColumnId =
  | "channel"
  | "agent"
  | "provider"
  | "model"
  | "messages"
  | "tools"
  | "errors"
  | "duration";

export type TimeSeriesPoint = {
  timestamp: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: number;
  cumulativeTokens: number;
  cumulativeCost: number;
};

export type UsageProps = {
  loading: boolean;
  error: string | null;
  startDate: string;
  endDate: string;
  sessions: UsageSessionEntry[];
  sessionsLimitReached: boolean; // True if 1000 session cap was hit
  totals: UsageTotals | null;
  aggregates: UsageAggregates | null;
  costDaily: CostDailyEntry[];
  selectedSessions: string[]; // Support multiple session selection
  selectedDays: string[]; // Support multiple day selection
  chartMode: "tokens" | "cost";
  timeSeriesMode: "cumulative" | "per-turn";
  timeSeries: { points: TimeSeriesPoint[] } | null;
  timeSeriesLoading: boolean;
  sessionLogs: SessionLogEntry[] | null;
  sessionLogsLoading: boolean;
  query: string;
  visibleColumns: UsageColumnId[];
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onRefresh: () => void;
  onSelectSession: (key: string, shiftKey: boolean) => void;
  onChartModeChange: (mode: "tokens" | "cost") => void;
  onTimeSeriesModeChange: (mode: "cumulative" | "per-turn") => void;
  onSelectDay: (day: string, shiftKey: boolean) => void; // Support shift-click
  onClearDays: () => void;
  onClearSessions: () => void;
  onClearFilters: () => void;
  onQueryChange: (query: string) => void;
  onClearQuery: () => void;
  onToggleColumn: (column: UsageColumnId) => void;
};

export type SessionLogEntry = {
  timestamp: number;
  role: "user" | "assistant";
  content: string;
  tokens?: number;
  cost?: number;
};

// ~4 chars per token is a rough approximation
const CHARS_PER_TOKEN = 4;

function charsToTokens(chars: number): number {
  return Math.round(chars / CHARS_PER_TOKEN);
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}K`;
  }
  return String(n);
}

function formatCost(n: number, decimals = 2): string {
  return `$${n.toFixed(decimals)}`;
}

function parseYmdDate(dateStr: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) {
    return null;
  }
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return Number.isNaN(date.valueOf()) ? null : date;
}

function formatDayLabel(dateStr: string): string {
  const date = parseYmdDate(dateStr);
  if (!date) {
    return dateStr;
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatFullDate(dateStr: string): string {
  const date = parseYmdDate(dateStr);
  if (!date) {
    return dateStr;
  }
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function formatDurationMs(ms?: number): string {
  if (!ms || ms <= 0) {
    return "—";
  }
  const totalSeconds = Math.round(ms / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

type UsageQueryTerm = {
  key?: string;
  value: string;
  raw: string;
};

type UsageQueryResult = {
  sessions: UsageSessionEntry[];
  warnings: string[];
};

const QUERY_KEYS = new Set([
  "agent",
  "channel",
  "chat",
  "provider",
  "model",
  "tool",
  "label",
  "session",
  "id",
  "has",
  "mintokens",
  "maxtokens",
  "mincost",
  "maxcost",
  "minmessages",
  "maxmessages",
]);

const normalizeQueryText = (value: string): string => value.trim().toLowerCase();

const parseQueryNumber = (value: string): number | null => {
  let raw = value.trim().toLowerCase();
  if (!raw) {
    return null;
  }
  if (raw.startsWith("$")) {
    raw = raw.slice(1);
  }
  let multiplier = 1;
  if (raw.endsWith("k")) {
    multiplier = 1_000;
    raw = raw.slice(0, -1);
  } else if (raw.endsWith("m")) {
    multiplier = 1_000_000;
    raw = raw.slice(0, -1);
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed * multiplier;
};

const extractQueryTerms = (query: string): UsageQueryTerm[] => {
  const rawTokens = query.match(/"[^"]+"|\\S+/g) ?? [];
  return rawTokens.map((token) => {
    const cleaned = token.replace(/^"|"$/g, "");
    const idx = cleaned.indexOf(":");
    if (idx > 0) {
      const key = cleaned.slice(0, idx);
      const value = cleaned.slice(idx + 1);
      return { key, value, raw: cleaned };
    }
    return { value: cleaned, raw: cleaned };
  });
};

const getSessionText = (session: UsageSessionEntry): string[] => {
  const items: Array<string | undefined> = [session.label, session.key, session.sessionId];
  return items.filter((item): item is string => Boolean(item)).map((item) => item.toLowerCase());
};

const getSessionProviders = (session: UsageSessionEntry): string[] => {
  const providers = new Set<string>();
  if (session.modelProvider) {
    providers.add(session.modelProvider.toLowerCase());
  }
  if (session.providerOverride) {
    providers.add(session.providerOverride.toLowerCase());
  }
  if (session.origin?.provider) {
    providers.add(session.origin.provider.toLowerCase());
  }
  for (const entry of session.usage?.modelUsage ?? []) {
    if (entry.provider) {
      providers.add(entry.provider.toLowerCase());
    }
  }
  return Array.from(providers);
};

const getSessionModels = (session: UsageSessionEntry): string[] => {
  const models = new Set<string>();
  if (session.model) {
    models.add(session.model.toLowerCase());
  }
  for (const entry of session.usage?.modelUsage ?? []) {
    if (entry.model) {
      models.add(entry.model.toLowerCase());
    }
  }
  return Array.from(models);
};

const getSessionTools = (session: UsageSessionEntry): string[] =>
  (session.usage?.toolUsage?.tools ?? []).map((tool) => tool.name.toLowerCase());

const matchesUsageQuery = (session: UsageSessionEntry, term: UsageQueryTerm): boolean => {
  const value = normalizeQueryText(term.value ?? "");
  if (!value) {
    return true;
  }
  if (!term.key) {
    return getSessionText(session).some((text) => text.includes(value));
  }

  const key = normalizeQueryText(term.key);
  switch (key) {
    case "agent":
      return session.agentId?.toLowerCase().includes(value) ?? false;
    case "channel":
      return session.channel?.toLowerCase().includes(value) ?? false;
    case "chat":
      return session.chatType?.toLowerCase().includes(value) ?? false;
    case "provider":
      return getSessionProviders(session).some((provider) => provider.includes(value));
    case "model":
      return getSessionModels(session).some((model) => model.includes(value));
    case "tool":
      return getSessionTools(session).some((tool) => tool.includes(value));
    case "label":
      return session.label?.toLowerCase().includes(value) ?? false;
    case "session":
    case "id":
      return (
        session.key.toLowerCase().includes(value) ||
        (session.sessionId?.toLowerCase().includes(value) ?? false)
      );
    case "has":
      switch (value) {
        case "tools":
          return (session.usage?.toolUsage?.totalCalls ?? 0) > 0;
        case "errors":
          return (session.usage?.messageCounts?.errors ?? 0) > 0;
        case "context":
          return Boolean(session.contextWeight);
        case "usage":
          return Boolean(session.usage);
        case "model":
          return getSessionModels(session).length > 0;
        case "provider":
          return getSessionProviders(session).length > 0;
        default:
          return true;
      }
    case "mintokens": {
      const threshold = parseQueryNumber(value);
      if (threshold === null) {
        return true;
      }
      return (session.usage?.totalTokens ?? 0) >= threshold;
    }
    case "maxtokens": {
      const threshold = parseQueryNumber(value);
      if (threshold === null) {
        return true;
      }
      return (session.usage?.totalTokens ?? 0) <= threshold;
    }
    case "mincost": {
      const threshold = parseQueryNumber(value);
      if (threshold === null) {
        return true;
      }
      return (session.usage?.totalCost ?? 0) >= threshold;
    }
    case "maxcost": {
      const threshold = parseQueryNumber(value);
      if (threshold === null) {
        return true;
      }
      return (session.usage?.totalCost ?? 0) <= threshold;
    }
    case "minmessages": {
      const threshold = parseQueryNumber(value);
      if (threshold === null) {
        return true;
      }
      return (session.usage?.messageCounts?.total ?? 0) >= threshold;
    }
    case "maxmessages": {
      const threshold = parseQueryNumber(value);
      if (threshold === null) {
        return true;
      }
      return (session.usage?.messageCounts?.total ?? 0) <= threshold;
    }
    default:
      return true;
  }
};

const filterSessionsByQuery = (sessions: UsageSessionEntry[], query: string): UsageQueryResult => {
  const terms = extractQueryTerms(query);
  if (terms.length === 0) {
    return { sessions, warnings: [] };
  }

  const warnings: string[] = [];
  for (const term of terms) {
    if (!term.key) {
      continue;
    }
    const normalizedKey = normalizeQueryText(term.key);
    if (!QUERY_KEYS.has(normalizedKey)) {
      warnings.push(`Unknown filter: ${term.key}`);
      continue;
    }
    if (term.value === "") {
      warnings.push(`Missing value for ${term.key}`);
    }
    if (normalizedKey === "has") {
      const allowed = new Set(["tools", "errors", "context", "usage", "model", "provider"]);
      if (term.value && !allowed.has(normalizeQueryText(term.value))) {
        warnings.push(`Unknown has:${term.value}`);
      }
    }
    if (
      ["mintokens", "maxtokens", "mincost", "maxcost", "minmessages", "maxmessages"].includes(
        normalizedKey,
      )
    ) {
      if (term.value && parseQueryNumber(term.value) === null) {
        warnings.push(`Invalid number for ${term.key}`);
      }
    }
  }

  const filtered = sessions.filter((session) =>
    terms.every((term) => matchesUsageQuery(session, term)),
  );
  return { sessions: filtered, warnings };
};

const emptyUsageTotals = (): UsageTotals => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  totalCost: 0,
  inputCost: 0,
  outputCost: 0,
  cacheReadCost: 0,
  cacheWriteCost: 0,
  missingCostEntries: 0,
});

const mergeUsageTotals = (target: UsageTotals, source: UsageTotals) => {
  target.input += source.input;
  target.output += source.output;
  target.cacheRead += source.cacheRead;
  target.cacheWrite += source.cacheWrite;
  target.totalTokens += source.totalTokens;
  target.totalCost += source.totalCost;
  target.inputCost += source.inputCost ?? 0;
  target.outputCost += source.outputCost ?? 0;
  target.cacheReadCost += source.cacheReadCost ?? 0;
  target.cacheWriteCost += source.cacheWriteCost ?? 0;
  target.missingCostEntries += source.missingCostEntries ?? 0;
};

const buildAggregatesFromSessions = (
  sessions: UsageSessionEntry[],
  fallback?: UsageAggregates | null,
): UsageAggregates => {
  if (sessions.length === 0) {
    return (
      fallback ?? {
        messages: { total: 0, user: 0, assistant: 0, toolCalls: 0, toolResults: 0, errors: 0 },
        tools: { totalCalls: 0, uniqueTools: 0, tools: [] },
        byModel: [],
        byProvider: [],
        byAgent: [],
        byChannel: [],
        daily: [],
      }
    );
  }

  const messages = { total: 0, user: 0, assistant: 0, toolCalls: 0, toolResults: 0, errors: 0 };
  const toolMap = new Map<string, number>();
  const modelMap = new Map<
    string,
    { provider?: string; model?: string; count: number; totals: UsageTotals }
  >();
  const providerMap = new Map<
    string,
    { provider?: string; model?: string; count: number; totals: UsageTotals }
  >();
  const agentMap = new Map<string, UsageTotals>();
  const channelMap = new Map<string, UsageTotals>();
  const dailyMap = new Map<
    string,
    {
      date: string;
      tokens: number;
      cost: number;
      messages: number;
      toolCalls: number;
      errors: number;
    }
  >();

  for (const session of sessions) {
    const usage = session.usage;
    if (!usage) {
      continue;
    }
    if (usage.messageCounts) {
      messages.total += usage.messageCounts.total;
      messages.user += usage.messageCounts.user;
      messages.assistant += usage.messageCounts.assistant;
      messages.toolCalls += usage.messageCounts.toolCalls;
      messages.toolResults += usage.messageCounts.toolResults;
      messages.errors += usage.messageCounts.errors;
    }

    if (usage.toolUsage) {
      for (const tool of usage.toolUsage.tools) {
        toolMap.set(tool.name, (toolMap.get(tool.name) ?? 0) + tool.count);
      }
    }

    if (usage.modelUsage) {
      for (const entry of usage.modelUsage) {
        const modelKey = `${entry.provider ?? "unknown"}::${entry.model ?? "unknown"}`;
        const modelExisting = modelMap.get(modelKey) ?? {
          provider: entry.provider,
          model: entry.model,
          count: 0,
          totals: emptyUsageTotals(),
        };
        modelExisting.count += entry.count;
        mergeUsageTotals(modelExisting.totals, entry.totals);
        modelMap.set(modelKey, modelExisting);

        const providerKey = entry.provider ?? "unknown";
        const providerExisting = providerMap.get(providerKey) ?? {
          provider: entry.provider,
          model: undefined,
          count: 0,
          totals: emptyUsageTotals(),
        };
        providerExisting.count += entry.count;
        mergeUsageTotals(providerExisting.totals, entry.totals);
        providerMap.set(providerKey, providerExisting);
      }
    }

    if (session.agentId) {
      const totals = agentMap.get(session.agentId) ?? emptyUsageTotals();
      mergeUsageTotals(totals, usage);
      agentMap.set(session.agentId, totals);
    }
    if (session.channel) {
      const totals = channelMap.get(session.channel) ?? emptyUsageTotals();
      mergeUsageTotals(totals, usage);
      channelMap.set(session.channel, totals);
    }

    for (const day of usage.dailyBreakdown ?? []) {
      const daily = dailyMap.get(day.date) ?? {
        date: day.date,
        tokens: 0,
        cost: 0,
        messages: 0,
        toolCalls: 0,
        errors: 0,
      };
      daily.tokens += day.tokens;
      daily.cost += day.cost;
      dailyMap.set(day.date, daily);
    }
    for (const day of usage.dailyMessageCounts ?? []) {
      const daily = dailyMap.get(day.date) ?? {
        date: day.date,
        tokens: 0,
        cost: 0,
        messages: 0,
        toolCalls: 0,
        errors: 0,
      };
      daily.messages += day.total;
      daily.toolCalls += day.toolCalls;
      daily.errors += day.errors;
      dailyMap.set(day.date, daily);
    }
  }

  return {
    messages,
    tools: {
      totalCalls: Array.from(toolMap.values()).reduce((sum, count) => sum + count, 0),
      uniqueTools: toolMap.size,
      tools: Array.from(toolMap.entries())
        .map(([name, count]) => ({ name, count }))
        .toSorted((a, b) => b.count - a.count),
    },
    byModel: Array.from(modelMap.values()).toSorted(
      (a, b) => b.totals.totalCost - a.totals.totalCost,
    ),
    byProvider: Array.from(providerMap.values()).toSorted(
      (a, b) => b.totals.totalCost - a.totals.totalCost,
    ),
    byAgent: Array.from(agentMap.entries())
      .map(([agentId, totals]) => ({ agentId, totals }))
      .toSorted((a, b) => b.totals.totalCost - a.totals.totalCost),
    byChannel: Array.from(channelMap.entries())
      .map(([channel, totals]) => ({ channel, totals }))
      .toSorted((a, b) => b.totals.totalCost - a.totals.totalCost),
    daily: Array.from(dailyMap.values()).toSorted((a, b) => a.date.localeCompare(b.date)),
  };
};

type QuerySuggestion = {
  label: string;
  value: string;
};

const buildQuerySuggestions = (
  query: string,
  sessions: UsageSessionEntry[],
  aggregates?: UsageAggregates | null,
): QuerySuggestion[] => {
  const trimmed = query.trim();
  const tokens = trimmed.length ? trimmed.split(/\s+/) : [];
  const lastToken = tokens.length ? tokens[tokens.length - 1] : "";
  const [rawKey, rawValue] = lastToken.includes(":")
    ? [lastToken.slice(0, lastToken.indexOf(":")), lastToken.slice(lastToken.indexOf(":") + 1)]
    : ["", ""];

  const key = rawKey.toLowerCase();
  const value = rawValue.toLowerCase();

  const unique = (items: Array<string | undefined>): string[] => {
    const set = new Set<string>();
    for (const item of items) {
      if (item) {
        set.add(item);
      }
    }
    return Array.from(set);
  };

  const agents = unique(sessions.map((s) => s.agentId)).slice(0, 6);
  const channels = unique(sessions.map((s) => s.channel)).slice(0, 6);
  const providers = unique([
    ...sessions.map((s) => s.modelProvider),
    ...sessions.map((s) => s.providerOverride),
    ...(aggregates?.byProvider.map((p) => p.provider) ?? []),
  ]).slice(0, 6);
  const models = unique([
    ...sessions.map((s) => s.model),
    ...(aggregates?.byModel.map((m) => m.model) ?? []),
  ]).slice(0, 6);
  const tools = unique(aggregates?.tools.tools.map((t) => t.name) ?? []).slice(0, 6);

  if (!key) {
    return [
      { label: "agent:", value: "agent:" },
      { label: "channel:", value: "channel:" },
      { label: "provider:", value: "provider:" },
      { label: "model:", value: "model:" },
      { label: "tool:", value: "tool:" },
      { label: "has:errors", value: "has:errors" },
      { label: "has:tools", value: "has:tools" },
      { label: "minTokens:", value: "minTokens:" },
      { label: "maxCost:", value: "maxCost:" },
    ];
  }

  const suggestions: QuerySuggestion[] = [];
  const addValues = (prefix: string, values: string[]) => {
    for (const val of values) {
      if (!value || val.toLowerCase().includes(value)) {
        suggestions.push({ label: `${prefix}:${val}`, value: `${prefix}:${val}` });
      }
    }
  };

  switch (key) {
    case "agent":
      addValues("agent", agents);
      break;
    case "channel":
      addValues("channel", channels);
      break;
    case "provider":
      addValues("provider", providers);
      break;
    case "model":
      addValues("model", models);
      break;
    case "tool":
      addValues("tool", tools);
      break;
    case "has":
      ["errors", "tools", "context", "usage", "model", "provider"].forEach((entry) => {
        if (!value || entry.includes(value)) {
          suggestions.push({ label: `has:${entry}`, value: `has:${entry}` });
        }
      });
      break;
    default:
      break;
  }

  return suggestions;
};

const applySuggestionToQuery = (query: string, suggestion: string): string => {
  const trimmed = query.trim();
  if (!trimmed) {
    return `${suggestion} `;
  }
  const tokens = trimmed.split(/\s+/);
  tokens[tokens.length - 1] = suggestion;
  return `${tokens.join(" ")} `;
};

function pct(part: number, total: number): number {
  if (total === 0) {
    return 0;
  }
  return (part / total) * 100;
}

function getCostBreakdown(totals: UsageTotals) {
  // Use actual costs from API data (already aggregated in backend)
  const totalCost = totals.totalCost || 0;

  return {
    input: {
      tokens: totals.input,
      cost: totals.inputCost || 0,
      pct: pct(totals.inputCost || 0, totalCost),
    },
    output: {
      tokens: totals.output,
      cost: totals.outputCost || 0,
      pct: pct(totals.outputCost || 0, totalCost),
    },
    cacheRead: {
      tokens: totals.cacheRead,
      cost: totals.cacheReadCost || 0,
      pct: pct(totals.cacheReadCost || 0, totalCost),
    },
    cacheWrite: {
      tokens: totals.cacheWrite,
      cost: totals.cacheWriteCost || 0,
      pct: pct(totals.cacheWriteCost || 0, totalCost),
    },
    totalCost,
  };
}

function renderFilterChips(
  selectedDays: string[],
  selectedSessions: string[],
  sessions: UsageSessionEntry[],
  onClearDays: () => void,
  onClearSessions: () => void,
  onClearFilters: () => void,
) {
  const hasFilters = selectedDays.length > 0 || selectedSessions.length > 0;
  if (!hasFilters) {
    return nothing;
  }

  const selectedSession =
    selectedSessions.length === 1 ? sessions.find((s) => s.key === selectedSessions[0]) : null;
  const sessionsLabel = selectedSession
    ? (selectedSession.label || selectedSession.key).slice(0, 20) +
      ((selectedSession.label || selectedSession.key).length > 20 ? "…" : "")
    : selectedSessions.length === 1
      ? selectedSessions[0].slice(0, 8) + "…"
      : `${selectedSessions.length} sessions`;
  const sessionsFullName = selectedSession
    ? selectedSession.label || selectedSession.key
    : selectedSessions.length === 1
      ? selectedSessions[0]
      : selectedSessions.join(", ");

  const daysLabel = selectedDays.length === 1 ? selectedDays[0] : `${selectedDays.length} days`;

  return html`
    <div class="active-filters">
      ${
        selectedDays.length > 0
          ? html`
            <div class="filter-chip">
              <span class="filter-chip-label">Days: ${daysLabel}</span>
              <button class="filter-chip-remove" @click=${onClearDays} title="Remove filter">×</button>
            </div>
          `
          : nothing
      }
      ${
        selectedSessions.length > 0
          ? html`
            <div class="filter-chip" title="${sessionsFullName}">
              <span class="filter-chip-label">Session: ${sessionsLabel}</span>
              <button class="filter-chip-remove" @click=${onClearSessions} title="Remove filter">×</button>
            </div>
          `
          : nothing
      }
      ${
        selectedDays.length > 0 && selectedSessions.length > 0
          ? html`
            <button class="btn btn-sm filter-clear-btn" @click=${onClearFilters}>
              Clear All
            </button>
          `
          : nothing
      }
    </div>
  `;
}

function renderDailyChartCompact(
  daily: CostDailyEntry[],
  selectedDays: string[],
  chartMode: "tokens" | "cost",
  onSelectDay: (day: string, shiftKey: boolean) => void,
) {
  if (!daily.length) {
    return html`
      <div class="daily-chart-compact">
        <div class="sessions-panel-title">Daily Usage</div>
        <div class="muted" style="padding: 20px; text-align: center">No data</div>
      </div>
    `;
  }

  const isTokenMode = chartMode === "tokens";
  const values = daily.map((d) => (isTokenMode ? d.totalTokens : d.totalCost));
  const maxValue = Math.max(...values, isTokenMode ? 1 : 0.0001);

  // Calculate bar width based on number of days
  const barMaxWidth = daily.length > 30 ? 12 : daily.length > 20 ? 18 : daily.length > 14 ? 24 : 32;

  return html`
    <div class="daily-chart-compact">
      <div class="card-title">Daily ${isTokenMode ? "Token" : "Cost"} Usage</div>
      <div class="daily-chart">
        <div class="daily-chart-bars" style="--bar-max-width: ${barMaxWidth}px">
          ${daily.map((d, idx) => {
            const value = values[idx];
            const heightPct = (value / maxValue) * 100;
            const isSelected = selectedDays.includes(d.date);
            const label = formatDayLabel(d.date);
            // Shorter label for many days (just day number)
            const shortLabel = daily.length > 20 ? String(parseInt(d.date.slice(8), 10)) : label;
            const labelStyle = daily.length > 20 ? "font-size: 8px" : "";
            return html`
              <div
                class="daily-bar-wrapper ${isSelected ? "selected" : ""}"
                @click=${(e: MouseEvent) => onSelectDay(d.date, e.shiftKey)}
              >
                <div class="daily-bar" style="height: ${heightPct.toFixed(1)}%"></div>
                <div class="daily-bar-label" style="${labelStyle}">${shortLabel}</div>
                <div class="daily-bar-tooltip">
                  <strong>${formatFullDate(d.date)}</strong><br />
                  ${formatTokens(d.totalTokens)} tokens<br />
                  ${formatCost(d.totalCost)}
                </div>
              </div>
            `;
          })}
        </div>
      </div>
    </div>
  `;
}

function renderCostBreakdownCompact(totals: UsageTotals, mode: "tokens" | "cost") {
  const breakdown = getCostBreakdown(totals);
  const isTokenMode = mode === "tokens";
  const totalTokens = totals.totalTokens || 1;
  const tokenPcts = {
    output: pct(totals.output, totalTokens),
    input: pct(totals.input, totalTokens),
    cacheWrite: pct(totals.cacheWrite, totalTokens),
    cacheRead: pct(totals.cacheRead, totalTokens),
  };

  return html`
    <div class="cost-breakdown cost-breakdown-compact">
      <div class="cost-breakdown-header">${isTokenMode ? "Tokens" : "Cost"} by Type</div>
      <div class="cost-breakdown-bar">
        <div class="cost-segment output" style="width: ${(isTokenMode ? tokenPcts.output : breakdown.output.pct).toFixed(1)}%"
          title="Output: ${isTokenMode ? formatTokens(totals.output) : formatCost(breakdown.output.cost)}"></div>
        <div class="cost-segment input" style="width: ${(isTokenMode ? tokenPcts.input : breakdown.input.pct).toFixed(1)}%"
          title="Input: ${isTokenMode ? formatTokens(totals.input) : formatCost(breakdown.input.cost)}"></div>
        <div class="cost-segment cache-write" style="width: ${(isTokenMode ? tokenPcts.cacheWrite : breakdown.cacheWrite.pct).toFixed(1)}%"
          title="Cache Write: ${isTokenMode ? formatTokens(totals.cacheWrite) : formatCost(breakdown.cacheWrite.cost)}"></div>
        <div class="cost-segment cache-read" style="width: ${(isTokenMode ? tokenPcts.cacheRead : breakdown.cacheRead.pct).toFixed(1)}%"
          title="Cache Read: ${isTokenMode ? formatTokens(totals.cacheRead) : formatCost(breakdown.cacheRead.cost)}"></div>
      </div>
      <div class="cost-breakdown-legend">
        <span class="legend-item"><span class="legend-dot output"></span>Output ${isTokenMode ? formatTokens(totals.output) : formatCost(breakdown.output.cost)}</span>
        <span class="legend-item"><span class="legend-dot input"></span>Input ${isTokenMode ? formatTokens(totals.input) : formatCost(breakdown.input.cost)}</span>
        <span class="legend-item"><span class="legend-dot cache-write"></span>Cache Write ${isTokenMode ? formatTokens(totals.cacheWrite) : formatCost(breakdown.cacheWrite.cost)}</span>
        <span class="legend-item"><span class="legend-dot cache-read"></span>Cache Read ${isTokenMode ? formatTokens(totals.cacheRead) : formatCost(breakdown.cacheRead.cost)}</span>
      </div>
    </div>
  `;
}

function renderInsightList(
  title: string,
  items: Array<{ label: string; value: string; sub?: string }>,
  emptyLabel: string,
) {
  return html`
    <div class="usage-insight-card">
      <div class="usage-insight-title">${title}</div>
      ${
        items.length === 0
          ? html`<div class="muted">${emptyLabel}</div>`
          : html`
              <div class="usage-list">
                ${items.map(
                  (item) => html`
                    <div class="usage-list-item">
                      <span>${item.label}</span>
                      <span>
                        ${item.value}
                        ${item.sub ? html`<span class="muted"> ${item.sub}</span>` : nothing}
                      </span>
                    </div>
                  `,
                )}
              </div>
            `
      }
    </div>
  `;
}

function renderUsageInsights(
  totals: UsageTotals | null,
  aggregates: UsageAggregates,
  sessionCount: number,
  totalSessions: number,
) {
  if (!totals) {
    return nothing;
  }

  const avgTokens = aggregates.messages.total
    ? Math.round(totals.totalTokens / aggregates.messages.total)
    : 0;
  const avgCost = aggregates.messages.total ? totals.totalCost / aggregates.messages.total : 0;

  const topModels = aggregates.byModel.slice(0, 5).map((entry) => ({
    label: entry.model ?? "unknown",
    value: formatCost(entry.totals.totalCost),
    sub: `${formatTokens(entry.totals.totalTokens)} · ${entry.count} msgs`,
  }));
  const topProviders = aggregates.byProvider.slice(0, 5).map((entry) => ({
    label: entry.provider ?? "unknown",
    value: formatCost(entry.totals.totalCost),
    sub: `${formatTokens(entry.totals.totalTokens)} · ${entry.count} msgs`,
  }));
  const topTools = aggregates.tools.tools.slice(0, 6).map((tool) => ({
    label: tool.name,
    value: `${tool.count}`,
    sub: "calls",
  }));
  const topAgents = aggregates.byAgent.slice(0, 5).map((entry) => ({
    label: entry.agentId,
    value: formatCost(entry.totals.totalCost),
    sub: `${formatTokens(entry.totals.totalTokens)}`,
  }));
  const topChannels = aggregates.byChannel.slice(0, 5).map((entry) => ({
    label: entry.channel,
    value: formatCost(entry.totals.totalCost),
    sub: `${formatTokens(entry.totals.totalTokens)}`,
  }));

  return html`
    <section class="card" style="margin-top: 16px;">
      <div class="card-title">Usage Overview</div>
      <div class="usage-summary-grid">
        <div class="usage-summary-card">
          <div class="usage-summary-title">Messages</div>
          <div class="usage-summary-value">${aggregates.messages.total}</div>
          <div class="usage-summary-sub">
            ${aggregates.messages.user} user · ${aggregates.messages.assistant} assistant
          </div>
        </div>
        <div class="usage-summary-card">
          <div class="usage-summary-title">Tool Calls</div>
          <div class="usage-summary-value">${aggregates.tools.totalCalls}</div>
          <div class="usage-summary-sub">${aggregates.tools.uniqueTools} tools used</div>
        </div>
        <div class="usage-summary-card">
          <div class="usage-summary-title">Errors</div>
          <div class="usage-summary-value">${aggregates.messages.errors}</div>
          <div class="usage-summary-sub">${aggregates.messages.toolResults} tool results</div>
        </div>
        <div class="usage-summary-card">
          <div class="usage-summary-title">Avg Tokens / Msg</div>
          <div class="usage-summary-value">${formatTokens(avgTokens)}</div>
          <div class="usage-summary-sub">Across ${aggregates.messages.total || 0} messages</div>
        </div>
        <div class="usage-summary-card">
          <div class="usage-summary-title">Avg Cost / Msg</div>
          <div class="usage-summary-value">${formatCost(avgCost, 4)}</div>
          <div class="usage-summary-sub">${formatCost(totals.totalCost)} total</div>
        </div>
        <div class="usage-summary-card">
          <div class="usage-summary-title">Sessions</div>
          <div class="usage-summary-value">${sessionCount}</div>
          <div class="usage-summary-sub">of ${totalSessions} in range</div>
        </div>
      </div>
      <div class="usage-insights-grid">
        ${renderInsightList("Top Models", topModels, "No model data")}
        ${renderInsightList("Top Providers", topProviders, "No provider data")}
        ${renderInsightList("Top Tools", topTools, "No tool calls")}
        ${renderInsightList("Top Agents", topAgents, "No agent data")}
        ${renderInsightList("Top Channels", topChannels, "No channel data")}
      </div>
    </section>
  `;
}

function renderSessionsCard(
  sessions: UsageSessionEntry[],
  selectedSessions: string[],
  selectedDays: string[],
  isTokenMode: boolean,
  onSelectSession: (key: string, shiftKey: boolean) => void,
  visibleColumns: UsageColumnId[],
  totalSessions: number,
) {
  const showColumn = (id: UsageColumnId) => visibleColumns.includes(id);

  const buildSessionMeta = (s: UsageSessionEntry): string[] => {
    const parts: string[] = [];
    if (showColumn("channel") && s.channel) {
      parts.push(`channel:${s.channel}`);
    }
    if (showColumn("agent") && s.agentId) {
      parts.push(`agent:${s.agentId}`);
    }
    if (showColumn("provider") && (s.modelProvider || s.providerOverride)) {
      parts.push(`provider:${s.modelProvider ?? s.providerOverride}`);
    }
    if (showColumn("model") && s.model) {
      parts.push(`model:${s.model}`);
    }
    if (showColumn("messages") && s.usage?.messageCounts) {
      parts.push(`msgs:${s.usage.messageCounts.total}`);
    }
    if (showColumn("tools") && s.usage?.toolUsage) {
      parts.push(`tools:${s.usage.toolUsage.totalCalls}`);
    }
    if (showColumn("errors") && s.usage?.messageCounts) {
      parts.push(`errors:${s.usage.messageCounts.errors}`);
    }
    if (showColumn("duration") && s.usage?.durationMs) {
      parts.push(`dur:${formatDurationMs(s.usage.durationMs)}`);
    }
    return parts;
  };

  // Helper to get session value (filtered by days if selected)
  const getSessionValue = (s: UsageSessionEntry): number => {
    const usage = s.usage;
    if (!usage) {
      return 0;
    }

    // If days are selected and session has daily breakdown, compute filtered total
    if (selectedDays.length > 0 && usage.dailyBreakdown && usage.dailyBreakdown.length > 0) {
      const filteredDays = usage.dailyBreakdown.filter((d) => selectedDays.includes(d.date));
      return isTokenMode
        ? filteredDays.reduce((sum, d) => sum + d.tokens, 0)
        : filteredDays.reduce((sum, d) => sum + d.cost, 0);
    }

    // Otherwise use total
    return isTokenMode ? (usage.totalTokens ?? 0) : (usage.totalCost ?? 0);
  };

  const maxVal = Math.max(...sessions.map(getSessionValue), isTokenMode ? 1 : 0.001);

  return html`
    <div class="card sessions-card">
      <div class="sessions-card-header">
        <div class="card-title">Sessions</div>
        <div class="sessions-card-count">
          ${sessions.length} shown${totalSessions !== sessions.length ? ` · ${totalSessions} total` : ""}
        </div>
      </div>
      ${
        selectedSessions.length === 0
          ? html`
              <div class="sessions-card-hint">↓ Click a session to view timeline, conversation & context</div>
            `
          : nothing
      }
      ${
        sessions.length === 0
          ? html`
              <div class="muted" style="padding: 20px; text-align: center">No sessions in range</div>
            `
          : html`
          <div class="session-bars">
            ${sessions.slice(0, 50).map((s) => {
              const value = getSessionValue(s);
              const widthPct = (value / maxVal) * 100;
              const isSelected = selectedSessions.includes(s.key);
              const label = s.label || s.key;
              const displayLabel = label.length > 30 ? label.slice(0, 30) + "…" : label;
              const meta = buildSessionMeta(s);

              return html`
                <div
                  class="session-bar-row ${isSelected ? "selected" : ""}"
                  @click=${(e: MouseEvent) => onSelectSession(s.key, e.shiftKey)}
                  title="${s.key}"
                >
                  <div class="session-bar-label">
                    <div>${displayLabel}</div>
                    ${meta.length > 0 ? html`<div class="session-bar-meta">${meta.join(" · ")}</div>` : nothing}
                  </div>
                  <div class="session-bar-track">
                    <div class="session-bar-fill" style="width: ${widthPct.toFixed(1)}%"></div>
                  </div>
                  <div class="session-bar-value">${isTokenMode ? formatTokens(value) : formatCost(value)}</div>
                </div>
              `;
            })}
            ${sessions.length > 50 ? html`<div class="muted" style="padding: 8px; text-align: center; font-size: 11px;">+${sessions.length - 50} more</div>` : nothing}
          </div>
        `
      }
    </div>
  `;
}

function renderEmptyDetailState() {
  return html`
    <div class="session-detail-empty">
      <div class="session-detail-empty-title">Select a session to explore</div>
      <div class="session-detail-empty-desc">
        Click any session above to see detailed usage analytics, conversation history, and context
        breakdown.
      </div>
      <div class="session-detail-empty-features">
        <div class="session-detail-empty-feature">
          <span class="icon">📊</span>
          <span>Usage timeline</span>
        </div>
        <div class="session-detail-empty-feature">
          <span class="icon">💬</span>
          <span>Conversation logs</span>
        </div>
        <div class="session-detail-empty-feature">
          <span class="icon">⚙️</span>
          <span>Context weight</span>
        </div>
        <div class="session-detail-empty-feature">
          <span class="icon">🔧</span>
          <span>Skills & tools</span>
        </div>
      </div>
    </div>
  `;
}

function renderSessionSummary(session: UsageSessionEntry) {
  const usage = session.usage;
  if (!usage) {
    return html`
      <div class="muted">No usage data for this session.</div>
    `;
  }

  const formatTs = (ts?: number): string => (ts ? new Date(ts).toLocaleString() : "—");

  const badges: string[] = [];
  if (session.channel) {
    badges.push(`channel:${session.channel}`);
  }
  if (session.agentId) {
    badges.push(`agent:${session.agentId}`);
  }
  if (session.modelProvider || session.providerOverride) {
    badges.push(`provider:${session.modelProvider ?? session.providerOverride}`);
  }
  if (session.model) {
    badges.push(`model:${session.model}`);
  }

  const toolItems =
    usage.toolUsage?.tools.slice(0, 6).map((tool) => ({
      label: tool.name,
      value: `${tool.count}`,
      sub: "calls",
    })) ?? [];
  const modelItems =
    usage.modelUsage?.slice(0, 6).map((entry) => ({
      label: entry.model ?? "unknown",
      value: formatCost(entry.totals.totalCost),
      sub: `${formatTokens(entry.totals.totalTokens)}`,
    })) ?? [];

  return html`
    ${badges.length > 0 ? html`<div class="usage-badges">${badges.map((b) => html`<span class="usage-badge">${b}</span>`)}</div>` : nothing}
    <div class="session-summary-grid">
      <div class="session-summary-card">
        <div class="session-summary-title">Messages</div>
        <div class="session-summary-value">${usage.messageCounts?.total ?? 0}</div>
        <div class="session-summary-meta">${usage.messageCounts?.user ?? 0} user · ${usage.messageCounts?.assistant ?? 0} assistant</div>
      </div>
      <div class="session-summary-card">
        <div class="session-summary-title">Tool Calls</div>
        <div class="session-summary-value">${usage.toolUsage?.totalCalls ?? 0}</div>
        <div class="session-summary-meta">${usage.toolUsage?.uniqueTools ?? 0} tools</div>
      </div>
      <div class="session-summary-card">
        <div class="session-summary-title">Errors</div>
        <div class="session-summary-value">${usage.messageCounts?.errors ?? 0}</div>
        <div class="session-summary-meta">${usage.messageCounts?.toolResults ?? 0} tool results</div>
      </div>
      <div class="session-summary-card">
        <div class="session-summary-title">Duration</div>
        <div class="session-summary-value">${formatDurationMs(usage.durationMs)}</div>
        <div class="session-summary-meta">${formatTs(usage.firstActivity)} → ${formatTs(usage.lastActivity)}</div>
      </div>
    </div>
    <div class="usage-insights-grid" style="margin-top: 12px;">
      ${renderInsightList("Top Tools", toolItems, "No tool calls")}
      ${renderInsightList("Model Mix", modelItems, "No model data")}
    </div>
  `;
}

function renderSessionDetailPanel(
  session: UsageSessionEntry,
  timeSeries: { points: TimeSeriesPoint[] } | null,
  timeSeriesLoading: boolean,
  timeSeriesMode: "cumulative" | "per-turn",
  onTimeSeriesModeChange: (mode: "cumulative" | "per-turn") => void,
  startDate: string,
  endDate: string,
  selectedDays: string[],
  sessionLogs: SessionLogEntry[] | null,
  sessionLogsLoading: boolean,
  onClose: () => void,
) {
  const label = session.label || session.key;
  const displayLabel = label.length > 50 ? label.slice(0, 50) + "…" : label;
  const usage = session.usage;

  return html`
    <div class="card session-detail-panel">
      <div class="session-detail-header">
        <div class="session-detail-title">
          <button class="session-close-btn" @click=${onClose} title="Close session details">×</button>
          ${displayLabel}
        </div>
        <div class="session-detail-stats">
          ${
            usage
              ? html`
            <span><strong>${formatTokens(usage.totalTokens)}</strong> tokens</span>
            <span><strong>${formatCost(usage.totalCost)}</strong></span>
          `
              : nothing
          }
        </div>
      </div>
      <div class="session-detail-content">
        ${renderSessionSummary(session)}
        <div class="session-detail-row">
          ${renderTimeSeriesCompact(timeSeries, timeSeriesLoading, timeSeriesMode, onTimeSeriesModeChange, startDate, endDate, selectedDays)}
          ${
            session.contextWeight
              ? renderContextWeightCompact(session.contextWeight, usage)
              : html`
                  <div class="context-weight-compact">
                    <div class="muted" style="padding: 20px; text-align: center">No context data</div>
                  </div>
                `
          }
        </div>
        <div class="session-detail-bottom">
          ${renderSessionLogsCompact(sessionLogs, sessionLogsLoading)}
          ${
            session.contextWeight
              ? renderContextDetailsPanel(session.contextWeight)
              : html`
                  <div></div>
                `
          }
        </div>
      </div>
    </div>
  `;
}

function renderTimeSeriesCompact(
  timeSeries: { points: TimeSeriesPoint[] } | null,
  loading: boolean,
  mode: "cumulative" | "per-turn",
  onModeChange: (mode: "cumulative" | "per-turn") => void,
  startDate?: string,
  endDate?: string,
  selectedDays?: string[],
) {
  if (loading) {
    return html`
      <div class="session-timeseries-compact">
        <div class="muted" style="padding: 20px; text-align: center">Loading...</div>
      </div>
    `;
  }
  if (!timeSeries || timeSeries.points.length < 2) {
    return html`
      <div class="session-timeseries-compact">
        <div class="muted" style="padding: 20px; text-align: center">No timeline data</div>
      </div>
    `;
  }

  // Filter and recalculate (same logic as main function)
  let points = timeSeries.points;
  if (startDate || endDate || (selectedDays && selectedDays.length > 0)) {
    const startTs = startDate ? new Date(startDate + "T00:00:00").getTime() : 0;
    const endTs = endDate ? new Date(endDate + "T23:59:59").getTime() : Infinity;
    points = timeSeries.points.filter((p) => {
      if (p.timestamp < startTs || p.timestamp > endTs) {
        return false;
      }
      if (selectedDays && selectedDays.length > 0) {
        const d = new Date(p.timestamp);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        return selectedDays.includes(dateStr);
      }
      return true;
    });
  }
  if (points.length < 2) {
    return html`
      <div class="session-timeseries-compact">
        <div class="muted" style="padding: 20px; text-align: center">No data in range</div>
      </div>
    `;
  }
  let cumTokens = 0,
    cumCost = 0;
  points = points.map((p) => {
    cumTokens += p.totalTokens;
    cumCost += p.cost;
    return { ...p, cumulativeTokens: cumTokens, cumulativeCost: cumCost };
  });

  const width = 400,
    height = 80;
  const padding = { top: 10, right: 10, bottom: 20, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const isCumulative = mode === "cumulative";
  const maxValue = isCumulative
    ? Math.max(...points.map((p) => p.cumulativeTokens), 1)
    : Math.max(...points.map((p) => p.totalTokens), 1);
  const barWidth = Math.max(2, Math.min(8, (chartWidth / points.length) * 0.7));
  const barGap = Math.max(1, (chartWidth - barWidth * points.length) / (points.length - 1 || 1));

  return html`
    <div class="session-timeseries-compact">
      <div class="timeseries-header-row">
        <div class="card-title" style="font-size: 13px;">Usage Over Time</div>
        <div class="chart-toggle">
          <button class="toggle-btn ${isCumulative ? "active" : ""}" @click=${() => onModeChange("cumulative")}>Cumulative</button>
          <button class="toggle-btn ${!isCumulative ? "active" : ""}" @click=${() => onModeChange("per-turn")}>Per Turn</button>
        </div>
      </div>
      <svg viewBox="0 0 ${width} ${height + 15}" class="timeseries-svg" style="width: 100%; height: auto;">
        <!-- Y axis -->
        <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + chartHeight}" stroke="var(--border)" />
        <!-- X axis -->
        <line x1="${padding.left}" y1="${padding.top + chartHeight}" x2="${width - padding.right}" y2="${padding.top + chartHeight}" stroke="var(--border)" />
        <!-- Y axis labels -->
        <text x="${padding.left - 4}" y="${padding.top + 4}" text-anchor="end" class="axis-label" style="font-size: 9px; fill: var(--text-muted)">${formatTokens(maxValue)}</text>
        <text x="${padding.left - 4}" y="${padding.top + chartHeight}" text-anchor="end" class="axis-label" style="font-size: 9px; fill: var(--text-muted)">0</text>
        <!-- X axis labels (first and last) -->
        ${
          points.length > 0
            ? svg`
          <text x="${padding.left}" y="${padding.top + chartHeight + 12}" text-anchor="start" style="font-size: 8px; fill: var(--text-muted)">${new Date(points[0].timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</text>
          <text x="${width - padding.right}" y="${padding.top + chartHeight + 12}" text-anchor="end" style="font-size: 8px; fill: var(--text-muted)">${new Date(points[points.length - 1].timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</text>
        `
            : nothing
        }
        <!-- Bars -->
        ${points.map((p, i) => {
          const val = isCumulative ? p.cumulativeTokens : p.totalTokens;
          const x = padding.left + i * (barWidth + barGap);
          const barHeight = (val / maxValue) * chartHeight;
          const y = padding.top + chartHeight - barHeight;
          const date = new Date(p.timestamp);
          const tooltip = `${date.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}: ${formatTokens(val)} tokens`;
          return svg`<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" class="ts-bar" rx="1" style="cursor: pointer;"><title>${tooltip}</title></rect>`;
        })}
      </svg>
      <div class="timeseries-summary">${points.length} msgs · ${formatTokens(cumTokens)} · ${formatCost(cumCost)}</div>
    </div>
  `;
}

function renderContextWeightCompact(
  contextWeight: UsageSessionEntry["contextWeight"],
  usage: UsageSessionEntry["usage"],
) {
  if (!contextWeight) {
    return nothing;
  }
  const systemTokens = charsToTokens(contextWeight.systemPrompt.chars);
  const skillsTokens = charsToTokens(contextWeight.skills.promptChars);
  const toolsTokens = charsToTokens(
    contextWeight.tools.listChars + contextWeight.tools.schemaChars,
  );
  const filesTokens = charsToTokens(
    contextWeight.injectedWorkspaceFiles.reduce((sum, f) => sum + f.injectedChars, 0),
  );
  const totalContextTokens = systemTokens + skillsTokens + toolsTokens + filesTokens;

  let contextPct = "";
  if (usage && usage.totalTokens > 0) {
    const inputTokens = usage.input + usage.cacheRead;
    if (inputTokens > 0) {
      contextPct = `~${Math.min((totalContextTokens / inputTokens) * 100, 100).toFixed(0)}% of input`;
    }
  }

  return html`
    <div class="context-weight-compact">
      <div class="card-title" style="font-size: 13px;">Context Weight</div>
      <p class="context-weight-desc">${contextPct || "Base context per message"}</p>
      <div class="context-stacked-bar">
        <div class="context-segment system" style="width: ${pct(systemTokens, totalContextTokens).toFixed(1)}%" title="System: ~${formatTokens(systemTokens)}"></div>
        <div class="context-segment skills" style="width: ${pct(skillsTokens, totalContextTokens).toFixed(1)}%" title="Skills: ~${formatTokens(skillsTokens)}"></div>
        <div class="context-segment tools" style="width: ${pct(toolsTokens, totalContextTokens).toFixed(1)}%" title="Tools: ~${formatTokens(toolsTokens)}"></div>
        <div class="context-segment files" style="width: ${pct(filesTokens, totalContextTokens).toFixed(1)}%" title="Files: ~${formatTokens(filesTokens)}"></div>
      </div>
      <div class="context-legend">
        <span class="legend-item"><span class="legend-dot system"></span>Sys ~${formatTokens(systemTokens)}</span>
        <span class="legend-item"><span class="legend-dot skills"></span>Skills ~${formatTokens(skillsTokens)}</span>
        <span class="legend-item"><span class="legend-dot tools"></span>Tools ~${formatTokens(toolsTokens)}</span>
        <span class="legend-item"><span class="legend-dot files"></span>Files ~${formatTokens(filesTokens)}</span>
      </div>
      <div class="context-total">Total: ~${formatTokens(totalContextTokens)}</div>
    </div>
  `;
}

function renderContextDetailsPanel(contextWeight: NonNullable<UsageSessionEntry["contextWeight"]>) {
  return html`
    <div class="context-details-panel">
      ${
        contextWeight.skills.entries.length > 0
          ? html`
        <details class="context-details" open>
          <summary>Skills (${contextWeight.skills.entries.length})</summary>
          <div class="context-list">
            ${contextWeight.skills.entries
              .toSorted((a, b) => b.blockChars - a.blockChars)
              .slice(0, 10)
              .map(
                (s) => html`
              <div class="context-list-item"><span class="mono">${s.name}</span><span class="muted">~${formatTokens(charsToTokens(s.blockChars))} tokens</span></div>
            `,
              )}
          </div>
        </details>
      `
          : nothing
      }
      ${
        contextWeight.tools.entries.length > 0
          ? html`
        <details class="context-details">
          <summary>Tools (${contextWeight.tools.entries.length})</summary>
          <div class="context-list">
            ${contextWeight.tools.entries
              .toSorted((a, b) => b.summaryChars + b.schemaChars - (a.summaryChars + a.schemaChars))
              .slice(0, 10)
              .map(
                (t) => html`
              <div class="context-list-item"><span class="mono">${t.name}</span><span class="muted">~${formatTokens(charsToTokens(t.summaryChars + t.schemaChars))} tokens</span></div>
            `,
              )}
          </div>
        </details>
      `
          : nothing
      }
      ${
        contextWeight.injectedWorkspaceFiles.length > 0
          ? html`
        <details class="context-details">
          <summary>Files (${contextWeight.injectedWorkspaceFiles.length})</summary>
          <div class="context-list">
            ${contextWeight.injectedWorkspaceFiles
              .toSorted((a, b) => b.injectedChars - a.injectedChars)
              .map(
                (f) => html`
              <div class="context-list-item"><span class="mono">${f.name}</span><span class="muted">~${formatTokens(charsToTokens(f.injectedChars))} tokens</span></div>
            `,
              )}
          </div>
        </details>
      `
          : nothing
      }
    </div>
  `;
}

function renderSessionLogsCompact(logs: SessionLogEntry[] | null, loading: boolean) {
  if (loading) {
    return html`
      <div class="session-logs-compact">
        <div class="session-logs-header">Conversation</div>
        <div class="muted" style="padding: 20px; text-align: center">Loading...</div>
      </div>
    `;
  }
  if (!logs || logs.length === 0) {
    return html`
      <div class="session-logs-compact">
        <div class="session-logs-header">Conversation</div>
        <div class="muted" style="padding: 20px; text-align: center">No messages</div>
      </div>
    `;
  }

  return html`
    <div class="session-logs-compact">
      <div class="session-logs-header">Conversation <span style="font-weight: normal; color: var(--text-muted);">(${logs.length} messages)</span></div>
      <div class="session-logs-list">
        ${logs.map(
          (log) => html`
          <div class="session-log-entry ${log.role}">
            <div class="session-log-meta">
              <span class="session-log-role">${log.role === "user" ? "You" : "Assistant"}</span>
              <span>${new Date(log.timestamp).toLocaleString()}</span>
              ${log.tokens ? html`<span>${formatTokens(log.tokens)}</span>` : nothing}
            </div>
            <div class="session-log-content">${log.content}</div>
          </div>
        `,
        )}
      </div>
    </div>
  `;
}

export function renderUsage(props: UsageProps) {
  // Show loading skeleton if loading and no data yet
  if (props.loading && !props.totals) {
    // Use inline styles since main stylesheet hasn't loaded yet on initial render
    return html`
      <style>
        @keyframes initial-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes initial-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      </style>
      <section class="card">
        <div class="row" style="justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
          <div style="flex: 1; min-width: 250px;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 2px;">
              <div class="card-title" style="margin: 0;">Token Usage</div>
              <span style="
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 4px 10px;
                background: rgba(255, 77, 77, 0.1);
                border-radius: 4px;
                font-size: 12px;
                color: #ff4d4d;
              ">
                <span style="
                  width: 10px;
                  height: 10px;
                  border: 2px solid #ff4d4d;
                  border-top-color: transparent;
                  border-radius: 50%;
                  animation: initial-spin 0.6s linear infinite;
                "></span>
                Loading
              </span>
            </div>
          </div>
          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
            <div style="display: flex; gap: 8px; align-items: center;">
              <input type="date" .value=${props.startDate} disabled style="padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); font-size: 13px; opacity: 0.6;" />
              <span style="color: var(--text-muted);">to</span>
              <input type="date" .value=${props.endDate} disabled style="padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); font-size: 13px; opacity: 0.6;" />
            </div>
          </div>
        </div>
      </section>
    `;
  }

  const isTokenMode = props.chartMode === "tokens";
  const hasQuery = props.query.trim().length > 0;

  // Sort sessions by tokens or cost depending on mode
  const sortedSessions = [...props.sessions].toSorted((a, b) => {
    const valA = isTokenMode ? (a.usage?.totalTokens ?? 0) : (a.usage?.totalCost ?? 0);
    const valB = isTokenMode ? (b.usage?.totalTokens ?? 0) : (b.usage?.totalCost ?? 0);
    return valB - valA;
  });

  // Filter sessions by selected days
  const dayFilteredSessions =
    props.selectedDays.length > 0
      ? sortedSessions.filter((s) => {
          if (s.usage?.activityDates?.length) {
            return s.usage.activityDates.some((d) => props.selectedDays.includes(d));
          }
          if (!s.updatedAt) {
            return false;
          }
          const d = new Date(s.updatedAt);
          const sessionDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          return props.selectedDays.includes(sessionDate);
        })
      : sortedSessions;

  // Filter sessions by query (client-side)
  const queryResult = filterSessionsByQuery(dayFilteredSessions, props.query);
  const filteredSessions = queryResult.sessions;
  const queryWarnings = queryResult.warnings;
  const querySuggestions = buildQuerySuggestions(props.query, sortedSessions, props.aggregates);

  // Get first selected session for detail view (timeseries, logs)
  const primarySelectedEntry =
    props.selectedSessions.length === 1
      ? filteredSessions.find((s) => s.key === props.selectedSessions[0])
      : null;

  // Compute totals from sessions
  const computeSessionTotals = (sessions: UsageSessionEntry[]): UsageTotals => {
    return sessions.reduce(
      (acc, s) => {
        if (s.usage) {
          acc.input += s.usage.input;
          acc.output += s.usage.output;
          acc.cacheRead += s.usage.cacheRead;
          acc.cacheWrite += s.usage.cacheWrite;
          acc.totalTokens += s.usage.totalTokens;
          acc.totalCost += s.usage.totalCost;
          acc.inputCost += s.usage.inputCost ?? 0;
          acc.outputCost += s.usage.outputCost ?? 0;
          acc.cacheReadCost += s.usage.cacheReadCost ?? 0;
          acc.cacheWriteCost += s.usage.cacheWriteCost ?? 0;
          acc.missingCostEntries += s.usage.missingCostEntries ?? 0;
        }
        return acc;
      },
      {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        totalCost: 0,
        inputCost: 0,
        outputCost: 0,
        cacheReadCost: 0,
        cacheWriteCost: 0,
        missingCostEntries: 0,
      },
    );
  };

  // Compute totals from daily data for selected days (more accurate than session totals)
  const computeDailyTotals = (days: string[]): UsageTotals => {
    const matchingDays = props.costDaily.filter((d) => days.includes(d.date));
    return matchingDays.reduce(
      (acc, d) => {
        acc.input += d.input;
        acc.output += d.output;
        acc.cacheRead += d.cacheRead;
        acc.cacheWrite += d.cacheWrite;
        acc.totalTokens += d.totalTokens;
        acc.totalCost += d.totalCost;
        acc.inputCost += d.inputCost ?? 0;
        acc.outputCost += d.outputCost ?? 0;
        acc.cacheReadCost += d.cacheReadCost ?? 0;
        acc.cacheWriteCost += d.cacheWriteCost ?? 0;
        return acc;
      },
      {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        totalCost: 0,
        inputCost: 0,
        outputCost: 0,
        cacheReadCost: 0,
        cacheWriteCost: 0,
        missingCostEntries: 0,
      },
    );
  };

  // Compute display totals and count based on filters
  let displayTotals: UsageTotals | null;
  let displaySessionCount: number;
  const totalSessions = sortedSessions.length;

  if (props.selectedSessions.length > 0) {
    // Sessions selected - compute totals from selected sessions
    const selectedSessionEntries = filteredSessions.filter((s) =>
      props.selectedSessions.includes(s.key),
    );
    displayTotals = computeSessionTotals(selectedSessionEntries);
    displaySessionCount = selectedSessionEntries.length;
  } else if (props.selectedDays.length > 0) {
    // Days selected - use daily aggregates for accurate per-day totals
    displayTotals = computeDailyTotals(props.selectedDays);
    displaySessionCount = filteredSessions.length;
  } else if (hasQuery) {
    displayTotals = computeSessionTotals(filteredSessions);
    displaySessionCount = filteredSessions.length;
  } else {
    // No filters - show all
    displayTotals = props.totals;
    displaySessionCount = totalSessions;
  }

  const aggregateSessions =
    props.selectedSessions.length > 0
      ? filteredSessions.filter((s) => props.selectedSessions.includes(s.key))
      : hasQuery
        ? filteredSessions
        : props.selectedDays.length > 0
          ? dayFilteredSessions
          : sortedSessions;
  const activeAggregates = buildAggregatesFromSessions(aggregateSessions, props.aggregates);

  const columnOptions: Array<{ id: UsageColumnId; label: string }> = [
    { id: "channel", label: "Channel" },
    { id: "agent", label: "Agent" },
    { id: "provider", label: "Provider" },
    { id: "model", label: "Model" },
    { id: "messages", label: "Messages" },
    { id: "tools", label: "Tools" },
    { id: "errors", label: "Errors" },
    { id: "duration", label: "Duration" },
  ];

  // Filter daily chart data if sessions are selected
  const filteredDaily =
    props.selectedSessions.length > 0
      ? (() => {
          const selectedEntries = filteredSessions.filter((s) =>
            props.selectedSessions.includes(s.key),
          );
          const allActivityDates = new Set<string>();
          for (const entry of selectedEntries) {
            for (const date of entry.usage?.activityDates ?? []) {
              allActivityDates.add(date);
            }
          }
          return allActivityDates.size > 0
            ? props.costDaily.filter((d) => allActivityDates.has(d.date))
            : props.costDaily;
        })()
      : props.costDaily;

  return html`
    <style>${usageStylesString}</style>

    <section class="card">
      <div class="row" style="justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
        <div style="flex: 1; min-width: 250px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="card-title" style="margin: 0;">Token Usage</div>
            ${
              props.loading
                ? html`
                    <span class="usage-refresh-indicator">Loading</span>
                  `
                : nothing
            }
          </div>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
          ${
            displayTotals
              ? html`
            <div style="display: flex; align-items: baseline; gap: 16px; font-size: 14px;">
              <span><strong style="font-size: 18px;">${formatTokens(displayTotals.totalTokens)}</strong> tokens</span>
              <span><strong style="font-size: 18px;">${formatCost(displayTotals.totalCost)}</strong> cost</span>
              <span class="muted">${displaySessionCount} session${displaySessionCount !== 1 ? "s" : ""}</span>
            </div>
          `
              : nothing
          }
          <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
            ${renderFilterChips(
              props.selectedDays,
              props.selectedSessions,
              props.sessions,
              props.onClearDays,
              props.onClearSessions,
              props.onClearFilters,
            )}
            <div class="usage-filters-inline">
              <input
                type="date"
                .value=${props.startDate}
                title="Start Date"
                @change=${(e: Event) => props.onStartDateChange((e.target as HTMLInputElement).value)}
              />
              <span style="color: var(--text-muted);">to</span>
              <input
                type="date"
                .value=${props.endDate}
                title="End Date"
                @change=${(e: Event) => props.onEndDateChange((e.target as HTMLInputElement).value)}
              />
              <div class="chart-toggle">
                <button
                  class="toggle-btn ${isTokenMode ? "active" : ""}"
                  @click=${() => props.onChartModeChange("tokens")}
                >
                  Tokens
                </button>
                <button
                  class="toggle-btn ${!isTokenMode ? "active" : ""}"
                  @click=${() => props.onChartModeChange("cost")}
                >
                  Cost
                </button>
              </div>
              <button class="btn btn-sm" @click=${props.onRefresh} ?disabled=${props.loading}>↻</button>
            </div>
          </div>
        </div>
      </div>

      <div style="margin-top: 12px;">
        <div class="usage-query-bar">
          <input
            class="usage-query-input"
            type="text"
            .value=${props.query}
            placeholder="Filter sessions (e.g. agent:main model:gpt-4o has:errors minTokens:2000)"
            @input=${(e: Event) => props.onQueryChange((e.target as HTMLInputElement).value)}
          />
          ${
            props.query.trim()
              ? html`<button class="btn btn-sm" @click=${props.onClearQuery}>Clear</button>`
              : nothing
          }
          <details class="usage-columns-panel">
            <summary>View</summary>
            <div class="usage-columns-list">
              ${columnOptions.map(
                (opt) => html`
                  <label class="usage-columns-item">
                    <input
                      type="checkbox"
                      .checked=${props.visibleColumns.includes(opt.id)}
                      @change=${() => props.onToggleColumn(opt.id)}
                    />
                    <span>${opt.label}</span>
                  </label>
                `,
              )}
            </div>
          </details>
          <span class="usage-query-hint">
            ${
              hasQuery
                ? `${filteredSessions.length} of ${totalSessions} sessions match`
                : `${totalSessions} sessions in range`
            }
          </span>
        </div>
        ${
          querySuggestions.length > 0
            ? html`
                <div class="usage-query-suggestions">
                  ${querySuggestions.map(
                    (suggestion) => html`
                      <button
                        class="usage-query-suggestion"
                        @click=${() =>
                          props.onQueryChange(
                            applySuggestionToQuery(props.query, suggestion.value),
                          )}
                      >
                        ${suggestion.label}
                      </button>
                    `,
                  )}
                </div>
              `
            : nothing
        }
        ${
          queryWarnings.length > 0
            ? html`
                <div class="callout warning" style="margin-top: 8px;">
                  ${queryWarnings.join(" · ")}
                </div>
              `
            : nothing
        }
      </div>

      ${
        props.error
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
          : nothing
      }

      ${
        props.sessionsLimitReached
          ? html`
              <div class="callout warning" style="margin-top: 12px">
                Showing first 1,000 sessions. Narrow date range for complete results.
              </div>
            `
          : nothing
      }
    </section>

    ${renderUsageInsights(displayTotals, activeAggregates, displaySessionCount, totalSessions)}

    <!-- Two-column layout: Daily+Breakdown on left, Sessions on right -->
    <div class="usage-grid">
      <div class="usage-grid-left">
        <div class="card usage-left-card">
          ${renderDailyChartCompact(
            filteredDaily,
            props.selectedDays,
            props.chartMode,
            props.onSelectDay,
          )}
          ${displayTotals ? renderCostBreakdownCompact(displayTotals, props.chartMode) : nothing}
        </div>
      </div>
      <div class="usage-grid-right">
        ${renderSessionsCard(
          filteredSessions,
          props.selectedSessions,
          props.selectedDays,
          isTokenMode,
          props.onSelectSession,
          props.visibleColumns,
          totalSessions,
        )}
      </div>
    </div>

    <!-- Session Detail Panel (when selected) or Empty State -->
    ${
      primarySelectedEntry
        ? renderSessionDetailPanel(
            primarySelectedEntry,
            props.timeSeries,
            props.timeSeriesLoading,
            props.timeSeriesMode,
            props.onTimeSeriesModeChange,
            props.startDate,
            props.endDate,
            props.selectedDays,
            props.sessionLogs,
            props.sessionLogsLoading,
            props.onClearSessions,
          )
        : renderEmptyDetailState()
    }
  `;
}
