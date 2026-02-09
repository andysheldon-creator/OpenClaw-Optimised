#!/usr/bin/env python3
"""
Bernard Scheduler - Automated daily processing

Runs continuously, handling:
- Midnight rollover to new raw file
- Daily processing of previous day's conversations
- Generation of daily summaries
- Suggestions for core.md updates

Run:
  python scheduler.py start    - Start the scheduler daemon
"""

import json
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

# === PATHS ===
BERNARD = Path.home() / "bernard"
RAW = BERNARD / "raw"
DAILY = BERNARD / "daily"
CORE = BERNARD / "core.md"
SCHEDULER_STATE = BERNARD / ".state" / "scheduler.json"

# === STATE MANAGEMENT ===

def load_scheduler_state():
    """Load scheduler state (tracks what's been processed)."""
    if SCHEDULER_STATE.exists():
        return json.loads(SCHEDULER_STATE.read_text())
    return {"last_processed_date": None, "last_check": None}

def save_scheduler_state(state):
    """Save scheduler state."""
    SCHEDULER_STATE.parent.mkdir(exist_ok=True)
    SCHEDULER_STATE.write_text(json.dumps(state, indent=2))

# === PROCESSING LOGIC ===

def get_unprocessed_dates():
    """Find raw files that don't have corresponding daily files."""
    unprocessed = []
    
    if not RAW.exists():
        return unprocessed
    
    for raw_file in sorted(RAW.glob("*.md")):
        date = raw_file.stem  # YYYY-MM-DD
        daily_file = DAILY / f"{date}.md"
        
        if not daily_file.exists():
            unprocessed.append(date)
    
    return unprocessed

def process_date(date: str):
    """Process a specific date through the cluster."""
    print(f"\n{'='*60}")
    print(f"Processing {date}...")
    print(f"{'='*60}\n")
    
    try:
        # Run the cluster
        result = subprocess.run(
            ["python3", str(BERNARD / "agents" / "cluster.py"), "process", date],
            capture_output=True,
            text=True,
            timeout=600  # 10 minute timeout
        )
        
        if result.returncode == 0:
            print(f"✓ Successfully processed {date}")
            print(result.stdout)
            return True
        else:
            print(f"✗ Error processing {date}")
            print(result.stderr)
            return False
            
    except subprocess.TimeoutExpired:
        print(f"✗ Processing {date} timed out after 10 minutes")
        return False
    except Exception as e:
        print(f"✗ Error processing {date}: {e}")
        return False

def check_for_core_updates(date: str):
    """Check if the daily summary suggests core.md updates and apply them automatically."""
    daily_file = DAILY / f"{date}.md"
    
    if not daily_file.exists():
        return
    
    content = daily_file.read_text()
    
    # Check if there are proposed updates
    if "Proposed Context Updates" in content or "Flags for Review" in content:
        print(f"\n{'='*60}")
        print(f"📌 {date} has significance - updating core.md")
        print(f"{'='*60}")
        
        # Extract the synthesis JSON for structured updates
        synthesis_file = BERNARD / ".agents" / f"{date}_synthesis.json"
        if synthesis_file.exists():
            try:
                synthesis = json.loads(synthesis_file.read_text())
                apply_core_updates(date, synthesis)
            except Exception as e:
                print(f"✗ Error applying updates: {e}")
        
        print(f"Review: {daily_file}\n")

def apply_core_updates(date: str, synthesis: dict):
    """Apply synthesis updates to core.md automatically."""
    if not CORE.exists():
        print("✗ core.md not found, skipping updates")
        return
    
    core_content = CORE.read_text()
    
    # Add a dated update section
    update_section = f"\n\n## Updates from {date}\n\n"
    
    # Add summary if present
    if "summary" in synthesis and synthesis["summary"]:
        update_section += f"**Summary:** {synthesis['summary']}\n\n"
    
    # Add key moments
    if "key_moments" in synthesis and synthesis["key_moments"]:
        update_section += "**Key moments:**\n"
        for moment in synthesis["key_moments"]:
            if moment.get("weight") in ["CRITICAL", "HIGH"]:
                update_section += f"- [{moment.get('category', '')}] {moment.get('content', '')}\n"
        update_section += "\n"
    
    # Add pattern updates
    if "pattern_updates" in synthesis and synthesis["pattern_updates"]:
        update_section += "**Patterns observed:**\n"
        for pattern in synthesis["pattern_updates"]:
            update_section += f"- {pattern}\n"
        update_section += "\n"
    
    # Append to core.md
    with open(CORE, "a") as f:
        f.write(update_section)
    
    print(f"✓ Updated core.md with {date} significance")

