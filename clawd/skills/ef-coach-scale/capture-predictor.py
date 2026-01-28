#!/usr/bin/env python3
"""
Capture Predictor - Learn patterns in what gets captured.
Propose automatic PARA organization and suggest systems for recurring themes.
"""

import sqlite3
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from collections import Counter


class CapturePredictor:
    """
    Analyzes captured items to suggest PARA organization
    and identify recurring patterns for system improvement.
    """

    def __init__(self, db_path: str = None, para_db_path: str = None):
        """
        Initialize Capture Predictor.

        Args:
            db_path: Path to patterns.db. Defaults to skill directory.
            para_db_path: Path to PARA database. Defaults to ~/clawd/memory/para.sqlite.
        """
        if db_path is None:
            db_path = str(Path(__file__).parent / "patterns.db")
        if para_db_path is None:
            para_db_path = str(Path.home() / "clawd" / "memory" / "para.sqlite")

        self.db_path = db_path
        self.para_db_path = para_db_path
        self.conn = None
        self.para_conn = None

    def connect(self) -> None:
        """Establish database connections."""
        self.conn = sqlite3.connect(self.db_path)
        self.para_conn = sqlite3.connect(self.para_db_path)

    def close(self) -> None:
        """Close database connections."""
        if self.conn:
            self.conn.close()
        if self.para_conn:
            self.para_conn.close()

    def analyze_capture(self, capture_text: str) -> Tuple[str, str, float]:
        """
        Analyze a new capture and suggest PARA organization.

        Args:
            capture_text: The text to analyze.

        Returns:
            Tuple of (para_type, category, confidence).
        """
        # Analyze patterns from history
        patterns = self._get_capture_patterns()

        # Extract features
        keywords = self._extract_features(capture_text)
        has_date = bool(re.search(r'\d{1,2}[/-]\d{1,2}|\d{1,2}\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)', capture_text.lower()))
        has_action = bool(re.search(r'\b(?:call|email|schedule|remind|reply|send|ask|check|review|update)\b', capture_text.lower()))
        has_question = '?' in capture_text
        has_url = bool(re.search(r'https?://', capture_text))
        is_reference = has_url or len(capture_text.split()) > 20  # Longer captures often references

        # Rules-based classification
        para_type = "resource"  # Default
        category = "uncategorized"
        confidence = 0.5

        # Active task indicators
        if has_action and not is_reference:
            para_type = "project" if "project" in capture_text.lower() or "deadline" in capture_text.lower() else "area"
            category = "action_item" if has_action else "task"
            confidence = 0.75

        # Reference/learning indicators
        elif is_reference or "read" in capture_text.lower() or "article" in capture_text.lower():
            para_type = "resource"
            category = self._guess_resource_category(capture_text)
            confidence = 0.7

        # Question/inquiry indicators
        elif has_question or "todo" in capture_text.lower() or "remember" in capture_text.lower():
            para_type = "project"
            category = "question" if has_question else "reminder"
            confidence = 0.6

        # Check for pattern matches
        for pattern in patterns:
            pattern_keywords = pattern["keywords"].split(",")
            matches = sum(1 for kw in pattern_keywords if kw.strip().lower() in capture_text.lower())

            if matches >= 2:  # Require at least 2 keyword matches
                para_type = pattern["suggested_para_type"]
                category = pattern["suggested_category"] or "pattern_match"
                confidence = min(0.85, pattern["confidence"] + 0.1)
                break

        return para_type, category, confidence

    def _get_capture_patterns(self, days_back: int = 30) -> List[Dict]:
        """
        Get learned capture patterns from accepted suggestions.

        Args:
            days_back: How many days to look back.

        Returns:
            List of pattern dictionaries.
        """
        try:
            cursor = self.conn.cursor()

            cursor.execute("""
                SELECT suggested_para_type, suggested_category, confidence,
                       capture_text
                FROM capture_patterns
                WHERE user_accepted = 1
                AND timestamp > datetime('now', '-{} days')
                ORDER BY confidence DESC
                LIMIT 20
            """.format(days_back))

            patterns = []
            for row in cursor.fetchall():
                para_type, category, confidence, text = row
                keywords = self._extract_features(text)

                patterns.append({
                    "suggested_para_type": para_type,
                    "suggested_category": category,
                    "confidence": confidence,
                    "keywords": ", ".join(keywords[:5])
                })

            return patterns

        except sqlite3.Error:
            return []

    def _extract_features(self, text: str) -> List[str]:
        """
        Extract keywords/features from text.

        Args:
            text: Text to analyze.

        Returns:
            List of keywords.
        """
        # Remove common stop words
        stop_words = {
            "the", "and", "for", "are", "but", "not", "you", "all", "can",
            "her", "was", "one", "our", "out", "with", "just", "from",
            "have", "new", "more", "about", "this", "that", "will", "your",
            "when", "what", "which", "their", "there", "been", "get", "like"
        }

        # Extract words (3+ chars)
        words = re.findall(r'\b[a-zA-Z]{3,}\b', text.lower())

        # Filter stop words
        keywords = [w for w in words if w not in stop_words]

        return keywords

    def _guess_resource_category(self, text: str) -> str:
        """
        Guess resource category based on content.

        Args:
            text: Text to analyze.

        Returns:
            Category string.
        """
        text_lower = text.lower()

        categories = {
            "article": ["article", "post", "blog", "medium"],
            "video": ["video", "youtube", "watch", "tutorial"],
            "book": ["book", "read", "author", "chapter"],
            "tool": ["tool", "app", "software", "service"],
            "reference": ["reference", "docs", "documentation"],
            "idea": ["idea", "thought", "insight", "concept"]
        }

        for category, keywords in categories.items():
            if any(kw in text_lower for kw in keywords):
                return category

        return "general"

    def log_capture_analysis(self, capture_text: str, para_type: str,
                            category: str, confidence: float) -> int:
        """
        Log a capture analysis for pattern learning.

        Args:
            capture_text: The captured text.
            para_type: Suggested PARA type.
            category: Suggested category.
            confidence: Confidence score.

        Returns:
            Analysis ID.
        """
        try:
            self.connect()
            cursor = self.conn.cursor()

            cursor.execute("""
                INSERT INTO capture_patterns
                (capture_text, suggested_para_type, suggested_category, confidence, user_accepted)
                VALUES (?, ?, ?, ?, NULL)
            """, (capture_text, para_type, category, confidence))

            self.conn.commit()
            analysis_id = cursor.lastrowid
            self.close()

            return analysis_id

        except sqlite3.Error as e:
            print(f"Error logging analysis: {e}")
            return 0

    def record_feedback(self, analysis_id: int, accepted: bool) -> bool:
        """
        Record user feedback on a classification.

        Args:
            analysis_id: ID of the analysis.
            accepted: Whether the suggestion was correct.

        Returns:
            True if successful, False otherwise.
        """
        try:
            self.connect()
            cursor = self.conn.cursor()

            cursor.execute("""
                UPDATE capture_patterns
                SET user_accepted = ?
                WHERE id = ?
            """, (1 if accepted else 0, analysis_id))

            self.conn.commit()
            self.close()
            return True

        except sqlite3.Error as e:
            print(f"Error recording feedback: {e}")
            return False

    def find_recurring_themes(self, min_occurrences: int = 3) -> List[Dict]:
        """
        Identify recurring capture themes that might need systematization.

        Args:
            min_occurrences: Minimum occurrences to consider a theme.

        Returns:
            List of theme dictionaries.
        """
        try:
            cursor = self.conn.cursor()

            # Get recent captures
            cursor.execute("""
                SELECT capture_text, suggested_para_type, user_accepted
                FROM capture_patterns
                WHERE timestamp > datetime('now', '-30 days')
            """)

            all_keywords = []

            for row in cursor.fetchall():
                text, para_type, accepted = row

                # Weight accepted patterns higher
                weight = 2 if accepted else 1

                keywords = self._extract_features(text)
                for kw in keywords:
                    all_keywords.append((kw, para_type, weight))

            # Count occurrences
            keyword_counter = Counter()
            para_type_counter = {}

            for kw, para_type, weight in all_keywords:
                keyword_counter[kw] += weight
                if kw not in para_type_counter:
                    para_type_counter[kw] = Counter()
                para_type_counter[kw][para_type] += weight

            # Find themes (keywords appearing >= min_occurrences times)
            themes = []
            for kw, count in keyword_counter.most_common(20):
                if count >= min_occurrences:
                    # Get dominant PARA type
                    dominant_type = para_type_counter[kw].most_common(1)[0][0]

                    themes.append({
                        "keyword": kw,
                        "occurrences": int(count),
                        "dominant_type": dominant_type,
                        "distribution": dict(para_type_counter[kw])
                    })

            return themes

        except sqlite3.Error:
            return []

    def suggest_system_improvements(self) -> List[Dict]:
        """
        Suggest system improvements based on capture patterns.

        Returns:
            List of improvement suggestions.
        """
        themes = self.find_recurring_themes(min_occurrences=5)
        suggestions = []

        for theme in themes:
            kw = theme["keyword"]
            occurrences = theme["occurrences"]
            dom_type = theme["dominant_type"]

            # Generate suggestion based on type
            if dom_type == "project":
                suggestion = f"'{kw}' appears {occurrences} times. Consider creating a dedicated project or task template."
            elif dom_type == "area":
                suggestion = f"'{kw}' is a recurring area of focus. Might be worth a regular review schedule."
            elif dom_type == "resource":
                suggestion = f"'{kw}' keeps getting saved. Consider a curated reading list or reference system."
            else:
                suggestion = f"'{kw}' is a common capture theme. Is there a better way to organize this?"

            suggestions.append({
                "keyword": kw,
                "occurrences": occurrences,
                "dominant_type": dom_type,
                "suggestion": suggestion
            })

        return suggestions

    def get_classification_stats(self, days_back: int = 30) -> Dict:
        """
        Get statistics on capture classification performance.

        Args:
            days_back: How many days to analyze.

        Returns:
            Statistics dictionary.
        """
        try:
            cursor = self.conn.cursor()

            cursor.execute("""
                SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN user_accepted = 1 THEN 1 ELSE 0 END) as accepted,
                    AVG(CASE WHEN user_accepted = 1 THEN confidence ELSE NULL END) as accepted_confidence,
                    AVG(confidence) as avg_confidence,
                    suggested_para_type
                FROM capture_patterns
                WHERE timestamp > datetime('now', '-{} days')
                GROUP BY suggested_para_type
            """.format(days_back))

            stats = {
                "by_type": [],
                "total_classifications": 0,
                "total_accepted": 0,
                "overall_accuracy": 0
            }

            total_all = 0
            total_accepted_all = 0

            for row in cursor.fetchall():
                total, accepted, acc_conf, avg_conf, para_type = row

                stats["by_type"].append({
                    "type": para_type,
                    "total": total,
                    "accepted": accepted,
                    "accuracy": round((accepted / total * 100) if total > 0 else 0, 1),
                    "avg_confidence": round(avg_conf, 2) if avg_conf else 0
                })

                total_all += total
                total_accepted_all += accepted

            stats["total_classifications"] = total_all
            stats["total_accepted"] = total_accepted_all
            stats["overall_accuracy"] = round((total_accepted_all / total_all * 100) if total_all > 0 else 0, 1)

            return stats

        except sqlite3.Error as e:
            print(f"Error getting stats: {e}")
            return {}

    def batch_analyze_captures(self, captures: List[str]) -> List[Dict]:
        """
        Analyze multiple captures for batch classification.

        Args:
            captures: List of capture texts.

        Returns:
            List of analysis results.
        """
        results = []

        for capture in captures:
            para_type, category, confidence = self.analyze_capture(capture)
            analysis_id = self.log_capture_analysis(capture, para_type, category, confidence)

            results.append({
                "capture": capture,
                "para_type": para_type,
                "category": category,
                "confidence": confidence,
                "analysis_id": analysis_id
            })

        return results


