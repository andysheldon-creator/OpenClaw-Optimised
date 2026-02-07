#!/usr/bin/env python3
"""
Temporal Analysis - Phase 3F of Cortex Memory System

Time-aware causal analysis:
- Time-based queries ("What happened 4 hours before X?")
- Temporal pattern detection across chains
- Delay analysis between cause and effect

The temporal dimension of atomic knowledge.
"""
import sqlite3
import json
import os
from pathlib import Path
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict

from atom_manager import init_db, ATOMS_DB_PATH, get_atom, search_by_field

# Data directory
DATA_DIR = Path(os.environ.get("CORTEX_DATA_DIR", Path(__file__).parent))


# ============================================================================
# Time-Based Queries
# ============================================================================

def parse_time_reference(time_ref: str) -> Optional[Tuple[datetime, datetime]]:
    """
    Parse natural language time references.

    Examples:
    - "4 hours ago" → (now - 4h, now)
    - "yesterday" → (yesterday start, yesterday end)
    - "last week" → (7 days ago, now)
    - "before the crash" → needs context, returns None
    """
    time_ref = time_ref.lower().strip()
    now = datetime.now()

    # Relative time patterns
    patterns = [
        # "X hours/minutes/days ago"
        (r"(\d+)\s*hours?\s*ago", lambda m: (now - timedelta(hours=int(m.group(1))), now)),
        (r"(\d+)\s*minutes?\s*ago", lambda m: (now - timedelta(minutes=int(m.group(1))), now)),
        (r"(\d+)\s*days?\s*ago", lambda m: (now - timedelta(days=int(m.group(1))), now)),

        # "last X hours/days"
        (r"last\s*(\d+)\s*hours?", lambda m: (now - timedelta(hours=int(m.group(1))), now)),
        (r"last\s*(\d+)\s*days?", lambda m: (now - timedelta(days=int(m.group(1))), now)),

        # Named periods
        (r"today", lambda m: (now.replace(hour=0, minute=0, second=0), now)),
        (r"yesterday", lambda m: ((now - timedelta(days=1)).replace(hour=0, minute=0, second=0),
                                   now.replace(hour=0, minute=0, second=0))),
        (r"last\s*week", lambda m: (now - timedelta(days=7), now)),
        (r"last\s*month", lambda m: (now - timedelta(days=30), now)),
        (r"this\s*morning", lambda m: (now.replace(hour=6, minute=0, second=0),
                                        now.replace(hour=12, minute=0, second=0))),
    ]

    import re
    for pattern, handler in patterns:
        match = re.search(pattern, time_ref)
        if match:
            return handler(match)

    return None


def get_atoms_in_timerange(
    start: datetime,
    end: datetime,
    limit: int = 50
) -> List[Dict[str, Any]]:
    """
    Get all atoms with action_timestamp in the given range.
    """
    init_db()

    conn = sqlite3.connect(ATOMS_DB_PATH)
    c = conn.cursor()

    c.execute('''
        SELECT id, subject, action, outcome, consequences,
               action_timestamp, outcome_delay_seconds, consequence_delay_seconds,
               confidence
        FROM atoms
        WHERE action_timestamp IS NOT NULL
          AND action_timestamp >= ?
          AND action_timestamp <= ?
        ORDER BY action_timestamp DESC
        LIMIT ?
    ''', (start.isoformat(), end.isoformat(), limit))

    results = []
    for row in c.fetchall():
        results.append({
            "id": row[0],
            "subject": row[1],
            "action": row[2],
            "outcome": row[3],
            "consequences": row[4],
            "action_timestamp": row[5],
            "outcome_delay_seconds": row[6],
            "consequence_delay_seconds": row[7],
            "confidence": row[8],
        })

    conn.close()
    return results


def search_temporal(
    query: str,
    time_reference: str,
    limit: int = 20
) -> Dict[str, Any]:
    """
    Search atoms with temporal context.

    Example: "whale accumulation" + "4 hours ago"
    Returns atoms matching the query within the time range.
    """
    result = {
        "query": query,
        "time_reference": time_reference,
        "time_range": None,
        "atoms": [],
        "temporal_patterns": [],
    }

    # Parse time reference
    time_range = parse_time_reference(time_reference)
    if time_range:
        start, end = time_range
        result["time_range"] = {
            "start": start.isoformat(),
            "end": end.isoformat(),
        }

        # Get atoms in time range
        time_atoms = get_atoms_in_timerange(start, end, limit=limit * 2)

        # Filter by query relevance
        query_lower = query.lower()
        for atom in time_atoms:
            # Check if query matches any field
            if (query_lower in atom["subject"].lower() or
                query_lower in atom["action"].lower() or
                query_lower in atom["outcome"].lower() or
                query_lower in atom["consequences"].lower()):
                result["atoms"].append(atom)

        result["atoms"] = result["atoms"][:limit]
    else:
        # Fall back to semantic search without time constraint
        result["atoms"] = search_by_field("outcome", query, limit=limit)

    return result


