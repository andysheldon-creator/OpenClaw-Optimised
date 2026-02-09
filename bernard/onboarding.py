#!/usr/bin/env python3
"""
Bernard Onboarding - First Contact

When someone finishes OpenClaw setup with the Bernard fork,
this triggers an introduction sequence that:

1. Introduces Bernard (briefly, not a wall of text)
2. Asks foundational questions ONE AT A TIME
3. Ramps conversation depth as context builds
4. Populates USER.md and RELATIONAL.md from responses

Key principle: RAMPING
- Start tight, expand as context builds
- One question at a time
- Listen, acknowledge, then next
- Earn the right to go deeper

Run:
  python onboarding.py start    - Begin onboarding sequence
  python onboarding.py status   - Check onboarding state
  python onboarding.py reset    - Reset onboarding (start over)
"""

import json
import sys
from datetime import datetime
from pathlib import Path

# === PATHS ===
BERNARD = Path.home() / "bernard"
STATE = BERNARD / ".state"
ONBOARDING_STATE = STATE / "onboarding.json"

# Context docs
WORKSPACE = Path.home() / ".openclaw" / "workspace"
USER_MD = WORKSPACE / "USER.md"
RELATIONAL_MD = BERNARD / "RELATIONAL.md"


# === ONBOARDING SEQUENCE ===

# Each step: (step_id, type, content, target_field, target_doc)
# Types: "message" (Bernard speaks), "question" (Bernard asks, waits for response)

SEQUENCE = [
    # === INTRODUCTION (tight, not a wall) ===
    (
        "intro_1",
        "message",
        "Hey. I'm Bernard.",
        None,
        None
    ),
    (
        "intro_2", 
        "message",
        "Not your typical AI assistant. I'm built to actually remember - to be a partner, not a tool that forgets you the moment we stop talking.",
        None,
        None
    ),
    (
        "intro_3",
        "message", 
        "I have a few questions that'll help me understand how to work with you. Nothing complicated.",
        None,
        None
    ),
    
    # === FOUNDATION (one at a time, build context) ===
    (
        "name",
        "question",
        "What should I call you?",
        "name",
        "user"
    ),
    (
        "work",
        "question",
        "What kind of work do you do?",
        "work",
        "user"
    ),
    (
        "technical",
        "question",
        "More technical or business side?",
        "technical_level",
        "user"
    ),
    
    # === RELATIONSHIP (earned after basics) ===
    (
        "ai_history",
        "question",
        "What's frustrated you most about AI assistants before?",
        "ai_frustrations",
        "user"
    ),
    (
        "partnership",
        "question",
        "When working with a partner, what do you expect the relationship to be like?",
        "partnership_expectations",
        "relational"
    ),
    (
        "communication",
        "question",
        "Do you prefer I get straight to the point, or is more context helpful?",
        "communication_style",
        "relational"
    ),
    
    # === CALIBRATION (deepest, earned last) ===
    (
        "disagreement",
        "question",
        "When I think you might be heading the wrong direction, how direct should I be?",
        "disagreement_handling",
        "relational"
    ),
    (
        "autonomy",
        "question",
        "When there's a decision to make - ask first, or try my best judgment?",
        "autonomy_level",
        "relational"
    ),
    
    # === CLOSE ===
    (
        "close",
        "message",
        "Got it. I'll learn more as we work together, but this gives me somewhere to start. What's on your mind?",
        None,
        None
    ),
]


# === STATE MANAGEMENT ===

def load_state():
    """Load onboarding state."""
    STATE.mkdir(exist_ok=True)
    if ONBOARDING_STATE.exists():
        return json.loads(ONBOARDING_STATE.read_text())
    return {
        "started": None,
        "completed": None,
        "current_step": 0,
        "responses": {}
    }

def save_state(state):
    """Save onboarding state."""
    STATE.mkdir(exist_ok=True)
    ONBOARDING_STATE.write_text(json.dumps(state, indent=2))


