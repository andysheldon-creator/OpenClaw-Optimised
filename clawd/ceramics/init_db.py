#!/usr/bin/env python3
"""
Ceramics Database Initialization
Creates and initializes the ceramics.sqlite database with schema
"""

import sqlite3
import os
from pathlib import Path

def init_database(db_path: str = None, schema_path: str = None):
    """Initialize the ceramics database with schema"""

    if db_path is None:
        db_path = os.path.expanduser("~/clawd/ceramics/ceramics.sqlite")

    if schema_path is None:
        schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")

    # Create database directory if it doesn't exist
    db_dir = os.path.dirname(db_path)
    Path(db_dir).mkdir(parents=True, exist_ok=True)

    # Read schema
    with open(schema_path, 'r') as f:
        schema_sql = f.read()

    # Connect and execute schema
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        cursor.executescript(schema_sql)
        conn.commit()
        print(f"✓ Database initialized: {db_path}")
        print(f"✓ Schema loaded from: {schema_path}")

        # Verify tables created
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        tables = cursor.fetchall()
        print(f"✓ Tables created: {len(tables)}")
        for table in tables:
            print(f"  - {table[0]}")

        # Verify indexes
        cursor.execute("SELECT name FROM sqlite_master WHERE type='index' ORDER BY name")
        indexes = cursor.fetchall()
        print(f"✓ Indexes created: {len(indexes)}")

        # Verify triggers
        cursor.execute("SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name")
        triggers = cursor.fetchall()
        print(f"✓ Triggers created: {len(triggers)}")

        # Verify views
        cursor.execute("SELECT name FROM sqlite_master WHERE type='view' ORDER BY name")
        views = cursor.fetchall()
        print(f"✓ Views created: {len(views)}")

        return True

    except Exception as e:
        print(f"✗ Error initializing database: {e}")
        conn.rollback()
        return False

    finally:
        conn.close()

if __name__ == "__main__":
    init_database()
