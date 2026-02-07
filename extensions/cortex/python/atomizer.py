#!/usr/bin/env python3
"""
Atomizer - Phase 3B of Cortex Memory System

Extracts atomic knowledge units from text memories.
Local-first: uses pattern matching first, falls back to LLM only when needed.

Text → {subject} {action} {outcome} {consequences}
"""
import re
import json
import os
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

# Import atom manager for creating atoms
from atom_manager import create_atom, init_db

# Data directory
DATA_DIR = Path(os.environ.get("CORTEX_DATA_DIR", Path(__file__).parent))


# ============================================================================
# Local Pattern-Based Extraction (no API tokens needed)
# ============================================================================

# Patterns for common causal structures
# Each pattern extracts (subject, action, outcome, consequences)
CAUSAL_PATTERNS = [
    # "{Subject} {action} causing {outcome}" pattern
    (
        r"(?P<subject>[A-Z][^.!?]*?)\s+(?P<action>(?:is|are|was|were|has|have|had|does|did|will|would|can|could|should|must|may|might)\s+[^.!?,]+?)\s*,?\s*(?:causing|resulting in|leading to)\s+(?P<outcome>[^.!?]+)",
        lambda m: {
            "subject": m.group("subject").strip(),
            "action": m.group("action").strip(),
            "outcome": m.group("outcome").strip(),
            "consequences": "extracted from causal pattern",
        }
    ),

    # "When {subject} {action}, {outcome} happens" pattern
    (
        r"[Ww]hen\s+(?P<subject>[^,]+?)\s+(?P<action>[^,]+),\s*(?P<outcome>[^.!?]+)",
        lambda m: {
            "subject": m.group("subject").strip(),
            "action": m.group("action").strip(),
            "outcome": m.group("outcome").strip(),
            "consequences": "conditional relationship",
        }
    ),

    # "{Subject} {action}, which {outcome}" pattern
    (
        r"(?P<subject>[A-Z][^,]+?)\s+(?P<action>[^,]+),\s*which\s+(?P<outcome>[^.!?]+)",
        lambda m: {
            "subject": m.group("subject").strip(),
            "action": m.group("action").strip(),
            "outcome": m.group("outcome").strip(),
            "consequences": "consequential relationship",
        }
    ),

    # "If {subject} {action}, then {outcome}" pattern
    (
        r"[Ii]f\s+(?P<subject>[^,]+?)\s+(?P<action>[^,]+),\s*then\s+(?P<outcome>[^.!?]+)",
        lambda m: {
            "subject": m.group("subject").strip(),
            "action": m.group("action").strip(),
            "outcome": m.group("outcome").strip(),
            "consequences": "conditional consequence",
        }
    ),

    # "{Subject} {action} because {reason}" (backward causation)
    (
        r"(?P<subject>[A-Z][^.!?]*?)\s+(?P<outcome>[^.!?,]+?)\s+because\s+(?P<action>[^.!?]+)",
        lambda m: {
            "subject": m.group("subject").strip(),
            "action": m.group("action").strip(),
            "outcome": m.group("outcome").strip(),
            "consequences": "causal explanation",
        }
    ),

    # "The {subject} {action}. This {consequence}" pattern (two-sentence)
    (
        r"[Tt]he\s+(?P<subject>[^.!?]+?)\s+(?P<action>[^.!?]+)\.\s*[Tt]his\s+(?P<outcome>[^.!?]+)",
        lambda m: {
            "subject": m.group("subject").strip(),
            "action": m.group("action").strip(),
            "outcome": m.group("outcome").strip(),
            "consequences": "sequential consequence",
        }
    ),

    # Lesson learned pattern: "Learned that {insight}"
    (
        r"(?:[Ll]earned|[Rr]ealized|[Dd]iscovered)\s+that\s+(?P<outcome>[^.!?]+)",
        lambda m: {
            "subject": "I",
            "action": "learned/realized",
            "outcome": m.group("outcome").strip(),
            "consequences": "new understanding",
        }
    ),

    # Decision pattern: "Decided to {action} because {reason}"
    (
        r"[Dd]ecided\s+to\s+(?P<action>[^.!?,]+?)(?:\s+because\s+(?P<outcome>[^.!?]+))?",
        lambda m: {
            "subject": "I",
            "action": f"decided to {m.group('action').strip()}",
            "outcome": m.group("outcome").strip() if m.group("outcome") else "intentional choice",
            "consequences": "decision made",
        }
    ),

    # Preference pattern: "I prefer {thing} over {other}"
    (
        r"(?:[Ii]|[Ww]e)\s+prefer\s+(?P<action>[^.!?]+)",
        lambda m: {
            "subject": "Peter" if "I" in m.group(0) else "we",
            "action": f"prefers {m.group('action').strip()}",
            "outcome": "preference recorded",
            "consequences": "informs future interactions",
        }
    ),

    # Bug/fix pattern: "Fixed {bug} by {solution}"
    (
        r"[Ff]ixed\s+(?P<outcome>[^.!?,]+?)(?:\s+by\s+(?P<action>[^.!?]+))?",
        lambda m: {
            "subject": "developer",
            "action": m.group("action").strip() if m.group("action") else "applied fix",
            "outcome": f"fixed: {m.group('outcome').strip()}",
            "consequences": "issue resolved",
        }
    ),

    # Trading pattern: "{entity} {action} {asset}" with market terms
    (
        r"(?P<subject>(?:whale|trader|market maker|exchange|wallet)[^.!?,]*?)\s+(?P<action>(?:accumulates?|sells?|buys?|moves?|transfers?)[^.!?,]+)",
        lambda m: {
            "subject": m.group("subject").strip(),
            "action": m.group("action").strip(),
            "outcome": "market activity detected",
            "consequences": "potential price impact",
        }
    ),
]