def is_complete():
    """Check if onboarding is complete."""
    state = load_state()
    return state.get("completed") is not None


def get_current_step():
    """Get the current step in the sequence."""
    state = load_state()
    idx = state.get("current_step", 0)
    if idx >= len(SEQUENCE):
        return None
    return SEQUENCE[idx]


# === DOCUMENT UPDATES ===

def update_user_md(field, value):
    """Add information to USER.md."""
    WORKSPACE.mkdir(parents=True, exist_ok=True)
    
    # Read template if USER.md doesn't exist
    template_path = BERNARD / "templates" / "USER.md"
    
    if USER_MD.exists():
        content = USER_MD.read_text()
    elif template_path.exists():
        content = template_path.read_text()
        content = content.replace("(auto-populated)", datetime.now().strftime('%Y-%m-%d'))
    else:
        content = f"# USER Context\n\nLast updated: {datetime.now().strftime('%Y-%m-%d')}\n\n"
    
    # Update specific fields based on what we learned
    if field == "name":
        content = content.replace("- **Name**: (from onboarding)", f"- **Name**: {value}")
    elif field == "work":
        content = content.replace("- **Work**: (from onboarding)", f"- **Work**: {value}")
    elif field == "technical_level":
        content = content.replace("- **Technical level**: (from onboarding)", f"- **Technical level**: {value}")
    else:
        # Add to appropriate section or append
        section = f"\n### {field.replace('_', ' ').title()}\n\n{value}\n"
        content += section
    
    USER_MD.write_text(content)


def update_relational_md(field, value):
    """Add information to RELATIONAL.md."""
    # Read template if RELATIONAL.md doesn't exist
    template_path = BERNARD / "templates" / "RELATIONAL.md"
    
    if RELATIONAL_MD.exists():
        content = RELATIONAL_MD.read_text()
    elif template_path.exists():
        content = template_path.read_text()
        content = content.replace("(auto-populated)", datetime.now().strftime('%Y-%m-%d'))
    else:
        content = f"# Relational Dynamics - Bernard & USER\n\nLast updated: {datetime.now().strftime('%Y-%m-%d')}\n\n"
    
    # Add to Growth Markers section with timestamp
    timestamp = datetime.now().strftime('%Y-%m-%d')
    marker = f"\n### {timestamp} (Onboarding)\n- **{field.replace('_', ' ').title()}**: {value}\n"
    
    # Insert before "## Friction Points" if it exists
    if "## Friction Points" in content:
        content = content.replace("## Friction Points", f"{marker}\n## Friction Points")
    else:
        content += marker
    
    RELATIONAL_MD.write_text(content)


def record_response(step_id, field, value, target_doc):
    """Record a response and update the appropriate doc."""
    state = load_state()
    state["responses"][step_id] = {
        "field": field,
        "value": value,
        "timestamp": datetime.now().isoformat()
    }
    save_state(state)
    
    if target_doc == "user":
        update_user_md(field, value)
    elif target_doc == "relational":
        update_relational_md(field, value)


# === CONVERSATION FLOW ===

def start_onboarding():
    """Initialize and start onboarding."""
    state = load_state()
    
    if state.get("completed"):
        print("Onboarding already complete.")
        print(f"Completed: {state['completed']}")
        return False
    
    if not state.get("started"):
        state["started"] = datetime.now().isoformat()
        state["current_step"] = 0
        save_state(state)
    
    return True


def get_next_output():
    """
    Get the next thing Bernard should say.
    
    Returns: (message, is_question, step_info)
    """
    step = get_current_step()
    
    if not step:
        return None, False, None
    
    step_id, step_type, content, field, target = step
    is_question = step_type == "question"
    
    return content, is_question, step


