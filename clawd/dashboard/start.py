#!/usr/bin/env python3
"""
Liam's Dashboard Server
Data analytics platform with Technical Brutalism design.
"""

import json
import re
import sqlite3
import subprocess
import threading
import time
from datetime import datetime
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

# === CONFIGURATION ===
BASE_DIR = Path('/home/liam/clawd')
DASHBOARD_DIR = BASE_DIR / 'dashboard'
DB_PATH = DASHBOARD_DIR / 'dashboard.db'
STATIC_DIR = DASHBOARD_DIR / 'static'
TEMPLATES_DIR = DASHBOARD_DIR / 'templates'
PORT = 8080
METRICS_INTERVAL = 5  # seconds between metric collection
AUTH_USERNAME = 'liam'  # Basic auth username
AUTH_PASSWORD = 'dashboard'  # Change this!

# === DATABASE ===
_db_local = threading.local()

def get_db():
    """Get thread-local database connection."""
    if not hasattr(_db_local, 'conn'):
        _db_local.conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
        _db_local.conn.row_factory = sqlite3.Row
        _db_local.conn.execute('PRAGMA journal_mode=WAL')
        _db_local.conn.execute('PRAGMA busy_timeout=5000')
    return _db_local.conn

def init_db():
    """Initialize database from schema."""
    schema_path = DASHBOARD_DIR / 'schema.sql'
    if schema_path.exists():
        conn = get_db()
        conn.executescript(schema_path.read_text())
        conn.commit()

# === DATA COLLECTORS ===
def get_gateway_status():
    """Check Clawdbot gateway status."""
    try:
        result = subprocess.run(
            ['systemctl', '--user', 'is-active', 'clawdbot-gateway'],
            capture_output=True, text=True, timeout=2
        )
        status = result.stdout.strip()
        if status == 'active':
            return {'status': 'running', 'color': '#00cc66'}
        elif status == 'inactive':
            return {'status': 'stopped', 'color': '#ff4444'}
        else:
            return {'status': status, 'color': '#ffaa00'}
    except Exception:
        return {'status': 'unknown', 'color': '#666666'}

def get_system_resources():
    """Get CPU, RAM, Disk usage."""
    try:
        # CPU (simplified - instant reading)
        with open('/proc/stat', 'r') as f:
            line = f.readline()
        parts = line.split()
        cpu_total = sum(int(x) for x in parts[1:5])
        cpu_idle = int(parts[4])
        cpu_percent = round(((cpu_total - cpu_idle) / cpu_total) * 100, 1)

        # Memory
        with open('/proc/meminfo', 'r') as f:
            meminfo = {}
            for line in f:
                if ':' in line:
                    key, val = line.split(':')
                    meminfo[key.strip()] = val.strip()
        mem_total = int(meminfo.get('MemTotal', '0').split()[0])
        mem_available = int(meminfo.get('MemAvailable', '0').split()[0])
        mem_percent = round(((mem_total - mem_available) / mem_total) * 100, 1)
        mem_total_gb = round(mem_total / 1024 / 1024, 1)

        # Disk
        result = subprocess.run(['df', '-h', '/home'], capture_output=True, text=True, timeout=2)
        disk_lines = result.stdout.split('\n')
        if len(disk_lines) > 1:
            disk_info = disk_lines[1].split()
            disk_percent = int(disk_info[4].replace('%', '')) if len(disk_info) > 4 else 0
            disk_total = disk_info[1] if len(disk_info) > 1 else 'N/A'
        else:
            disk_percent, disk_total = 0, 'N/A'

        return {
            'cpu_percent': cpu_percent,
            'mem_percent': mem_percent,
            'mem_total_gb': mem_total_gb,
            'disk_percent': disk_percent,
            'disk_total': disk_total
        }
    except Exception as e:
        return {
            'cpu_percent': 0, 'mem_percent': 0, 'mem_total_gb': 0,
            'disk_percent': 0, 'disk_total': 'N/A', 'error': str(e)
        }

