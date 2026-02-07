#!/usr/bin/env python3
"""
Deep Abstraction Layer - Phase 3E of Cortex Memory System

The "thinking layer" that automatically applies atomic knowledge.
- Classifies queries as causal vs recall
- Automatically traverses causal chains for causal queries
- Implements "keep going until no" logic
- Surfaces novel indicators that others miss

This is the brain of Phase 3: it makes Helios think in atoms automatically.
"""
import re
import json
import os
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime

# Import atom manager for causal traversal
from atom_manager import (
    search_by_field,
    find_root_causes,
    find_all_paths_to_outcome,
    get_atom,
    init_db,
    EMBEDDINGS_AVAILABLE,
)

# Data directory
DATA_DIR = Path(os.environ.get("CORTEX_DATA_DIR", Path(__file__).parent))


# ============================================================================
# Query Classification
# ============================================================================

# Patterns that indicate causal/deep queries (need atomic traversal)
CAUSAL_PATTERNS = [
    # Why questions
    r"\bwhy\b.*\?",
    r"\bwhat\s+caus",
    r"\bwhat\s+leads?\s+to\b",
    r"\bwhat\s+results?\s+in\b",

    # How questions about mechanisms
    r"\bhow\s+does\b.*\bwork\b",
    r"\bhow\s+do\b.*\bhappen\b",
    r"\bhow\s+can\b.*\bpredict\b",

    # Prediction/forecasting
    r"\bpredict\b",
    r"\bforecast\b",
    r"\bwhat\s+will\s+happen\b",
    r"\bwhat\s+might\s+happen\b",
    r"\banticipate\b",

    # Strategy/planning
    r"\bstrategy\b",
    r"\bplan\b.*\bfor\b",
    r"\bhow\s+(?:should|to)\b",
    r"\boptimize\b",
    r"\bimprove\b",

    # Root cause analysis
    r"\broot\s+cause\b",
    r"\bdiagnose\b",
    r"\bdebug\b",
    r"\binvestigate\b",
    r"\banalyze\b.*\bwhy\b",

    # Pattern finding
    r"\bpattern\b",
    r"\btrend\b",
    r"\bcorrelat",
    r"\brelationship\s+between\b",
    r"\bconnect",

    # Consequence exploration
    r"\bwhat\s+(?:if|happens)\b",
    r"\bconsequences?\b",
    r"\bimplications?\b",
    r"\bimpact\b",
    r"\beffects?\s+of\b",

    # Trading/market specific
    r"\bindicator",
    r"\bsignal",
    r"\bprice\s+movement",
    r"\bmarket\b.*\breact",
    r"\bwhale\b",
    r"\baccumulat",
]

# Patterns that indicate simple recall (no deep traversal needed)
RECALL_PATTERNS = [
    r"^what\s+is\b",
    r"^define\b",
    r"^list\b",
    r"^show\s+me\b",
    r"^tell\s+me\s+about\b",
    r"^describe\b",
    r"^explain\s+what\b",  # "explain what X is" vs "explain why X happens"
    r"^who\s+is\b",
    r"^when\s+(?:was|is|did)\b",
    r"^where\b",
]


def classify_query(query: str) -> Tuple[str, float]:
    """
    Classify a query as 'causal' or 'recall'.

    Returns (query_type, confidence).

    Causal queries trigger deep abstraction and atom traversal.
    Recall queries just need simple memory retrieval.
    """
    query_lower = query.lower().strip()

    # Check for recall patterns first (they're more specific)
    for pattern in RECALL_PATTERNS:
        if re.search(pattern, query_lower):
            return ("recall", 0.8)

    # Check for causal patterns
    causal_matches = 0
    for pattern in CAUSAL_PATTERNS:
        if re.search(pattern, query_lower):
            causal_matches += 1

    if causal_matches >= 2:
        return ("causal", 0.9)
    elif causal_matches == 1:
        return ("causal", 0.7)

    # Default to recall with low confidence
    return ("recall", 0.5)