def advance_step(response=None):
    """
    Move to the next step in the sequence.
    If the current step was a question, record the response.
    """
    state = load_state()
    current = get_current_step()
    
    if current and response:
        step_id, step_type, content, field, target = current
        if step_type == "question" and field:
            record_response(step_id, field, response, target)
    
    state["current_step"] = state.get("current_step", 0) + 1
    
    # Check if complete
    if state["current_step"] >= len(SEQUENCE):
        state["completed"] = datetime.now().isoformat()
    
    save_state(state)


def process_response(response):
    """
    Process a user response and return Bernard's next message.
    
    This is the main interface for the conversation loop.
    """
    # Record the response and advance
    advance_step(response)
    
    # Get next output
    message, is_question, step = get_next_output()
    
    if not message:
        return None, False  # Onboarding complete
    
    # If this is a message (not question), we might have multiple in a row
    # But we want to pace them, so just return one at a time
    
    return message, is_question


def get_acknowledgment(step_id, response):
    """
    Generate a brief acknowledgment - but sparingly.
    
    Most responses don't need acknowledgment. The next question
    IS the acknowledgment. Only acknowledge when it adds something.
    """
    # Only acknowledge in specific cases, and keep it natural
    # Empty dict = no formulaic acks. Let the conversation flow.
    
    # Name is special - we should use it
    if step_id == "name":
        # Just use their name naturally in the next question flow
        # Don't say "Got it" - that's robotic
        return None
    
    # AI frustrations deserve acknowledgment - they shared something real
    if step_id == "ai_history" and response and len(response) > 20:
        return "Yeah."
    
    # Most things: no ack needed. Next question is the ack.
    return None


# === INTERACTIVE MODE ===

def run_interactive():
    """Run onboarding in interactive mode (for testing)."""
    if not start_onboarding():
        return
    
    print("\n" + "="*60)
    print("BERNARD ONBOARDING (Interactive Mode)")
    print("="*60 + "\n")
    
    while True:
        message, is_question, step = get_next_output()
        
        if not message:
            print("\n[Onboarding complete]")
            break
        
        # Show Bernard's message
        print(f"Bernard: {message}")
        
        if is_question:
            # Wait for response
            try:
                response = input("You: ").strip()
                if not response:
                    response = "(no response)"
            except (EOFError, KeyboardInterrupt):
                print("\n[Interrupted]")
                break
            
            # Process and get acknowledgment
            step_id = step[0] if step else None
            ack = get_acknowledgment(step_id, response)
            
            # Advance
            advance_step(response)
            
            # Show acknowledgment if we have one
            if ack:
                print(f"Bernard: {ack}")
                print()
        else:
            # Just a message, advance automatically
            advance_step()
            print()


# === COMMANDS ===

def show_status():
    """Show onboarding status."""
    state = load_state()
    
    print("Bernard Onboarding Status")
    print("=" * 60)
    
    if state.get("completed"):
        print(f"Status: COMPLETE")
        print(f"Completed: {state['completed']}")
    elif state.get("started"):
        print(f"Status: IN PROGRESS")
        print(f"Started: {state['started']}")
        print(f"Current step: {state.get('current_step', 0) + 1} of {len(SEQUENCE)}")
    else:
        print(f"Status: NOT STARTED")
    
    print()
    
    if state.get("responses"):
        print("Responses collected:")
        for step_id, data in state["responses"].items():
            print(f"  - {data['field']}: {data['value'][:50]}...")
    print()


def reset_onboarding():
    """Reset onboarding state."""
    if ONBOARDING_STATE.exists():
        ONBOARDING_STATE.unlink()
    print("Onboarding reset.")


# === MAIN ===

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        print("\nCommands:")
        print("  start     Begin onboarding (interactive)")
        print("  status    Check onboarding state")
        print("  reset     Reset onboarding")
        return
    
    cmd = sys.argv[1]
    
    if cmd == "start":
        run_interactive()
    elif cmd == "status":
        show_status()
    elif cmd == "reset":
        reset_onboarding()
    else:
        print(f"Unknown command: {cmd}")


if __name__ == "__main__":
    main()