if __name__ == "__main__":
    import sys

    predictor = CapturePredictor()

    if len(sys.argv) > 1:
        command = sys.argv[1]

        if command == "analyze":
            predictor.connect()
            try:
                if len(sys.argv) > 2:
                    capture_text = " ".join(sys.argv[2:])
                    para_type, category, confidence = predictor.analyze_capture(capture_text)
                    analysis_id = predictor.log_capture_analysis(capture_text, para_type, category, confidence)

                    print(f"\n=== Capture Analysis ===")
                    print(f"Text: {capture_text}")
                    print(f"Type: {para_type}")
                    print(f"Category: {category}")
                    print(f"Confidence: {confidence:.2f}")
                    print(f"Analysis ID: {analysis_id}")
            finally:
                predictor.close()

        elif command == "feedback":
            predictor.connect()
            try:
                if len(sys.argv) > 2:
                    analysis_id = int(sys.argv[2])
                    accepted = sys.argv[3].lower() in ["true", "yes", "1"]

                    success = predictor.record_feedback(analysis_id, accepted)
                    print(f"\n{'✓' if success else '✗'} Feedback recorded")
            finally:
                predictor.close()

        elif command == "themes":
            predictor.connect()
            try:
                print("\n=== Recurring Capture Themes ===")
                themes = predictor.find_recurring_themes(min_occurrences=3)

                for theme in themes:
                    print(f"\n• '{theme['keyword']}' ({theme['occurrences']}x)")
                    print(f"  Type: {theme['dominant_type']}")
                    print(f"  Distribution: {theme['distribution']}")
            finally:
                predictor.close()

        elif command == "suggestions":
            predictor.connect()
            try:
                print("\n=== System Improvement Suggestions ===")
                suggestions = predictor.suggest_system_improvements()

                for s in suggestions:
                    print(f"\n• {s['suggestion']}")
            finally:
                predictor.close()

        elif command == "stats":
            predictor.connect()
            try:
                days = int(sys.argv[2]) if len(sys.argv) > 2 else 30
                stats = predictor.get_classification_stats(days_back=days)

                print(f"\n=== Classification Stats ({days} days) ===")
                print(f"\nTotal classifications: {stats['total_classifications']}")
                print(f"Total accepted: {stats['total_accepted']}")
                print(f"Overall accuracy: {stats['overall_accuracy']}%\n")

                print("By type:")
                for type_stat in stats["by_type"]:
                    print(f"  {type_stat['type']}:")
                    print(f"    Total: {type_stat['total']}")
                    print(f"    Accepted: {type_stat['accepted']} ({type_stat['accuracy']}%)")
                    print(f"    Avg confidence: {type_stat['avg_confidence']}")
            finally:
                predictor.close()

        else:
            print("Unknown command")
    else:
        print("Usage: python capture-predictor.py analyze '<capture text>'")
        print("       python capture-predictor.py feedback <id> <true|false>")
        print("       python capture-predictor.py themes")
        print("       python capture-predictor.py suggestions")
        print("       python capture-predictor.py stats [days]")