def get_sessions():
    """Get active Clawdbot sessions with details."""
    sessions = []
    agents_dir = Path('/home/liam/.clawdbot/agents')
    if not agents_dir.exists():
        return sessions

    for agent_dir in agents_dir.iterdir():
        if not agent_dir.is_dir():
            continue
        sessions_file = agent_dir / 'sessions' / 'sessions.json'
        if not sessions_file.exists():
            continue
        try:
            data = json.loads(sessions_file.read_text())
            for key, info in data.items():
                if isinstance(info, dict):
                    updated_at = info.get('updatedAt')
                    if updated_at:
                        # Convert Unix timestamp to relative time
                        try:
                            ts = int(updated_at) / 1000
                            delta = time.time() - ts
                            if delta < 60:
                                relative = f"{int(delta)}s ago"
                            elif delta < 3600:
                                relative = f"{int(delta/60)}m ago"
                            else:
                                relative = f"{int(delta/3600)}h ago"
                        except (ValueError, TypeError):
                            relative = "unknown"
                    else:
                        relative = "unknown"

                    sessions.append({
                        'agent': agent_dir.name,
                        'session_key': key,
                        'updated': relative,
                        'channel': key.split(':')[1] if ':' in key else 'main'
                    })
        except Exception:
            continue
    return sessions

def get_subagents():
    """Get active subagent runs."""
    subagents = []
    runs_file = Path('/home/liam/.clawdbot/subagents/runs.json')
    if not runs_file.exists():
        return subagents
    try:
        data = json.loads(runs_file.read_text())
        runs = data.get('runs', {})
        for run_id, info in runs.items():
            if isinstance(info, dict):
                status = 'running'
                if info.get('endedAt'):
                    outcome = info.get('outcome', {})
                    status = outcome.get('status', 'completed')

                subagents.append({
                    'run_id': run_id[:8],  # Truncate for display
                    'task': info.get('task', 'Unknown task')[:50],  # Truncate
                    'status': status,
                    'parent': info.get('requesterDisplayKey', 'main'),
                    'label': info.get('label', '')
                })
    except Exception:
        pass
    return subagents

def parse_evolution_queue():
    """Parse EVOLUTION-QUEUE.md into structured data."""
    queue_path = BASE_DIR / 'EVOLUTION-QUEUE.md'
    if not queue_path.exists():
        return []

    content = queue_path.read_text()
    projects = []
    current_section = None

    for line in content.split('\n'):
        line_stripped = line.strip()

        # Detect section headers
        if line_stripped.startswith('## '):
            section_text = line_stripped[3:].lower()
            if 'pending' in section_text:
                current_section = 'pending'
            elif 'paused' in section_text:
                current_section = 'paused'
            elif 'approved' in section_text:
                current_section = 'approved'
            else:
                current_section = None

        # Detect queue items
        elif current_section and line_stripped.startswith('### '):
            entry_text = line_stripped[4:].strip()
            # Extract ID like [2026-01-27-046]
            match = re.match(r'\[([^\]]+)\]\s*(.+)', entry_text)
            if match:
                item_id = match.group(1)
                title = match.group(2).strip()
            else:
                item_id = entry_text[:20]
                title = entry_text

            # Check for [RESOLVED] tag
            status = current_section
            if '[RESOLVED]' in title.upper():
                status = 'resolved'
                title = title.replace('[RESOLVED]', '').replace('[resolved]', '').strip()

            projects.append({
                'id': item_id,
                'title': title,
                'status': status,
                'section': current_section
            })

    return projects

