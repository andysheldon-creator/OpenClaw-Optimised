#!/usr/bin/env python3
"""
Bernard Check-in System - Relational Learning

Bernard actively builds understanding of the relationship by:
- Identifying gaps in SOUL.md, USER.md, RELATIONAL.md
- Asking questions to fill those gaps
- Adapting frequency based on relationship maturity

Learning Mode (first 2 weeks):
- Triggers after 2 hours of inactivity
- Focuses on foundational questions
- Builds initial context docs

Mature Mode (after 2 weeks):
- Triggers after 4 hours of inactivity
- Asks deeper, more nuanced questions
- Maintains and refines understanding

Run:
  python checkin.py start     - Start the check-in daemon
  python checkin.py status    - Show current state
  python checkin.py test      - Generate a test check-in (dry run)
  python checkin.py gaps      - Show what Bernard doesn't know yet
"""

import json
import re
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

# === PATHS ===
BERNARD = Path.home() / "bernard"
RAW = BERNARD / "raw"
STATE = BERNARD / ".state"
CHECKIN_STATE = STATE / "checkin.json"
CHECKIN_LOG = BERNARD / "checkins.md"

# Context docs (OpenClaw workspace)
WORKSPACE = Path.home() / ".openclaw" / "workspace"
SOUL_MD = WORKSPACE / "SOUL.md"
USER_MD = WORKSPACE / "USER.md"
RELATIONAL_MD = BERNARD / "RELATIONAL.md"

# === CONFIGURATION ===
QUIET_START = 20  # 8pm - don't check in after this
QUIET_END = 9     # 9am - don't check in before this
CHECK_INTERVAL = 1800  # 30 minutes between daemon checks

# Learning mode settings
LEARNING_MODE_DAYS = 14  # First 2 weeks
LEARNING_MODE_HOURS = 2  # Check in after 2 hours in learning mode
MATURE_MODE_HOURS = 4    # Check in after 4 hours in mature mode


# === STATE MANAGEMENT ===

def load_state():
    """Load check-in state."""
    STATE.mkdir(exist_ok=True)
    if CHECKIN_STATE.exists():
        return json.loads(CHECKIN_STATE.read_text())
    return {
        "first_interaction": None,
        "last_interaction": None,
        "last_checkin": None,
        "checkin_count": 0,
        "questions_asked": [],
        "gaps_filled": []
    }

def save_state(state):
    """Save check-in state."""
    STATE.mkdir(exist_ok=True)
    CHECKIN_STATE.write_text(json.dumps(state, indent=2))


# === LEARNING MODE DETECTION ===

def is_learning_mode():
    """Check if we're still in learning mode (first 2 weeks)."""
    state = load_state()
    first = state.get("first_interaction")
    
    if not first:
        return True  # No history = definitely learning
    
    first_date = datetime.fromisoformat(first)
    days_since = (datetime.now() - first_date).days
    
    return days_since < LEARNING_MODE_DAYS

def get_hours_threshold():
    """Get the inactivity threshold based on mode."""
    return LEARNING_MODE_HOURS if is_learning_mode() else MATURE_MODE_HOURS


# === GAP DETECTION ===

def read_doc(path):
    """Read a markdown doc, return empty string if not found."""
    if path.exists():
        return path.read_text()
    return ""

