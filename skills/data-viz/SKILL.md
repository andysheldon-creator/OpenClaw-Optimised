---
name: data-viz
description: Generate charts and data visualizations using Python matplotlib. Use when asked to create graphs, charts, plots, or visual representations of data. Supports line charts, bar charts, pie charts, scatter plots, heatmaps, and more.
homepage: https://matplotlib.org/
metadata: {"openclaw":{"emoji":"📊","requires":{"bins":["uv"]}}}
---

# Data Visualization Skill

Generate professional charts and graphs using Python matplotlib via `uv run` (no pip install needed).

## Quick Start

```bash
uv run --with matplotlib python3 << 'EOF'
import matplotlib.pyplot as plt
plt.style.use('dark_background')

data = [10, 25, 15, 30, 20]
labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

fig, ax = plt.subplots(figsize=(10, 5))
ax.plot(labels, data, 'o-', color='#e94560', linewidth=2)
ax.fill_between(labels, data, alpha=0.3, color='#e94560')
ax.set_title('Weekly Metrics', fontsize=14, fontweight='bold')
ax.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig('chart.png', dpi=150, facecolor='#1a1a2e')
print('✅ Saved: chart.png')
EOF
```

## Chart Types

### Line Chart (Time Series)

```bash
uv run --with matplotlib python3 << 'EOF'
import matplotlib.pyplot as plt
plt.style.use('dark_background')

dates = ['Jan 1', 'Jan 2', 'Jan 3', 'Jan 4', 'Jan 5']
values = [10, 25, 15, 30, 20]

fig, ax = plt.subplots(figsize=(12, 5))
ax.plot(dates, values, 'o-', color='#e94560', linewidth=2, markersize=6)
ax.fill_between(dates, values, alpha=0.3, color='#e94560')
ax.set_title('Daily Metrics', fontsize=14, fontweight='bold')
ax.set_xlabel('Date')
ax.set_ylabel('Value')
ax.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig('line_chart.png', dpi=150, facecolor='#1a1a2e')
print('✅ Saved: line_chart.png')
EOF
```

### Bar Chart

```bash
uv run --with matplotlib python3 << 'EOF'
import matplotlib.pyplot as plt
plt.style.use('dark_background')

categories = ['Service A', 'Service B', 'Service C', 'Service D']
values = [45, 32, 67, 28]
colors = ['#e94560', '#27ae60', '#3498db', '#f39c12']

fig, ax = plt.subplots(figsize=(10, 5))
bars = ax.bar(categories, values, color=colors, alpha=0.8)
ax.set_title('Comparison', fontsize=14, fontweight='bold')
ax.set_ylabel('Count')

# Add value labels on bars
for bar, val in zip(bars, values):
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 1,
            str(val), ha='center', fontsize=10)

plt.tight_layout()
plt.savefig('bar_chart.png', dpi=150, facecolor='#1a1a2e')
print('✅ Saved: bar_chart.png')
EOF
```

### Dual-Line Chart (Comparison)

```bash
uv run --with matplotlib python3 << 'EOF'
import matplotlib.pyplot as plt
plt.style.use('dark_background')

dates = ['Jan 1', 'Jan 2', 'Jan 3', 'Jan 4', 'Jan 5']
series_a = [71, 7, 22, 35, 26]
series_b = [50, 6, 11, 27, 21]

fig, ax = plt.subplots(figsize=(12, 5))
ax.fill_between(dates, series_a, alpha=0.3, color='#e94560')
ax.fill_between(dates, series_b, alpha=0.3, color='#27ae60')
ax.plot(dates, series_a, 'o-', color='#e94560', linewidth=2, label='Series A')
ax.plot(dates, series_b, 's-', color='#27ae60', linewidth=2, label='Series B')
ax.set_title('Comparison', fontsize=14, fontweight='bold')
ax.legend(loc='upper right')
ax.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig('dual_chart.png', dpi=150, facecolor='#1a1a2e')
print('✅ Saved: dual_chart.png')
EOF
```

### Pie Chart

```bash
uv run --with matplotlib python3 << 'EOF'
import matplotlib.pyplot as plt
plt.style.use('dark_background')

labels = ['Category A', 'Category B', 'Category C', 'Other']
sizes = [580, 324, 154, 200]
colors = ['#e94560', '#27ae60', '#3498db', '#95a5a6']
explode = (0.05, 0, 0, 0)  # Highlight first slice

fig, ax = plt.subplots(figsize=(8, 8))
ax.pie(sizes, explode=explode, labels=labels, colors=colors,
       autopct='%1.1f%%', shadow=True, startangle=90)
ax.set_title('Distribution', fontsize=14, fontweight='bold')
plt.tight_layout()
plt.savefig('pie_chart.png', dpi=150, facecolor='#1a1a2e')
print('✅ Saved: pie_chart.png')
EOF
```

### Heatmap

```bash
uv run --with matplotlib --with numpy python3 << 'EOF'
import matplotlib.pyplot as plt
import numpy as np
plt.style.use('dark_background')

# 4 weeks x 7 days of random data
data = np.random.randint(10, 100, (4, 7))
days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4']

fig, ax = plt.subplots(figsize=(10, 4))
im = ax.imshow(data, cmap='RdYlGn_r')
ax.set_xticks(range(7))
ax.set_yticks(range(4))
ax.set_xticklabels(days)
ax.set_yticklabels(weeks)
plt.colorbar(im, label='Value')
ax.set_title('Heatmap', fontsize=14, fontweight='bold')
plt.tight_layout()
plt.savefig('heatmap.png', dpi=150, facecolor='#1a1a2e')
print('✅ Saved: heatmap.png')
EOF
```

## Loading Data from JSON

```bash
uv run --with matplotlib python3 << 'EOF'
import json
import matplotlib.pyplot as plt
from pathlib import Path

# Load data from JSON file
with open('data.json') as f:
    data = json.load(f)

labels = data['labels']
values = data['values']

plt.style.use('dark_background')
fig, ax = plt.subplots(figsize=(12, 5))
ax.bar(labels, values, color='#e94560', alpha=0.8)
ax.set_title(data.get('title', 'Chart'), fontsize=14, fontweight='bold')
ax.grid(True, alpha=0.3, axis='y')
plt.xticks(rotation=45, ha='right')
plt.tight_layout()
plt.savefig('chart.png', dpi=150, facecolor='#1a1a2e')
print('✅ Saved: chart.png')
EOF
```

## Style Options

### Dark Theme (recommended for chat)

```python
plt.style.use('dark_background')
plt.savefig('chart.png', facecolor='#1a1a2e')
```

### Light Theme

```python
plt.style.use('default')
plt.savefig('chart.png', facecolor='white')
```

### Color Palette

```python
COLORS = {
    'red': '#e94560',
    'green': '#27ae60',
    'blue': '#3498db',
    'orange': '#f39c12',
    'purple': '#9b59b6',
    'teal': '#1abc9c',
    'gray': '#95a5a6'
}
```

## Tips

1. **Use `uv run --with matplotlib`** — installs matplotlib on-the-fly, no pip needed
2. **Dark theme** looks better in chat interfaces
3. **Always add labels/legends** — charts should be self-explanatory
4. **Use `figsize`** — `(12, 5)` for wide charts, `(8, 8)` for square
5. **Set `dpi=150`** for crisp images without being too large
6. **Read the saved PNG** after generating to display to user

## Requirements

- `uv` — Python package runner (install: `curl -LsSf https://astral.sh/uv/install.sh | sh`)