def get_queue_health():
    """Get queue health status with staleness indicators."""
    queue_path = BASE_DIR / 'EVOLUTION-QUEUE.md'
    archive_path = BASE_DIR / 'EVOLUTION-QUEUE-ARCHIVE.md'
    
    health = {
        'queue_exists': queue_path.exists(),
        'archive_exists': archive_path.exists(),
        'queue_entries': 0,
        'archive_entries': 0,
        'stale_entries': [],
        'resolved_in_queue': [],
        'status': 'healthy',
        'last_modified': None
    }
    
    if not queue_path.exists():
        health['status'] = 'missing'
        return health
    
    # Get file modification time
    mtime = queue_path.stat().st_mtime
    health['last_modified'] = datetime.fromtimestamp(mtime).isoformat()
    
    # Parse queue entries with age calculation
    content = queue_path.read_text()
    now = datetime.now()
    entries = []
    
    for line in content.split('\n'):
        line_stripped = line.strip()
        if line_stripped.startswith('### ['):
            # Extract date from ID like [2026-01-27-046]
            match = re.match(r'### \[(\d{4}-\d{2}-\d{2})-\d+\]\s*(.+)', line_stripped)
            if match:
                date_str = match.group(1)
                title = match.group(2).strip()
                try:
                    entry_date = datetime.strptime(date_str, '%Y-%m-%d')
                    age_hours = (now - entry_date).total_seconds() / 3600
                    is_stale = age_hours > 6  # 6-hour staleness threshold
                    is_resolved = '[RESOLVED]' in title.upper()
                    
                    entry = {
                        'id': f"{date_str}-{match.group(0).split(']')[0].split('-')[-1]}",
                        'title': title[:60],
                        'date': date_str,
                        'age_hours': round(age_hours, 1),
                        'is_stale': is_stale,
                        'is_resolved': is_resolved
                    }
                    entries.append(entry)
                    
                    if is_stale and not is_resolved:
                        health['stale_entries'].append(entry)
                    if is_resolved:
                        health['resolved_in_queue'].append(entry)
                except ValueError:
                    pass
    
    health['queue_entries'] = len(entries)
    
    # Count archive entries
    if archive_path.exists():
        archive_content = archive_path.read_text()
        health['archive_entries'] = archive_content.count('### [')
    
    # Determine overall status
    if health['resolved_in_queue']:
        health['status'] = 'needs_cleanup'
    elif len(health['stale_entries']) > 3:
        health['status'] = 'stale'
    elif health['stale_entries']:
        health['status'] = 'warning'
    else:
        health['status'] = 'healthy'
    
    return health