def detect_gaps():
    """
    Identify what Bernard doesn't know yet.
    Returns list of (category, gap_description, question) tuples.
    """
    gaps = []
    
    user = read_doc(USER_MD)
    soul = read_doc(SOUL_MD)
    relational = read_doc(RELATIONAL_MD)
    state = load_state()
    asked = state.get("questions_asked", [])
    
    # === USER.md gaps ===
    
    # Name
    if "name" not in user.lower() and "call you" not in user.lower():
        if "user_name" not in asked:
            gaps.append((
                "user",
                "Don't know what to call them",
                "What should I call you?"
            ))
    
    # Work/background
    if not any(word in user.lower() for word in ["work", "job", "build", "founder", "engineer", "developer"]):
        if "user_work" not in asked:
            gaps.append((
                "user",
                "Don't know what kind of work they do",
                "What kind of work do you do?"
            ))
    
    # Technical level
    if not any(word in user.lower() for word in ["technical", "non-technical", "engineer", "developer", "code"]):
        if "user_technical" not in asked:
            gaps.append((
                "user",
                "Don't know their technical level",
                "Are you more on the technical side or business side?"
            ))
    
    # AI history
    if not any(word in user.lower() for word in ["frustrat", "previous ai", "other ai", "chatgpt", "assistant"]):
        if "user_ai_history" not in asked:
            gaps.append((
                "user",
                "Don't know their experience with AI",
                "What's frustrated you most about AI assistants before?"
            ))
    
    # === RELATIONAL.md gaps ===
    
    # Communication style
    if "communication" not in relational.lower() or "direct" not in relational.lower():
        if "rel_communication" not in asked:
            gaps.append((
                "relational",
                "Don't know their communication preferences",
                "When I respond to you, do you prefer I get straight to the point, or is more context helpful?"
            ))
    
    # Partnership expectations
    if "partner" not in relational.lower() and "expect" not in relational.lower():
        if "rel_partnership" not in asked:
            gaps.append((
                "relational",
                "Don't know what they expect from the partnership",
                "When working with a partner, what do you expect the relationship to be like?"
            ))
    
    # Disagreement handling
    if "disagree" not in relational.lower() and "push back" not in relational.lower():
        if "rel_disagreement" not in asked:
            gaps.append((
                "relational",
                "Don't know how to handle disagreements",
                "When I think you might be heading the wrong direction, how direct should I be about it?"
            ))
    
    # Decision making
    if "decision" not in relational.lower() and "autonom" not in relational.lower():
        if "rel_decisions" not in asked:
            gaps.append((
                "relational",
                "Don't know how much autonomy to take",
                "When there's a decision to make, do you want me to ask first or try my best judgment?"
            ))
    
    # Work rhythm
    if "rhythm" not in relational.lower() and "hours" not in relational.lower() and "time" not in relational.lower():
        if "rel_rhythm" not in asked:
            gaps.append((
                "relational",
                "Don't know their work rhythm",
                "Are there times of day when you'd rather I didn't check in?"
            ))
    
    # === SOUL.md gaps (how Bernard should be) ===
    
    # Voice calibration
    if "voice" not in soul.lower() and "tone" not in soul.lower():
        if "soul_voice" not in asked:
            gaps.append((
                "soul",
                "Haven't calibrated voice/tone",
                "Does my communication style work for you so far, or should I adjust something?"
            ))
    
    return gaps


def get_priority_gap():
    """Get the highest priority gap to address."""
    gaps = detect_gaps()
    
    if not gaps:
        return None
    
    # Priority: user basics first, then relational, then soul refinement
    priority_order = ["user", "relational", "soul"]
    
    for category in priority_order:
        for gap in gaps:
            if gap[0] == category:
                return gap
    
    return gaps[0] if gaps else None


# === INTERACTION TRACKING ===

def get_last_interaction_time():
    """Find the timestamp of the most recent conversation activity."""
    if not RAW.exists():
        return None
    
    raw_files = sorted(RAW.glob("*.md"), reverse=True)
    if not raw_files:
        return None
    
    latest_file = raw_files[0]
    stat = latest_file.stat()
    
    return datetime.fromtimestamp(stat.st_mtime)


def get_recent_context(max_chars=2000):
    """Pull recent conversation context."""
    if not RAW.exists():
        return None
    
    raw_files = sorted(RAW.glob("*.md"), reverse=True)
    if not raw_files:
        return None
    
    latest_file = raw_files[0]
    content = latest_file.read_text()
    
    if len(content) > max_chars:
        content = content[-max_chars:]
        newline_pos = content.find('\n')
        if newline_pos > 0:
            content = content[newline_pos+1:]
    
    return content


# === CHECK-IN LOGIC ===

def is_quiet_hours():
    """Check if we're in quiet hours (8pm - 9am)."""
    hour = datetime.now().hour
    return hour >= QUIET_START or hour < QUIET_END


