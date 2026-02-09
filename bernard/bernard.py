#!/usr/bin/env python3
"""
Bernard - Conversation capture system.

Captures conversations from multiple sources:
- OpenCode conversations
- Claude Code conversations

Run:
  python bernard.py watch    - continuous capture from all sources
"""

import json
import time
import sys
from pathlib import Path
from datetime import datetime

# === PATHS ===
BERNARD = Path.home() / "bernard"
RAW = BERNARD / "raw"
STATE = BERNARD / ".state"

# Source locations
SOURCES = {
    "opencode": Path.home() / ".local/share/opencode/storage",
    "claude": Path.home() / ".claude/projects"
}


# === STATE MANAGEMENT ===

def load_state():
    STATE.mkdir(exist_ok=True)
    state_file = STATE / "seen.json"
    if state_file.exists():
        return json.loads(state_file.read_text())
    return {"opencode": {}, "claude": {}}

def save_state(state):
    STATE.mkdir(exist_ok=True)
    state_file = STATE / "seen.json"
    state_file.write_text(json.dumps(state, indent=2))


# === CAPTURE: OPENCODE ===

def capture_opencode(state):
    """Capture new messages from OpenCode."""
    messages = []
    seen = state.get("opencode", {})

    parts_dir = SOURCES["opencode"] / "part"
    messages_dir = SOURCES["opencode"] / "message"

    if not parts_dir.exists():
        return messages, seen

    for msg_dir in parts_dir.iterdir():
        if not msg_dir.is_dir():
            continue

        msg_id = msg_dir.name
        if msg_id in seen:
            continue

        # Extract text from parts
        texts = []
        for part_file in sorted(msg_dir.glob("*.json")):
            try:
                data = json.loads(part_file.read_text())
                if data.get("type") == "text" and data.get("text"):
                    texts.append(data["text"])
            except:
                continue

        if not texts:
            seen[msg_id] = True
            continue

        # Get role from message metadata
        role = "unknown"
        for session_dir in messages_dir.iterdir():
            msg_file = session_dir / f"{msg_id}.json"
            if msg_file.exists():
                try:
                    data = json.loads(msg_file.read_text())
                    role = data.get("role", "unknown")
                except:
                    pass
                break

        messages.append({
            "source": "opencode",
            "role": role,
            "text": "\n".join(texts),
            "timestamp": datetime.now().isoformat()
        })
        seen[msg_id] = True

    return messages, seen


# === CAPTURE: CLAUDE CODE ===

def capture_claude(state):
    """Capture new messages from Claude Code."""
    messages = []
    seen = state.get("claude", {})

    if not SOURCES["claude"].exists():
        return messages, seen

    for project_dir in SOURCES["claude"].iterdir():
        if not project_dir.is_dir():
            continue

        for jsonl_file in project_dir.glob("*.jsonl"):
            file_key = str(jsonl_file)
            seen_lines = seen.get(file_key, 0)
            current_line = 0

            with open(jsonl_file, 'r') as f:
                for line in f:
                    current_line += 1
                    if current_line <= seen_lines:
                        continue

                    try:
                        data = json.loads(line.strip())
                        if data.get("type") not in ["user", "assistant"]:
                            continue

                        msg = data.get("message", {})
                        role = msg.get("role", data.get("type"))
                        content = msg.get("content", [])

                        # Extract text
                        if isinstance(content, list):
                            texts = [c.get("text", "") for c in content if c.get("type") == "text"]
                            text = "\n".join(texts)
                        elif isinstance(content, str):
                            text = content
                        else:
                            continue

                        if text.strip():
                            messages.append({
                                "source": "claude",
                                "role": role,
                                "text": text,
                                "timestamp": data.get("timestamp", datetime.now().isoformat())
                            })
                    except:
                        continue

            seen[file_key] = current_line

    return messages, seen


# === CAPTURE: UNIFIED ===

def capture_all():
    """Capture from all sources, append to daily log."""
    state = load_state()
    all_messages = []

    # Capture from each source
    opencode_msgs, state["opencode"] = capture_opencode(state)
    claude_msgs, state["claude"] = capture_claude(state)

    all_messages.extend(opencode_msgs)
    all_messages.extend(claude_msgs)

    if all_messages:
        append_to_daily(all_messages)

    save_state(state)
    return len(all_messages)


def append_to_daily(messages):
    """Append messages to today's raw log."""
    RAW.mkdir(exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")
    log_file = RAW / f"{today}.md"

    content = ""
    if not log_file.exists():
        content = f"# Conversations - {today}\n\n"

    for msg in messages:
        time_str = datetime.now().strftime("%H:%M")
        role_label = "Derek" if msg["role"] == "user" else "Bernard"
        source = msg["source"]
        content += f"## {role_label} [{time_str}] ({source})\n\n{msg['text']}\n\n---\n\n"

    with open(log_file, "a") as f:
        f.write(content)

    print(f"[{datetime.now().strftime('%H:%M:%S')}] Captured {len(messages)} messages")


# === WATCH MODE ===

def watch():
    """Continuous capture from all sources."""
    print("Bernard watching all sources...")
    print(f"Sources: {', '.join(SOURCES.keys())}")
    print(f"Output: {RAW}")
    print()

    while True:
        try:
            count = capture_all()
            time.sleep(3)
        except KeyboardInterrupt:
            print("\nStopped.")
            break
        except Exception as e:
            print(f"Error: {e}")
            time.sleep(10)


# === MAIN ===

def main():
    RAW.mkdir(exist_ok=True)

    if len(sys.argv) < 2 or sys.argv[1] != "watch":
        print(__doc__)
        return

    watch()


if __name__ == "__main__":
    main()