# === SCHEDULER LOOP ===

def scheduler_tick():
    """Single scheduler tick - check for work to do."""
    state = load_scheduler_state()
    now = datetime.now()
    today = now.strftime("%Y-%m-%d")
    
    # Check if we've crossed midnight since last check
    last_check = state.get("last_check")
    crossed_midnight = False
    if last_check:
        last_check_date = datetime.fromisoformat(last_check).date()
        if last_check_date < now.date():
            print(f"\n🌅 New day: {today}")
            print(f"Raw file will be created automatically by watcher")
            crossed_midnight = True
    
    # Update last check
    state["last_check"] = now.isoformat()
    
    # Find unprocessed dates (completed days only)
    unprocessed = get_unprocessed_dates()
    unprocessed = [d for d in unprocessed if d != today]
    
    # Process today's file every 2 hours for incremental updates
    last_today_process = state.get("last_today_process")
    should_process_today = False
    
    if not last_today_process:
        should_process_today = True
    else:
        last_process_time = datetime.fromisoformat(last_today_process)
        hours_since = (now - last_process_time).total_seconds() / 3600
        if hours_since >= 2:
            should_process_today = True
    
    if should_process_today and (RAW / f"{today}.md").exists():
        print(f"\n📊 Processing today's conversations ({today})...")
        success = process_date(today)
        if success:
            state["last_today_process"] = now.isoformat()
            check_for_core_updates(today)
        save_scheduler_state(state)
    
    # Process completed days
    if unprocessed:
        print(f"\n📋 Found {len(unprocessed)} completed day(s): {', '.join(unprocessed)}")
        
        for date in unprocessed:
            success = process_date(date)
            
            if success:
                state["last_processed_date"] = date
                check_for_core_updates(date)
            
            # Save state after each processing
            save_scheduler_state(state)
    
    save_scheduler_state(state)

def run_scheduler():
    """Main scheduler loop."""
    print("Bernard Scheduler starting...")
    print(f"Checking every 5 minutes for:")
    print(f"  - Today's file (process every 2 hours)")
    print(f"  - Completed days (process once after midnight)\n")
    
    while True:
        try:
            scheduler_tick()
            
            # Check every 5 minutes
            time.sleep(300)
            
        except KeyboardInterrupt:
            print("\n\nScheduler stopped by user")
            break
        except Exception as e:
            print(f"\n✗ Scheduler error: {e}")
            print("Retrying in 5 minutes...")
            time.sleep(300)

# === MANUAL COMMANDS ===

def process_missing():
    """Manually process all missing daily files."""
    unprocessed = get_unprocessed_dates()
    today = datetime.now().strftime("%Y-%m-%d")
    unprocessed = [d for d in unprocessed if d != today]
    
    if not unprocessed:
        print("✓ All dates processed!")
        return
    
    print(f"Processing {len(unprocessed)} date(s)...\n")
    
    for date in unprocessed:
        success = process_date(date)
        if success:
            check_for_core_updates(date)
            
            # Update state
            state = load_scheduler_state()
            state["last_processed_date"] = date
            save_scheduler_state(state)
    
    print(f"\n✓ Batch processing complete")

def status():
    """Show scheduler status."""
    state = load_scheduler_state()
    unprocessed = get_unprocessed_dates()
    today = datetime.now().strftime("%Y-%m-%d")
    unprocessed = [d for d in unprocessed if d != today]
    
    print("Bernard Scheduler Status")
    print("=" * 60)
    print(f"Last processed: {state.get('last_processed_date', 'Never')}")
    print(f"Last check: {state.get('last_check', 'Never')}")
    print(f"Unprocessed dates: {len(unprocessed)}")
    
    if unprocessed:
        print(f"  {', '.join(unprocessed)}")
    else:
        print("  (all caught up)")
    
    print()

# === MAIN ===

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        print("\nCommands:")
        print("  start          Start continuous scheduler")
        print("  process        Process all missing daily files now")
        print("  status         Show scheduler status")
        return
    
    cmd = sys.argv[1]
    
    if cmd == "start":
        run_scheduler()
    elif cmd == "process":
        process_missing()
    elif cmd == "status":
        status()
    else:
        print(f"Unknown command: {cmd}")
        print(__doc__)

if __name__ == "__main__":
    main()