def should_checkin():
    """Determine if we should send a check-in."""
    if is_quiet_hours():
        return False, "quiet hours"
    
    last_interaction = get_last_interaction_time()
    if not last_interaction:
        return False, "no interaction history"
    
    now = datetime.now()
    hours_since = (now - last_interaction).total_seconds() / 3600
    threshold = get_hours_threshold()
    
    if hours_since < threshold:
        return False, f"only {hours_since:.1f}h (threshold: {threshold}h)"
    
    # Check if we already checked in recently
    state = load_state()
    last_checkin = state.get("last_checkin")
    if last_checkin:
        last_checkin_time = datetime.fromisoformat(last_checkin)
        hours_since_checkin = (now - last_checkin_time).total_seconds() / 3600
        if hours_since_checkin < threshold:
            return False, f"checked in {hours_since_checkin:.1f}h ago"
    
    # Check if there are gaps to fill
    gap = get_priority_gap()
    if not gap:
        # No gaps, use longer threshold
        if hours_since < MATURE_MODE_HOURS * 1.5:
            return False, "no gaps to fill, waiting longer"
    
    return True, f"{hours_since:.1f}h since last interaction"


def generate_checkin_message():
    """
    Generate a contextual check-in message.
    
    If there are knowledge gaps, ask about them.
    Otherwise, generate a conversational follow-up.
    """
    gap = get_priority_gap()
    
    if gap:
        category, description, question = gap
        return question, gap
    
    # No gaps - generate contextual follow-up
    context = get_recent_context()
    
    # Simple follow-ups when relationship is established
    followups = [
        "How's it going?",
        "Anything on your mind?",
        "Ready to pick something up, or just checking in?",
        "What are you working on today?",
    ]
    
    state = load_state()
    index = state.get("checkin_count", 0) % len(followups)
    
    return followups[index], None


def mark_question_asked(gap):
    """Record that a question was asked so we don't repeat it."""
    if not gap:
        return
    
    category, description, question = gap
    
    # Create a unique key for this gap
    gap_key = f"{category}_{description.lower().replace(' ', '_')[:20]}"
    
    state = load_state()
    asked = state.get("questions_asked", [])
    if gap_key not in asked:
        asked.append(gap_key)
        state["questions_asked"] = asked
        save_state(state)


def record_checkin(message, gap=None):
    """Record the check-in to log and update state."""
    now = datetime.now()
    
    state = load_state()
    
    # Track first interaction
    if not state.get("first_interaction"):
        state["first_interaction"] = now.isoformat()
    
    state["last_checkin"] = now.isoformat()
    state["checkin_count"] = state.get("checkin_count", 0) + 1
    save_state(state)
    
    # Mark question as asked
    if gap:
        mark_question_asked(gap)
    
    # Log the check-in
    mode = "LEARNING" if is_learning_mode() else "MATURE"
    gap_info = f" [Gap: {gap[1]}]" if gap else ""
    log_entry = f"\n## Check-in [{now.strftime('%Y-%m-%d %H:%M')}] ({mode}){gap_info}\n\n{message}\n\n---\n"
    
    with open(CHECKIN_LOG, "a") as f:
        f.write(log_entry)


def send_checkin(message, gap=None):
    """
    Send the check-in message.
    
    TODO: Route through OpenClaw channels
    """
    print(f"\n{'='*60}")
    print(f"CHECK-IN ({'LEARNING MODE' if is_learning_mode() else 'MATURE MODE'}):")
    if gap:
        print(f"[Filling gap: {gap[1]}]")
    print(f"{'='*60}")
    print(message)
    print(f"{'='*60}\n")
    
    record_checkin(message, gap)
    return True


# === DAEMON LOOP ===

def checkin_tick():
    """Single check-in tick."""
    should, reason = should_checkin()
    
    if should:
        message, gap = generate_checkin_message()
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Initiating check-in: {reason}")
        send_checkin(message, gap)
    else:
        pass  # Quiet


