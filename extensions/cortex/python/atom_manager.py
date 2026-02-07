#!/usr/bin/env python3
"""
Atom Manager - Phase 3 of Cortex Memory System

Implements Atomic Knowledge Units: {subject, action, outcome, consequences}
Each field gets its own embedding for field-level semantic search.
Causal chain traversal for deep abstraction.

All operations are local-first, token-conscious.
Uses existing GPU embeddings daemon at localhost:8030 (RTX 5090).

Data directory configured via CORTEX_DATA_DIR environment variable.
"""
import sqlite3
import json
import hashlib
import os
import numpy as np
import requests
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple

# Data directory: use CORTEX_DATA_DIR env var or default to script directory
DATA_DIR = Path(os.environ.get("CORTEX_DATA_DIR", Path(__file__).parent))
ATOMS_DB_PATH = DATA_DIR / ".atoms.db"

# GPU embeddings daemon URL (already running on localhost)
EMBEDDINGS_URL = os.environ.get("EMBEDDINGS_URL", "http://localhost:8030")

# Check if embeddings daemon is available
def check_embeddings_available() -> bool:
    """Check if the GPU embeddings daemon is running"""
    try:
        resp = requests.get(f"{EMBEDDINGS_URL}/health", timeout=2)
        return resp.status_code == 200 and resp.json().get("status") == "ok"
    except Exception:
        return False

EMBEDDINGS_AVAILABLE = check_embeddings_available()


def init_db():
    """Initialize the atoms database with schema from Phase 3 spec"""
    conn = sqlite3.connect(ATOMS_DB_PATH)
    c = conn.cursor()

    # Core atoms table with field-level embeddings
    c.execute('''
        CREATE TABLE IF NOT EXISTS atoms (
            id TEXT PRIMARY KEY,

            -- Core fields (the irreducible unit of causal understanding)
            subject TEXT NOT NULL,
            action TEXT NOT NULL,
            outcome TEXT NOT NULL,
            consequences TEXT NOT NULL,

            -- Field-level embeddings (384-dim each, stored as BLOB)
            subject_embedding BLOB,
            action_embedding BLOB,
            outcome_embedding BLOB,
            consequences_embedding BLOB,

            -- Temporal metadata
            action_timestamp TEXT,
            outcome_delay_seconds INTEGER,
            consequence_delay_seconds INTEGER,

            -- Quality and usage metadata
            confidence REAL DEFAULT 1.0,
            access_count INTEGER DEFAULT 0,
            created_at TEXT,
            source TEXT,

            -- Optional: link back to original text memory
            source_memory_id TEXT
        )
    ''')

    # Causal links between atoms
    c.execute('''
        CREATE TABLE IF NOT EXISTS causal_links (
            id TEXT PRIMARY KEY,

            from_atom_id TEXT REFERENCES atoms(id),
            to_atom_id TEXT REFERENCES atoms(id),

            link_type TEXT,  -- 'causes', 'enables', 'precedes', 'correlates'
            strength REAL,   -- 0-1 confidence in the causal relationship

            observation_count INTEGER DEFAULT 1,
            last_observed TEXT,

            UNIQUE(from_atom_id, to_atom_id, link_type)
        )
    ''')

    # Indexes for efficient queries
    c.execute('CREATE INDEX IF NOT EXISTS idx_atoms_subject ON atoms(subject)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_atoms_timestamp ON atoms(action_timestamp)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_atoms_source ON atoms(source)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_links_from ON causal_links(from_atom_id)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_links_to ON causal_links(to_atom_id)')

    conn.commit()
    conn.close()


def generate_atom_id(subject: str, action: str, outcome: str, timestamp: str) -> str:
    """Generate deterministic ID for an atom"""
    content = f"{subject}|{action}|{outcome}|{timestamp}"
    return hashlib.sha256(content.encode()).hexdigest()[:16]