def extract_atoms_local(text: str) -> List[Dict[str, Any]]:
    """
    Extract atoms using local pattern matching.
    No API tokens needed - 100% local.

    Returns list of extracted atom dicts (not yet saved to DB).
    """
    atoms = []
    text_normalized = text.strip()

    for pattern, extractor in CAUSAL_PATTERNS:
        matches = re.finditer(pattern, text_normalized)
        for match in matches:
            try:
                atom = extractor(match)
                # Validate atom has content
                if all(len(v) >= 2 for v in atom.values()):
                    atom["extraction_method"] = "local_pattern"
                    atom["confidence"] = 0.7  # Pattern match confidence
                    atoms.append(atom)
            except Exception:
                continue  # Skip failed extractions

    return atoms


def estimate_atom_confidence(atom: Dict[str, Any]) -> float:
    """
    Estimate confidence based on atom quality.
    Higher confidence for more complete atoms.
    """
    confidence = 0.5

    # Reward specific subjects (not just pronouns)
    if len(atom.get("subject", "")) > 10 and atom["subject"].lower() not in ("i", "we", "they", "it"):
        confidence += 0.1

    # Reward specific actions
    if len(atom.get("action", "")) > 15:
        confidence += 0.1

    # Reward specific outcomes
    if len(atom.get("outcome", "")) > 15:
        confidence += 0.1

    # Reward specific consequences
    if len(atom.get("consequences", "")) > 20 and atom["consequences"] not in (
        "extracted from causal pattern", "conditional relationship", "consequential relationship"
    ):
        confidence += 0.2

    return min(confidence, 1.0)


def extract_atoms_llm(text: str) -> List[Dict[str, Any]]:
    """
    Extract atoms using LLM (token-conscious fallback).

    Only called when local patterns fail and text seems important.
    Uses structured output to minimize tokens.

    TODO: Implement actual LLM call when needed.
    For now, returns empty list (local-first approach).
    """
    # Placeholder for LLM-based extraction
    # This would call the API with a structured prompt:
    #
    # PROMPT = """Extract causal knowledge from this text.
    # Return JSON array of: {"subject": "who/what", "action": "does what", "outcome": "result", "consequences": "what follows"}
    # Only extract clear causal relationships. If none found, return [].
    # Text: {text}"""
    #
    # For now, return empty to stay token-conscious
    return []


