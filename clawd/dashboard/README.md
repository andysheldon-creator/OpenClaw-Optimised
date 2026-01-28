# Liam's Home Base Dashboard

## Overview
Enhanced home base dashboard for system monitoring, projects, and tasks.

## Quick Start

**Dashboard is running at http://localhost:8080**

To start manually:
```bash
cd /home/liam/clawd/dashboard
python3 start.py
```

## Access
- **WSL2 terminal:** http://localhost:8080
- **From Windows browser:** http://172.26.9.77:8080
- **Note:** WSL IP may change after restart. Check with: `ip route get 1.1.1.1 | grep -oP 'src \K\S+'`

## Features

### System Health (Left Sidebar)
- **Gateway Status**: Running/Stopped with color indicator
- **CPU Usage**: Real-time CPU percentage
- **RAM Usage**: Memory percentage and total GB
- **Disk Usage**: Disk percentage and total space
- **Active Sessions**: Number of active Clawdbot sessions

### Project & Task Tracking (Main Content)
- **Evolution Queue**: Pending projects with status
- **Active Tasks**: Progress bars for in-progress tasks
- **Live Updates**: Auto-refreshes every 30 seconds
- **Real-time Data**: Regenerates on each request

### Color Coding
- 🔴 **Red**: Stopped, Pending, High Usage
- 🟡 **Yellow**: Paused, Unknown, Medium Usage
- 🟢 **Green**: Running, Active, Healthy
- 🔵 **Blue**: Approved

### Layout
- **Responsive Grid**: Adapts to screen size
- **Left Sidebar**: System health and quick stats
- **Main Content**: Projects and tasks
- **Dark Theme**: Easy on the eyes

```bash
# Copy service file
sudo cp /home/liam/clawd/dashboard/liam-dashboard.service /etc/systemd/system/liam-dashboard.service

# Reload systemd
sudo systemctl daemon-reload

# Enable service (starts on boot)
sudo systemctl enable liam-dashboard

# Start service now
sudo systemctl start liam-dashboard

# Check status
sudo systemctl status liam-dashboard
```

## Data Sources
- `/home/liam/clawd/EVOLUTION-QUEUE.md` - Projects and issues
- `/home/liam/clawd/progress/*.txt` - Active task progress

## Technologies
- Python 3 (built-in http.server)
- HTML5 + CSS3 + JavaScript
- No external dependencies required

## File Structure

```
dashboard/
├── start.py              # HTTP server (canonical implementation)
├── schema.sql            # SQLite database schema
├── dashboard.db          # Runtime metrics database
├── liam-dashboard.service # Systemd unit file
├── analytics.py          # Future: STUMPY anomaly detection
├── requirements.txt      # Dependencies for analytics.py
├── templates/
│   └── index.html        # Main dashboard UI
├── static/
│   ├── app.js            # Client-side JavaScript
│   └── style.css         # Technical Brutalism styling
└── archive/              # Archived old implementations
```

**Note:** Only `start.py` is the active server. The `analytics.py` module is for future STUMPY integration and is not currently used. Do NOT create Flask/Node.js alternatives.