# ============================================================================
# Deep Abstraction Engine
# ============================================================================

def extract_query_targets(query: str) -> List[str]:
    """
    Extract the key concepts/targets from a query that we should search for.

    Example: "Why does whale accumulation precede price movement?"
    Returns: ["whale accumulation", "price movement"]
    """
    targets = []
    query_lower = query.lower()

    # Remove question words and common filler
    cleaned = re.sub(r"\b(why|what|how|does|do|did|is|are|was|were|the|a|an|to|for|of|in|on|with)\b", " ", query_lower)
    cleaned = re.sub(r"[?.,!]", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    # Split into potential targets (noun phrases)
    # Simple approach: split on common conjunctions and prepositions
    parts = re.split(r"\b(and|or|but|then|after|before|causes?|leads?\s+to|results?\s+in)\b", cleaned)

    for part in parts:
        part = part.strip()
        if len(part) > 3 and part not in ("and", "or", "but", "then", "after", "before"):
            targets.append(part)

    return targets[:5]  # Limit to 5 targets


def abstract_deeper(
    query: str,
    max_depth: int = 5,
    min_confidence: float = 0.5
) -> Dict[str, Any]:
    """
    The core Deep Abstraction function.

    Given a query, this function:
    1. Extracts targets from the query
    2. Searches atoms by outcome (what leads to these targets?)
    3. Recursively traverses backward to find root causes
    4. Returns novel indicators at the deepest levels

    This is the "keep going until no" implementation.
    """
    init_db()

    result = {
        "query": query,
        "query_type": "causal",
        "targets": [],
        "causal_chains": [],
        "novel_indicators": [],
        "epistemic_limits": [],
        "depth_reached": 0,
        "atoms_traversed": 0,
    }

    # Extract targets from query
    targets = extract_query_targets(query)
    result["targets"] = targets

    if not targets:
        result["epistemic_limits"].append("Could not extract meaningful targets from query")
        return result

    all_roots = []
    all_chains = []
    visited_atoms = set()

    for target in targets:
        # Search for atoms with this outcome
        outcome_atoms = search_by_field("outcome", target, limit=10, threshold=min_confidence)

        # Also search consequences (what leads to this consequence?)
        consequence_atoms = search_by_field("consequences", target, limit=10, threshold=min_confidence)

        starting_atoms = outcome_atoms + consequence_atoms

        for atom in starting_atoms:
            if atom["id"] in visited_atoms:
                continue
            visited_atoms.add(atom["id"])

            # Build the causal chain for this atom
            chain = {
                "target": target,
                "starting_atom": atom,
                "root_causes": [],
                "depth": 0,
            }

            # Find root causes (recursive backward traversal)
            roots = find_root_causes(atom["id"], max_depth=max_depth)
            chain["root_causes"] = roots
            chain["depth"] = max(r.get("depth", 0) for r in roots) if roots else 0

            all_chains.append(chain)
            all_roots.extend(roots)

            result["depth_reached"] = max(result["depth_reached"], chain["depth"])

    result["atoms_traversed"] = len(visited_atoms)
    result["causal_chains"] = all_chains

    # Identify novel indicators (roots that appear multiple times = strong signals)
    root_counts = {}
    for root in all_roots:
        root_id = root["id"]
        if root_id not in root_counts:
            root_counts[root_id] = {"atom": root, "count": 0, "chains": []}
        root_counts[root_id]["count"] += 1

    # Sort by frequency - most common roots are the novel indicators
    sorted_roots = sorted(root_counts.values(), key=lambda x: x["count"], reverse=True)
    result["novel_indicators"] = [
        {
            "atom": r["atom"],
            "frequency": r["count"],
            "insight": f"This root cause appears in {r['count']} causal chain(s)"
        }
        for r in sorted_roots[:10]  # Top 10 novel indicators
    ]

    # Note epistemic limits
    if result["depth_reached"] == 0:
        result["epistemic_limits"].append("No causal chains found - may need more atomic knowledge")
    elif result["depth_reached"] < 3:
        result["epistemic_limits"].append(f"Shallow depth ({result['depth_reached']}) - causal knowledge may be incomplete")

    if not result["novel_indicators"]:
        result["epistemic_limits"].append("No novel indicators found at chain roots")

    return result


def format_abstraction_result(result: Dict[str, Any]) -> str:
    """
    Format the abstraction result for injection into context.
    """
    lines = []

    if result["novel_indicators"]:
        lines.append("🔍 DEEP ABSTRACTION INSIGHTS:")
        lines.append(f"   Query analyzed: {result['query'][:60]}...")
        lines.append(f"   Depth reached: {result['depth_reached']} levels")
        lines.append(f"   Atoms traversed: {result['atoms_traversed']}")
        lines.append("")
        lines.append("   📊 Novel Indicators (root causes others miss):")

        for i, ind in enumerate(result["novel_indicators"][:5], 1):
            atom = ind["atom"]
            lines.append(f"   {i}. [{ind['frequency']}x] {atom['subject']} → {atom['action'][:40]}...")
            lines.append(f"      Outcome: {atom['outcome'][:50]}...")
            if atom.get("depth"):
                lines.append(f"      (depth {atom['depth']})")

        if result["epistemic_limits"]:
            lines.append("")
            lines.append("   ⚠️ Epistemic limits:")
            for limit in result["epistemic_limits"]:
                lines.append(f"      - {limit}")

    return "\n".join(lines)


def process_query_with_abstraction(
    query: str,
    auto_abstract: bool = True,
    max_depth: int = 5
) -> Dict[str, Any]:
    """
    Main entry point for the Deep Abstraction Layer.

    1. Classifies the query
    2. If causal, runs deep abstraction
    3. Returns enriched context

    This is called from the before_agent_start hook.
    """
    query_type, confidence = classify_query(query)

    result = {
        "query": query,
        "query_type": query_type,
        "classification_confidence": confidence,
        "abstraction_performed": False,
        "abstraction_result": None,
        "context_injection": "",
    }

    # Only run deep abstraction for causal queries with sufficient confidence
    if query_type == "causal" and confidence >= 0.6 and auto_abstract:
        abstraction = abstract_deeper(query, max_depth=max_depth)
        result["abstraction_performed"] = True
        result["abstraction_result"] = abstraction

        # Format for context injection
        if abstraction["novel_indicators"]:
            result["context_injection"] = format_abstraction_result(abstraction)

    return result


# ============================================================================
# Testing
# ============================================================================

if __name__ == "__main__":
    print("=== Phase 3E: Deep Abstraction Layer Demo ===\n")

    # Test query classification
    test_queries = [
        "Why does whale accumulation precede price movement?",
        "What causes market crashes?",
        "Generate a trading strategy for crypto",
        "What is Bitcoin?",
        "List all my memories",
        "How can I predict price movements?",
        "What are the indicators of a pump?",
        "Tell me about the project structure",
        "Investigate why the API is failing",
        "What patterns lead to successful trades?",
    ]

    print("Query Classification:\n")
    for query in test_queries:
        qtype, conf = classify_query(query)
        marker = "🧠" if qtype == "causal" else "📚"
        print(f"  {marker} [{qtype}:{conf:.1f}] {query[:50]}...")

    print("\n" + "="*60)
    print("\nDeep Abstraction Test:\n")

    # Test deep abstraction on a causal query
    test_query = "Why does whale accumulation precede price movement?"
    result = process_query_with_abstraction(test_query, auto_abstract=True)

    print(f"Query: {test_query}")
    print(f"Type: {result['query_type']} (confidence: {result['classification_confidence']:.2f})")
    print(f"Abstraction performed: {result['abstraction_performed']}")

    if result["context_injection"]:
        print("\nContext Injection:")
        print(result["context_injection"])
    else:
        print("\nNo novel indicators found (need more atomic knowledge in database)")

    print("\n✓ Phase 3E Deep Abstraction Layer ready!")
