#!/usr/bin/env python3
"""
Database initialization script for EF Coaching at Scale skill.
Creates patterns.db with all required tables.
"""

import sqlite3
import os
from pathlib import Path

# Default database path
DEFAULT_DB_PATH = Path(__file__).parent / "patterns.db"


def init_database(db_path: str = None) -> sqlite3.Connection:
    """
    Initialize the EF Coaching patterns database.

    Args:
        db_path: Path to database file. Defaults to patterns.db in skill directory.

    Returns:
        SQLite connection object
    """
    if db_path is None:
        db_path = str(DEFAULT_DB_PATH)

    # Create directory if it doesn't exist
    db_dir = os.path.dirname(db_path)
    if db_dir:  # Only create if directory is non-empty
        os.makedirs(db_dir, exist_ok=True)

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Create energy_log table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS energy_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            energy_level INTEGER NOT NULL CHECK(energy_level BETWEEN 1 AND 10),
            activity_type TEXT CHECK(activity_type IN ('deep_work', 'admin', 'learning', 'creative', 'social', 'rest')),
            time_block TEXT CHECK(time_block IN ('morning', 'afternoon', 'evening', 'night')),
            notes TEXT
        )
    """)

    # Create habits table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS habits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            streak_count INTEGER DEFAULT 0,
            last_completed DATE,
            goal_frequency TEXT CHECK(goal_frequency IN ('daily', 'weekly', 'monthly')),
            active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Create habit_log table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS habit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            habit_id INTEGER NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            notes TEXT,
            FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
        )
    """)

    # Create context_suggestions table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS context_suggestions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            suggestion TEXT NOT NULL,
            context_type TEXT CHECK(context_type IN ('deep_work', 'slack', 'transition', 'capture', 'habit_reminder')),
            accepted BOOLEAN,
            reason TEXT,
            confidence REAL CHECK(confidence BETWEEN 0 AND 1)
        )
    """)

    # Create focus_sessions table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS focus_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            start_time DATETIME NOT NULL,
            end_time DATETIME,
            planned_duration INTEGER,  -- minutes
            actual_duration INTEGER,  -- minutes
            task_name TEXT,
            project_id INTEGER,
            outcome TEXT CHECK(outcome IN ('completed', 'interrupted', 'extended', 'abandoned')),
            energy_before INTEGER CHECK(energy_before BETWEEN 1 AND 10),
            energy_after INTEGER CHECK(energy_after BETWEEN 1 AND 10),
            notes TEXT
        )
    """)

    # Create capture_patterns table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS capture_patterns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            capture_text TEXT NOT NULL,
            suggested_para_type TEXT CHECK(suggested_para_type IN ('project', 'area', 'resource', 'archive')),
            suggested_category TEXT,
            confidence REAL CHECK(confidence BETWEEN 0 AND 1),
            user_accepted BOOLEAN,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Create indexes for better query performance
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_energy_log_timestamp ON energy_log(timestamp)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_energy_log_time_block ON energy_log(time_block)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_habit_log_timestamp ON habit_log(timestamp)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_context_suggestions_timestamp ON context_suggestions(timestamp)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_focus_sessions_start_time ON focus_sessions(start_time)")

    conn.commit()
    print(f"Database initialized successfully at: {db_path}")
    print("Tables created: energy_log, habits, habit_log, context_suggestions, focus_sessions, capture_patterns")

    return conn


if __name__ == "__main__":
    import sys

    db_path_arg = sys.argv[1] if len(sys.argv) > 1 else None
    conn = init_database(db_path_arg)

    # Print database info
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = cursor.fetchall()
    print(f"\nTables in database: {[t[0] for t in tables]}")

    conn.close()