def embed_field(text: str) -> Optional[bytes]:
    """Generate embedding for a single field using GPU daemon API"""
    if not check_embeddings_available():
        return None
    try:
        resp = requests.post(
            f"{EMBEDDINGS_URL}/embed",
            json={"text": text},
            timeout=5
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        # API returns {"embeddings": [[...vector...]]}
        embeddings = data.get("embeddings")
        if not embeddings or len(embeddings) == 0:
            # Also try singular "embedding" key for compatibility
            embedding = data.get("embedding")
            if embedding is None:
                return None
        else:
            embedding = embeddings[0]  # Get first (and only) embedding
        # Convert list to numpy array and then to bytes
        arr = np.array(embedding, dtype=np.float32)
        return arr.tobytes()
    except Exception as e:
        print(f"Warning: embedding failed for '{text[:50]}...': {e}")
        return None


def bytes_to_embedding(blob: bytes) -> Optional[np.ndarray]:
    """Convert stored BLOB back to numpy array"""
    if blob is None:
        return None
    return np.frombuffer(blob, dtype=np.float32)


def create_atom(
    subject: str,
    action: str,
    outcome: str,
    consequences: str,
    source: str = "manual",
    confidence: float = 1.0,
    action_timestamp: Optional[str] = None,
    outcome_delay_seconds: Optional[int] = None,
    consequence_delay_seconds: Optional[int] = None,
    source_memory_id: Optional[str] = None
) -> str:
    """
    Create a new atomic knowledge unit.

    Each atom represents: {WHO} {does WHAT} {causing WHAT} {with WHAT consequences}

    Returns the atom ID.
    """
    init_db()

    timestamp = action_timestamp or datetime.now().isoformat()
    atom_id = generate_atom_id(subject, action, outcome, timestamp)
    created_at = datetime.now().isoformat()

    # Generate field-level embeddings (all local GPU)
    subject_emb = embed_field(subject)
    action_emb = embed_field(action)
    outcome_emb = embed_field(outcome)
    consequences_emb = embed_field(consequences)

    conn = sqlite3.connect(ATOMS_DB_PATH)
    c = conn.cursor()

    c.execute('''
        INSERT OR REPLACE INTO atoms (
            id, subject, action, outcome, consequences,
            subject_embedding, action_embedding, outcome_embedding, consequences_embedding,
            action_timestamp, outcome_delay_seconds, consequence_delay_seconds,
            confidence, access_count, created_at, source, source_memory_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    ''', (
        atom_id, subject, action, outcome, consequences,
        subject_emb, action_emb, outcome_emb, consequences_emb,
        timestamp, outcome_delay_seconds, consequence_delay_seconds,
        confidence, created_at, source, source_memory_id
    ))

    conn.commit()
    conn.close()

    return atom_id


def get_atom(atom_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve an atom by ID"""
    init_db()

    conn = sqlite3.connect(ATOMS_DB_PATH)
    c = conn.cursor()

    c.execute('''
        SELECT id, subject, action, outcome, consequences,
               action_timestamp, outcome_delay_seconds, consequence_delay_seconds,
               confidence, access_count, created_at, source, source_memory_id
        FROM atoms WHERE id = ?
    ''', (atom_id,))

    row = c.fetchone()
    if row is None:
        conn.close()
        return None

    # Increment access count
    c.execute('UPDATE atoms SET access_count = access_count + 1 WHERE id = ?', (atom_id,))
    conn.commit()
    conn.close()

    return {
        "id": row[0],
        "subject": row[1],
        "action": row[2],
        "outcome": row[3],
        "consequences": row[4],
        "action_timestamp": row[5],
        "outcome_delay_seconds": row[6],
        "consequence_delay_seconds": row[7],
        "confidence": row[8],
        "access_count": row[9],
        "created_at": row[10],
        "source": row[11],
        "source_memory_id": row[12],
    }


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity between two vectors"""
    if a is None or b is None:
        return 0.0
    dot = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot / (norm_a * norm_b))


def search_by_field(
    field: str,
    query: str,
    limit: int = 10,
    threshold: float = 0.5
) -> List[Dict[str, Any]]:
    """
    Search atoms by similarity in a specific field.

    This is the key Phase 3 capability: search by subject, action, outcome,
    or consequences independently.

    Args:
        field: One of 'subject', 'action', 'outcome', 'consequences'
        query: The query text to match
        limit: Max results
        threshold: Minimum similarity score (0-1)

    Returns:
        List of matching atoms with similarity scores
    """
    if field not in ('subject', 'action', 'outcome', 'consequences'):
        raise ValueError(f"Invalid field: {field}. Must be subject/action/outcome/consequences")

    init_db()

    # Generate query embedding (local GPU)
    query_emb = embed_field(query)
    if query_emb is None:
        # Fall back to text search if embeddings not available
        return search_by_field_text(field, query, limit)

    query_vec = bytes_to_embedding(query_emb)

    conn = sqlite3.connect(ATOMS_DB_PATH)
    c = conn.cursor()

    # Get all atoms with embeddings for this field
    c.execute(f'''
        SELECT id, subject, action, outcome, consequences,
               {field}_embedding, confidence, access_count
        FROM atoms WHERE {field}_embedding IS NOT NULL
    ''')

    results = []
    for row in c.fetchall():
        atom_id, subject, action, outcome, consequences, field_emb_blob, confidence, access_count = row

        field_vec = bytes_to_embedding(field_emb_blob)
        similarity = cosine_similarity(query_vec, field_vec)

        if similarity >= threshold:
            results.append({
                "id": atom_id,
                "subject": subject,
                "action": action,
                "outcome": outcome,
                "consequences": consequences,
                "similarity": similarity,
                "confidence": confidence,
                "access_count": access_count,
                "matched_field": field,
            })

    conn.close()

    # Sort by similarity descending
    results.sort(key=lambda x: x["similarity"], reverse=True)
    return results[:limit]


def search_by_field_text(field: str, query: str, limit: int = 10) -> List[Dict[str, Any]]:
    """Fallback text search when embeddings not available"""
    init_db()

    conn = sqlite3.connect(ATOMS_DB_PATH)
    c = conn.cursor()

    c.execute(f'''
        SELECT id, subject, action, outcome, consequences, confidence, access_count
        FROM atoms WHERE LOWER({field}) LIKE ?
        LIMIT ?
    ''', (f'%{query.lower()}%', limit))

    results = []
    for row in c.fetchall():
        results.append({
            "id": row[0],
            "subject": row[1],
            "action": row[2],
            "outcome": row[3],
            "consequences": row[4],
            "similarity": 0.7,  # Assume decent match for text search
            "confidence": row[5],
            "access_count": row[6],
            "matched_field": field,
        })

    conn.close()
    return results


def create_causal_link(
    from_atom_id: str,
    to_atom_id: str,
    link_type: str = "causes",
    strength: float = 0.5
) -> str:
    """
    Create or update a causal link between atoms.

    link_type can be:
    - 'causes': A directly causes B
    - 'enables': A makes B possible
    - 'precedes': A happens before B (temporal)
    - 'correlates': A and B occur together
    """
    init_db()

    link_id = hashlib.sha256(f"{from_atom_id}|{to_atom_id}|{link_type}".encode()).hexdigest()[:16]
    now = datetime.now().isoformat()

    conn = sqlite3.connect(ATOMS_DB_PATH)
    c = conn.cursor()

    # Try to update existing link
    c.execute('''
        UPDATE causal_links
        SET strength = (strength + ?) / 2,
            observation_count = observation_count + 1,
            last_observed = ?
        WHERE from_atom_id = ? AND to_atom_id = ? AND link_type = ?
    ''', (strength, now, from_atom_id, to_atom_id, link_type))

    if c.rowcount == 0:
        # Create new link
        c.execute('''
            INSERT INTO causal_links (id, from_atom_id, to_atom_id, link_type, strength, observation_count, last_observed)
            VALUES (?, ?, ?, ?, ?, 1, ?)
        ''', (link_id, from_atom_id, to_atom_id, link_type, strength, now))

    conn.commit()
    conn.close()

    return link_id


def find_atoms_by_consequence_similarity(
    target_context: str,
    threshold: float = 0.7,
    limit: int = 20
) -> List[Dict[str, Any]]:
    """
    Find atoms whose consequences match a given context.

    This is used for causal chain traversal: "What atoms led to this?"
    We look for atoms whose consequences field semantically matches
    the subject/action of our target.
    """
    return search_by_field("consequences", target_context, limit=limit, threshold=threshold)


def find_root_causes(
    atom_id: str,
    depth: int = 0,
    max_depth: int = 10,
    visited: Optional[set] = None
) -> List[Dict[str, Any]]:
    """
    Traverse backward through causal chain to find root causes.
    100% local - no API calls needed.

    This is the core of Phase 3: keep going until we hit epistemic limits.

    Returns atoms at the chain roots (atoms with no known causes).
    """
    if visited is None:
        visited = set()

    if depth >= max_depth or atom_id in visited:
        return []

    visited.add(atom_id)
    atom = get_atom(atom_id)

    if atom is None:
        return []

    # Find atoms whose consequences match this atom's subject/action
    target_context = f"{atom['subject']} {atom['action']}"
    antecedents = find_atoms_by_consequence_similarity(target_context, threshold=0.7)

    # Filter out self and already visited
    antecedents = [a for a in antecedents if a["id"] != atom_id and a["id"] not in visited]

    if not antecedents:
        # This is a root - no known cause
        atom["depth"] = depth
        return [atom]

    # Recurse into antecedents
    roots = []
    for ante in antecedents:
        roots.extend(find_root_causes(ante["id"], depth + 1, max_depth, visited))

    return roots


def find_all_paths_to_outcome(
    target_outcome: str,
    max_depth: int = 10
) -> List[Dict[str, Any]]:
    """
    Find all causal chains that lead to a target outcome.
    Returns the novel indicators at the chain roots.

    This is the "40 novel indicators" capability from the spec.
    """
    # Find atoms with matching outcome
    outcome_atoms = search_by_field("outcome", target_outcome, limit=50)

    all_roots = []
    for atom in outcome_atoms:
        roots = find_root_causes(atom["id"], max_depth=max_depth)
        all_roots.extend(roots)

    # Deduplicate and rank by how often they appear as roots
    root_counts = {}
    for root in all_roots:
        root_id = root["id"]
        if root_id not in root_counts:
            root_counts[root_id] = {"atom": root, "count": 0}
        root_counts[root_id]["count"] += 1

    # Sort by frequency (most common root causes first)
    ranked = sorted(root_counts.values(), key=lambda x: x["count"], reverse=True)
    return [r["atom"] for r in ranked]


def stats() -> Dict[str, Any]:
    """Get atoms database statistics"""
    init_db()

    conn = sqlite3.connect(ATOMS_DB_PATH)
    c = conn.cursor()

    c.execute("SELECT COUNT(*) FROM atoms")
    total_atoms = c.fetchone()[0]

    c.execute("SELECT COUNT(*) FROM causal_links")
    total_links = c.fetchone()[0]

    c.execute("SELECT source, COUNT(*) FROM atoms GROUP BY source")
    by_source = dict(c.fetchall())

    c.execute("SELECT link_type, COUNT(*) FROM causal_links GROUP BY link_type")
    links_by_type = dict(c.fetchall())

    c.execute("SELECT AVG(confidence) FROM atoms")
    avg_confidence = c.fetchone()[0] or 0

    c.execute("SELECT COUNT(*) FROM atoms WHERE subject_embedding IS NOT NULL")
    with_embeddings = c.fetchone()[0]

    conn.close()

    # Check embeddings daemon status dynamically
    embeddings_ok = check_embeddings_available()

    return {
        "total_atoms": total_atoms,
        "total_causal_links": total_links,
        "by_source": by_source if by_source else {},
        "links_by_type": links_by_type if links_by_type else {},
        "avg_confidence": round(avg_confidence, 3) if avg_confidence else 0,
        "atoms_with_embeddings": with_embeddings,
        "embeddings_available": embeddings_ok,
    }


if __name__ == "__main__":
    print("Initializing atoms database...")
    init_db()

    print("\n=== Phase 3: Atomic Knowledge Demo ===\n")

    # Create some test atoms
    print("Creating test atoms...")

    atom1 = create_atom(
        subject="whale wallet 0x3f...",
        action="accumulates mass token X over 72 hours",
        outcome="on-chain concentration pattern becomes visible",
        consequences="precedes price movement by 4-12 hours, 73% correlation",
        source="demo",
        confidence=0.73
    )
    print(f"  Created atom: {atom1}")

    atom2 = create_atom(
        subject="market maker",
        action="detects concentration pattern",
        outcome="positions accordingly",
        consequences="adds momentum to price movement",
        source="demo",
        confidence=0.8
    )
    print(f"  Created atom: {atom2}")

    atom3 = create_atom(
        subject="retail traders",
        action="see price movement on charts",
        outcome="FOMO buying begins",
        consequences="price spikes further, whale exits profitably",
        source="demo",
        confidence=0.9
    )
    print(f"  Created atom: {atom3}")

    # Create causal links
    print("\nCreating causal links...")
    create_causal_link(atom1, atom2, "causes", 0.73)
    create_causal_link(atom2, atom3, "enables", 0.8)
    print("  Linked atom1 -> atom2 -> atom3")

    # Test field-level search
    print("\n=== Field-Level Search Demo ===\n")

    print("Searching by subject: 'entities that accumulate'...")
    results = search_by_field("subject", "entities that accumulate", limit=5)
    for r in results:
        print(f"  [{r['similarity']:.3f}] {r['subject']}")

    print("\nSearching by consequences: 'precedes price movement'...")
    results = search_by_field("consequences", "precedes price movement", limit=5)
    for r in results:
        print(f"  [{r['similarity']:.3f}] {r['consequences'][:50]}...")

    # Test causal traversal
    print("\n=== Causal Traversal Demo ===\n")

    print(f"Finding root causes of atom3 (retail FOMO)...")
    roots = find_root_causes(atom3)
    print(f"  Found {len(roots)} root(s):")
    for root in roots:
        print(f"    - Depth {root.get('depth', '?')}: {root['subject']} {root['action'][:30]}...")

    # Stats
    print("\n=== Database Stats ===\n")
    s = stats()
    print(f"  Total atoms: {s['total_atoms']}")
    print(f"  Total causal links: {s['total_causal_links']}")
    print(f"  Atoms with embeddings: {s['atoms_with_embeddings']}")
    print(f"  Embeddings available: {s['embeddings_available']}")
    print(f"  Average confidence: {s['avg_confidence']}")

    print("\n✓ Phase 3 Atomic Knowledge foundation ready!")