def what_happened_before(
    event_description: str,
    hours_before: int = 4,
    limit: int = 20
) -> Dict[str, Any]:
    """
    Find what happened before a given event.

    "What happened 4 hours before the price spike?"
    """
    result = {
        "event": event_description,
        "lookback_hours": hours_before,
        "precursor_atoms": [],
        "causal_candidates": [],
    }

    # First, find atoms matching the event
    event_atoms = search_by_field("outcome", event_description, limit=10)
    if not event_atoms:
        event_atoms = search_by_field("consequences", event_description, limit=10)

    if not event_atoms:
        result["error"] = "Could not find atoms matching the event"
        return result

    # For each event atom with timestamp, find what happened before
    for event_atom in event_atoms:
        if not event_atom.get("action_timestamp"):
            continue

        try:
            event_time = datetime.fromisoformat(event_atom["action_timestamp"])
        except (ValueError, TypeError):
            continue

        # Look back
        start_time = event_time - timedelta(hours=hours_before)
        precursors = get_atoms_in_timerange(start_time, event_time, limit=limit)

        for precursor in precursors:
            if precursor["id"] != event_atom["id"]:
                precursor["time_before_event"] = str(event_time - datetime.fromisoformat(precursor["action_timestamp"]))
                result["precursor_atoms"].append(precursor)

    # Identify causal candidates (precursors whose consequences match the event)
    event_lower = event_description.lower()
    for precursor in result["precursor_atoms"]:
        if event_lower in precursor.get("consequences", "").lower():
            result["causal_candidates"].append({
                "atom": precursor,
                "reason": "Consequences field matches event",
            })

    return result


# ============================================================================
# Temporal Pattern Detection
# ============================================================================

def analyze_temporal_patterns(
    outcome_pattern: str,
    min_observations: int = 3
) -> Dict[str, Any]:
    """
    Analyze temporal patterns for a given outcome.

    Example: For "price movement", find:
    - Average delay from cause to effect
    - Common precursor patterns
    - Time-of-day patterns
    """
    result = {
        "outcome_pattern": outcome_pattern,
        "observations": 0,
        "avg_outcome_delay": None,
        "avg_consequence_delay": None,
        "common_precursors": [],
        "time_patterns": {},
    }

    # Find atoms with this outcome
    atoms = search_by_field("outcome", outcome_pattern, limit=100, threshold=0.5)
    result["observations"] = len(atoms)

    if len(atoms) < min_observations:
        result["error"] = f"Insufficient observations ({len(atoms)} < {min_observations})"
        return result

    # Analyze delays
    outcome_delays = []
    consequence_delays = []
    hour_distribution = defaultdict(int)
    precursor_subjects = defaultdict(int)

    for atom in atoms:
        # Collect delay data
        if atom.get("outcome_delay_seconds"):
            outcome_delays.append(atom["outcome_delay_seconds"])
        if atom.get("consequence_delay_seconds"):
            consequence_delays.append(atom["consequence_delay_seconds"])

        # Time-of-day pattern
        if atom.get("action_timestamp"):
            try:
                ts = datetime.fromisoformat(atom["action_timestamp"])
                hour_distribution[ts.hour] += 1
            except (ValueError, TypeError):
                pass

        # Track subjects as potential precursor patterns
        precursor_subjects[atom["subject"]] += 1

    # Calculate averages
    if outcome_delays:
        result["avg_outcome_delay"] = {
            "seconds": sum(outcome_delays) / len(outcome_delays),
            "human": format_duration(sum(outcome_delays) / len(outcome_delays)),
        }
    if consequence_delays:
        result["avg_consequence_delay"] = {
            "seconds": sum(consequence_delays) / len(consequence_delays),
            "human": format_duration(sum(consequence_delays) / len(consequence_delays)),
        }

    # Most common precursor subjects
    result["common_precursors"] = [
        {"subject": subj, "count": count}
        for subj, count in sorted(precursor_subjects.items(), key=lambda x: -x[1])[:5]
    ]

    # Time-of-day pattern
    if hour_distribution:
        peak_hour = max(hour_distribution, key=hour_distribution.get)
        result["time_patterns"] = {
            "peak_hour": peak_hour,
            "distribution": dict(hour_distribution),
        }

    return result