def atomize_text(
    text: str,
    source: str = "memory",
    save_to_db: bool = True,
    use_llm_fallback: bool = False
) -> List[str]:
    """
    Extract atoms from text and optionally save to database.

    Strategy:
    1. Try local pattern matching first (free)
    2. If no atoms found and use_llm_fallback=True, try LLM (costs tokens)

    Returns list of created atom IDs.
    """
    init_db()

    # Step 1: Local extraction
    atoms = extract_atoms_local(text)

    # Step 2: LLM fallback if enabled and no atoms found
    if not atoms and use_llm_fallback:
        atoms = extract_atoms_llm(text)

    if not atoms:
        return []

    # Save atoms to database
    atom_ids = []
    for atom in atoms:
        # Update confidence based on quality
        atom["confidence"] = estimate_atom_confidence(atom)

        if save_to_db:
            atom_id = create_atom(
                subject=atom["subject"],
                action=atom["action"],
                outcome=atom["outcome"],
                consequences=atom["consequences"],
                source=source,
                confidence=atom["confidence"],
            )
            atom_ids.append(atom_id)
        else:
            atom_ids.append(None)

    return atom_ids


def batch_atomize_stm() -> Tuple[int, int]:
    """
    Atomize all existing STM memories.

    Returns (processed_count, atoms_created).
    """
    from stm_manager import load_stm

    stm = load_stm()
    items = stm.get("short_term_memory", [])

    processed = 0
    atoms_created = 0

    for item in items:
        content = item.get("content", "")
        if len(content) < 20:  # Skip very short items
            continue

        atom_ids = atomize_text(content, source="stm_batch", save_to_db=True)
        processed += 1
        atoms_created += len(atom_ids)

    return processed, atoms_created


def batch_atomize_embeddings() -> Tuple[int, int]:
    """
    Atomize all existing embeddings database memories.

    Returns (processed_count, atoms_created).
    """
    from embeddings_manager import DB_PATH
    import sqlite3

    if not DB_PATH.exists():
        return 0, 0

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    c.execute("SELECT content, source FROM memories")
    rows = c.fetchall()
    conn.close()

    processed = 0
    atoms_created = 0

    for content, source in rows:
        if len(content) < 20:
            continue

        atom_ids = atomize_text(content, source=f"embed_batch:{source}", save_to_db=True)
        processed += 1
        atoms_created += len(atom_ids)

    return processed, atoms_created


def auto_atomize_on_store(content: str, source: str = "auto") -> List[str]:
    """
    Called when a new memory is stored to auto-extract atoms.

    This enables gradual migration: as new memories come in,
    they're automatically atomized.
    """
    # Only atomize if content seems substantive
    if len(content) < 30:
        return []

    # Check for causal indicators that suggest atomizable content
    causal_indicators = [
        "because", "therefore", "consequently", "results in",
        "leads to", "causes", "when", "if", "then",
        "learned", "realized", "decided", "prefer",
        "fixed", "resolved", "discovered"
    ]

    content_lower = content.lower()
    if not any(ind in content_lower for ind in causal_indicators):
        return []  # Skip content unlikely to have causal structure

    return atomize_text(content, source=source, save_to_db=True)


if __name__ == "__main__":
    print("=== Phase 3B: Atomization Pipeline Demo ===\n")

    # Test local extraction
    test_texts = [
        "When whale wallets accumulate tokens, the price typically rises within 4-12 hours.",
        "I learned that checking on-chain data before trading gives a significant edge.",
        "Fixed the authentication bug by adding proper token refresh handling.",
        "The market maker detected the concentration pattern, which triggered institutional buying.",
        "Peter prefers verbose explanations with code examples over brief summaries.",
        "Decided to use GPU embeddings because they're 10x faster than CPU.",
    ]

    print("Testing local pattern extraction:\n")
    for text in test_texts:
        print(f"Text: {text[:60]}...")
        atoms = extract_atoms_local(text)
        if atoms:
            for atom in atoms:
                print(f"  → Subject: {atom['subject'][:30]}...")
                print(f"    Action: {atom['action'][:30]}...")
                print(f"    Outcome: {atom['outcome'][:30]}...")
                print(f"    Consequences: {atom['consequences'][:30]}...")
                print(f"    Confidence: {estimate_atom_confidence(atom):.2f}")
        else:
            print("  → No atoms extracted (pattern didn't match)")
        print()

    # Test batch atomization
    print("\n=== Batch Atomization ===\n")
    print("Atomizing STM memories...")
    stm_processed, stm_atoms = batch_atomize_stm()
    print(f"  Processed: {stm_processed}, Atoms created: {stm_atoms}")

    print("\nAtomizing embeddings memories...")
    emb_processed, emb_atoms = batch_atomize_embeddings()
    print(f"  Processed: {emb_processed}, Atoms created: {emb_atoms}")

    print("\n✓ Phase 3B Atomization Pipeline ready!")