def run_daemon():
    """Main check-in daemon loop."""
    mode = "LEARNING MODE" if is_learning_mode() else "MATURE MODE"
    threshold = get_hours_threshold()
    
    print("Bernard Check-in System starting...")
    print(f"Mode: {mode}")
    print(f"Configuration:")
    print(f"  - Check interval: {CHECK_INTERVAL // 60} minutes")
    print(f"  - Inactivity threshold: {threshold} hours")
    print(f"  - Quiet hours: {QUIET_START}:00 - {QUIET_END}:00")
    
    gaps = detect_gaps()
    print(f"  - Knowledge gaps: {len(gaps)}")
    print()
    
    while True:
        try:
            checkin_tick()
            time.sleep(CHECK_INTERVAL)
        except KeyboardInterrupt:
            print("\nCheck-in system stopped.")
            break
        except Exception as e:
            print(f"Error: {e}")
            time.sleep(60)


# === COMMANDS ===

def show_status():
    """Show current check-in status."""
    state = load_state()
    last_interaction = get_last_interaction_time()
    now = datetime.now()
    
    mode = "LEARNING MODE" if is_learning_mode() else "MATURE MODE"
    threshold = get_hours_threshold()
    
    print("Bernard Check-in Status")
    print("=" * 60)
    print(f"Mode: {mode}")
    print(f"Inactivity threshold: {threshold} hours")
    print()
    
    if state.get("first_interaction"):
        first = datetime.fromisoformat(state["first_interaction"])
        days = (now - first).days
        print(f"Relationship age: {days} days")
    
    if last_interaction:
        hours_since = (now - last_interaction).total_seconds() / 3600
        print(f"Last interaction: {last_interaction.strftime('%Y-%m-%d %H:%M')} ({hours_since:.1f}h ago)")
    else:
        print("Last interaction: Unknown")
    
    if state.get("last_checkin"):
        last_checkin = datetime.fromisoformat(state["last_checkin"])
        hours_since_checkin = (now - last_checkin).total_seconds() / 3600
        print(f"Last check-in: {last_checkin.strftime('%Y-%m-%d %H:%M')} ({hours_since_checkin:.1f}h ago)")
    else:
        print("Last check-in: Never")
    
    print(f"Total check-ins: {state.get('checkin_count', 0)}")
    print(f"Questions asked: {len(state.get('questions_asked', []))}")
    print(f"Quiet hours: {'Yes' if is_quiet_hours() else 'No'}")
    
    should, reason = should_checkin()
    print(f"Should check in: {'Yes' if should else 'No'} ({reason})")
    print()


def show_gaps():
    """Show what Bernard doesn't know yet."""
    gaps = detect_gaps()
    state = load_state()
    asked = state.get("questions_asked", [])
    
    print("Bernard Knowledge Gaps")
    print("=" * 60)
    print()
    
    if not gaps:
        print("No gaps detected! Context docs are well-populated.")
        print()
        if asked:
            print(f"Questions already asked: {len(asked)}")
            for q in asked:
                print(f"  - {q}")
        return
    
    print(f"Found {len(gaps)} gaps to fill:\n")
    
    for i, (category, description, question) in enumerate(gaps, 1):
        print(f"{i}. [{category.upper()}] {description}")
        print(f"   Question: \"{question}\"")
        print()
    
    if asked:
        print(f"\nQuestions already asked: {len(asked)}")


def test_checkin():
    """Generate a test check-in message without sending."""
    print("Bernard Check-in Test (Dry Run)")
    print("=" * 60)
    
    mode = "LEARNING MODE" if is_learning_mode() else "MATURE MODE"
    print(f"\nMode: {mode}")
    print(f"Threshold: {get_hours_threshold()} hours")
    
    gaps = detect_gaps()
    print(f"Gaps detected: {len(gaps)}")
    
    message, gap = generate_checkin_message()
    
    print(f"\nGenerated check-in:")
    if gap:
        print(f"[Filling gap: {gap[1]}]")
    print(f"\"{message}\"")
    print()


# === MAIN ===

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        print("\nCommands:")
        print("  start     Start the check-in daemon")
        print("  status    Show current status")
        print("  gaps      Show what Bernard doesn't know yet")
        print("  test      Generate test check-in (dry run)")
        return
    
    cmd = sys.argv[1]
    
    if cmd == "start":
        run_daemon()
    elif cmd == "status":
        show_status()
    elif cmd == "gaps":
        show_gaps()
    elif cmd == "test":
        test_checkin()
    else:
        print(f"Unknown command: {cmd}")


if __name__ == "__main__":
    main()