def format_duration(seconds: float) -> str:
    """Format seconds as human-readable duration."""
    if seconds < 60:
        return f"{seconds:.0f} seconds"
    elif seconds < 3600:
        return f"{seconds/60:.1f} minutes"
    elif seconds < 86400:
        return f"{seconds/3600:.1f} hours"
    else:
        return f"{seconds/86400:.1f} days"


def detect_delay_patterns() -> Dict[str, Any]:
    """
    Analyze all atoms to find consistent delay patterns.

    "Whale accumulation typically precedes price movement by 4-12 hours"
    """
    init_db()

    conn = sqlite3.connect(ATOMS_DB_PATH)
    c = conn.cursor()

    c.execute('''
        SELECT subject, action, outcome, consequences,
               outcome_delay_seconds, consequence_delay_seconds
        FROM atoms
        WHERE outcome_delay_seconds IS NOT NULL
           OR consequence_delay_seconds IS NOT NULL
    ''')

    # Group by subject pattern
    patterns = defaultdict(list)
    for row in c.fetchall():
        subject, action, outcome, consequences, outcome_delay, consequence_delay = row

        # Create a pattern key based on subject type
        subject_type = categorize_subject(subject)
        pattern_key = f"{subject_type} → {outcome[:30]}..."

        if outcome_delay:
            patterns[pattern_key].append({
                "type": "outcome_delay",
                "seconds": outcome_delay,
            })
        if consequence_delay:
            patterns[pattern_key].append({
                "type": "consequence_delay",
                "seconds": consequence_delay,
            })

    conn.close()

    # Analyze patterns
    result = {
        "patterns": [],
        "total_observations": sum(len(v) for v in patterns.values()),
    }

    for pattern_key, delays in patterns.items():
        if len(delays) >= 2:  # Need at least 2 observations
            avg_delay = sum(d["seconds"] for d in delays) / len(delays)
            result["patterns"].append({
                "pattern": pattern_key,
                "observations": len(delays),
                "avg_delay_seconds": avg_delay,
                "avg_delay_human": format_duration(avg_delay),
            })

    # Sort by observations
    result["patterns"].sort(key=lambda x: -x["observations"])

    return result


def categorize_subject(subject: str) -> str:
    """Categorize a subject into a general type."""
    subject_lower = subject.lower()

    if "whale" in subject_lower or "wallet" in subject_lower:
        return "whale_wallet"
    elif "market maker" in subject_lower or "mm" in subject_lower:
        return "market_maker"
    elif "exchange" in subject_lower:
        return "exchange"
    elif "retail" in subject_lower or "trader" in subject_lower:
        return "retail_trader"
    elif "api" in subject_lower or "endpoint" in subject_lower:
        return "api"
    elif "user" in subject_lower or "peter" in subject_lower:
        return "user"
    else:
        return "other"


# ============================================================================
# Testing
# ============================================================================

if __name__ == "__main__":
    print("=== Phase 3F: Temporal Analysis Demo ===\n")

    # Test time reference parsing
    print("Time Reference Parsing:\n")
    test_refs = [
        "4 hours ago",
        "yesterday",
        "last week",
        "30 minutes ago",
        "last 2 days",
    ]
    for ref in test_refs:
        result = parse_time_reference(ref)
        if result:
            start, end = result
            print(f"  '{ref}' → {start.strftime('%Y-%m-%d %H:%M')} to {end.strftime('%Y-%m-%d %H:%M')}")
        else:
            print(f"  '{ref}' → Could not parse")

    print("\n" + "="*60)
    print("\nTemporal Search Test:\n")

    result = search_temporal("price movement", "last 24 hours")
    print(f"Query: 'price movement' in last 24 hours")
    print(f"Time range: {result.get('time_range')}")
    print(f"Atoms found: {len(result['atoms'])}")

    print("\n" + "="*60)
    print("\nDelay Pattern Detection:\n")

    patterns = detect_delay_patterns()
    print(f"Total observations with delays: {patterns['total_observations']}")
    if patterns["patterns"]:
        print("Patterns found:")
        for p in patterns["patterns"][:5]:
            print(f"  {p['pattern']}")
            print(f"    Observations: {p['observations']}, Avg delay: {p['avg_delay_human']}")
    else:
        print("No delay patterns found (need atoms with temporal metadata)")

    print("\n✓ Phase 3F Temporal Analysis ready!")