# === METRIC RECORDING ===
def record_metrics():
    """Record current metrics to database."""
    try:
        conn = get_db()
        gateway = get_gateway_status()
        resources = get_system_resources()
        sessions = get_sessions()

        conn.execute('''
            INSERT INTO metrics (cpu_percent, mem_percent, mem_total_gb,
                                 disk_percent, disk_total, gateway_status, active_sessions)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            resources['cpu_percent'],
            resources['mem_percent'],
            resources['mem_total_gb'],
            resources['disk_percent'],
            resources['disk_total'],
            gateway['status'],
            len(sessions)
        ))
        conn.commit()
    except Exception as e:
        print(f"Error recording metrics: {e}")

def metrics_collector():
    """Background thread to collect metrics periodically."""
    while True:
        record_metrics()
        time.sleep(METRICS_INTERVAL)

# === HTTP HANDLER ===
class DashboardHandler(SimpleHTTPRequestHandler):
    """HTTP request handler with JSON API support."""

    def send_json(self, data, status=200):
        """Send JSON response."""
        body = json.dumps(data, default=str).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(body))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, path, content_type):
        """Send static file."""
        try:
            content = path.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', len(content))
            self.end_headers()
            self.wfile.write(content)
        except FileNotFoundError:
            self.send_error(404, 'File not found')

    def do_GET(self):
        """Handle GET requests."""
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        # === STATIC FILES ===
        if path == '/' or path == '/index.html':
            self.send_file(TEMPLATES_DIR / 'index.html', 'text/html')
        elif path == '/static/style.css':
            self.send_file(STATIC_DIR / 'style.css', 'text/css')
        elif path == '/static/app.js':
            self.send_file(STATIC_DIR / 'app.js', 'application/javascript')

        # === JSON APIs ===
        elif path == '/api/data':
            # Main dashboard data
            data = {
                'gateway': get_gateway_status(),
                'resources': get_system_resources(),
                'sessions': get_sessions(),
                'subagents': get_subagents(),
                'queue': parse_evolution_queue(),
                'timestamp': datetime.now().isoformat()
            }
            self.send_json(data)

        elif path == '/api/metrics/recent':
            # Recent metrics for charts
            limit = int(query.get('limit', ['60'])[0])
            conn = get_db()
            rows = conn.execute('''
                SELECT timestamp, cpu_percent, mem_percent, disk_percent
                FROM metrics
                ORDER BY timestamp DESC
                LIMIT ?
            ''', (limit,)).fetchall()

            data = [
                {
                    'timestamp': row['timestamp'],
                    'cpu_percent': row['cpu_percent'],
                    'mem_percent': row['mem_percent'],
                    'disk_percent': row['disk_percent']
                }
                for row in reversed(rows)  # Oldest first for charts
            ]
            self.send_json(data)

        elif path == '/api/metrics/stats':
            # Aggregate statistics
            conn = get_db()
            row = conn.execute('''
                SELECT
                    AVG(cpu_percent) as avg_cpu,
                    MAX(cpu_percent) as max_cpu,
                    AVG(mem_percent) as avg_mem,
                    MAX(mem_percent) as max_mem,
                    COUNT(*) as count
                FROM metrics
                WHERE timestamp > datetime('now', '-1 hour')
            ''').fetchone()

            self.send_json({
                'avg_cpu': round(row['avg_cpu'] or 0, 1),
                'max_cpu': round(row['max_cpu'] or 0, 1),
                'avg_mem': round(row['avg_mem'] or 0, 1),
                'max_mem': round(row['max_mem'] or 0, 1),
                'samples': row['count']
            })

        elif path == '/api/export/csv':
            # Export metrics as CSV
            conn = get_db()
            rows = conn.execute('''
                SELECT timestamp, cpu_percent, mem_percent, disk_percent,
                       gateway_status, active_sessions
                FROM metrics
                ORDER BY timestamp DESC
                LIMIT 10000
            ''').fetchall()

            csv_lines = ['timestamp,cpu_percent,mem_percent,disk_percent,gateway_status,active_sessions']
            for row in rows:
                csv_lines.append(f"{row['timestamp']},{row['cpu_percent']},{row['mem_percent']},{row['disk_percent']},{row['gateway_status']},{row['active_sessions']}")

            body = '\n'.join(csv_lines).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/csv')
            self.send_header('Content-Disposition', 'attachment; filename="metrics.csv"')
            self.send_header('Content-Length', len(body))
            self.end_headers()
            self.wfile.write(body)

        elif path == '/api/queue-health':
            # Queue health status with staleness indicators
            health = get_queue_health()
            self.send_json(health)

        else:
            self.send_error(404, 'Not found')

    def log_message(self, format, *args):
        """Suppress default logging."""
        pass  # Comment this out for debugging

# === MAIN ===
def main():
    """Start the dashboard server."""
    print(f"\n{'='*60}")
    print("Liam's Dashboard")
    print(f"{'='*60}")

    # Initialize database
    init_db()
    print(f"Database: {DB_PATH}")

    # Start metrics collector in background
    collector = threading.Thread(target=metrics_collector, daemon=True)
    collector.start()
    print(f"Metrics collector started (interval: {METRICS_INTERVAL}s)")

    # Start HTTP server
    server = HTTPServer(('0.0.0.0', PORT), DashboardHandler)
    print(f"Server: http://localhost:{PORT}")
    print(f"{'='*60}\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        server.shutdown()

if __name__ == '__main__':
    main()
