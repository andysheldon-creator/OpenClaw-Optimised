"""
Unit tests for Google Places API place_id validation.

These tests ensure that the _validate_place_id function correctly:
1. Accepts valid Google Place IDs
2. Rejects path traversal attempts
3. Rejects malformed place IDs
"""

import pytest
from fastapi import HTTPException
from local_places.google_places import _validate_place_id

class TestValidatePlaceId:
    """Test suite for place_id validation."""

    def test_valid_place_ids(self):
        """Test that valid Google Place IDs are accepted."""
        valid_ids = [
            "ChIJN1t_tDeuEmsRUsoyG83frY4",  # Common format starting with ChIJ
            "Ei1Tb21lIFBsYWNlIE5hbWU",      # Base64-like format
            "GhIJQWJjZGVmZ2hpamtsbW5vcA",   # Starting with GhIJ
            "valid_place-id_123",            # With underscores and hyphens
            "A" * 100,                       # Long valid ID
            "1234567890",                    # Numeric only (minimum length)
        ]

        for place_id in valid_ids:
            try:
                _validate_place_id(place_id)
            except HTTPException:
                pytest.fail(f"Valid place_id '{place_id}' was incorrectly rejected")

    def test_path_traversal_attempts(self):
        """Test that path traversal attempts are rejected."""
        malicious_ids = [
            "../../../etc/passwd",
            "place/../other",
            "./local/file",
            "..\\..\\windows\\system32",
            "%2e%2e%2f%2e%2e%2ffile",  # URL-encoded ../
            "place/../../file",
            "//network/share",
        ]

        for place_id in malicious_ids:
            with pytest.raises(HTTPException) as exc_info:
                _validate_place_id(place_id)
            assert exc_info.value.status_code == 400
            assert "Invalid place_id format" in exc_info.value.detail

    def test_special_characters(self):
        """Test that place IDs with special characters are rejected."""
        invalid_ids = [
            "place@id",              # @ symbol
            "place id",              # Space
            "place/id",              # Forward slash
            "place\\id",             # Backslash
            "place?id=123",          # Query string
            "place#anchor",          # Hash
            "place;drop table",      # Semicolon (SQL injection attempt)
            "place&param=value",     # Ampersand
            "place|command",         # Pipe
            "place`whoami`",         # Backticks (command injection)
            "place$variable",        # Dollar sign
            "place!important",       # Exclamation
            "place*wildcard",        # Asterisk
            "place(parens)",         # Parentheses
            "place[brackets]",       # Brackets
            "place{braces}",         # Braces
            "place<tag>",            # Angle brackets (XSS attempt)
        ]

        for place_id in invalid_ids:
            with pytest.raises(HTTPException) as exc_info:
                _validate_place_id(place_id)
            assert exc_info.value.status_code == 400

    def test_empty_or_none(self):
        """Test that empty or None place IDs are rejected."""
        invalid_ids = ["", None]

        for place_id in invalid_ids:
            with pytest.raises(HTTPException) as exc_info:
                _validate_place_id(place_id)
            assert exc_info.value.status_code == 400
            assert "must be a non-empty string" in exc_info.value.detail

    def test_length_validation(self):
        """Test that place IDs are validated for appropriate length."""
        # Too short
        with pytest.raises(HTTPException) as exc_info:
            _validate_place_id("short")
        assert exc_info.value.status_code == 400
        assert "Invalid place_id length" in exc_info.value.detail

        # Too long
        with pytest.raises(HTTPException) as exc_info:
            _validate_place_id("A" * 301)
        assert exc_info.value.status_code == 400
        assert "Invalid place_id length" in exc_info.value.detail

        # Boundary cases - should pass
        _validate_place_id("A" * 10)   # Minimum length
        _validate_place_id("A" * 300)  # Maximum length

    def test_mixed_case(self):
        """Test that mixed case alphanumeric IDs are accepted."""
        valid_ids = [
            "ChIJAbCdEfGhIjKlMnOpQrStUvWxYz",
            "UPPERCASE123",
            "lowercase456",
            "MiXeDCaSe789",
        ]

        for place_id in valid_ids:
            try:
                _validate_place_id(place_id)
            except HTTPException:
                pytest.fail(f"Valid mixed-case place_id '{place_id}' was incorrectly rejected")

    def test_underscores_and_hyphens(self):
        """Test that underscores and hyphens are allowed."""
        valid_ids = [
            "place_with_underscores_123",
            "place-with-hyphens-456",
            "place_with-both_789",
            "___underscores___",
            "---hyphens---mixed123",
        ]

        for place_id in valid_ids:
            try:
                _validate_place_id(place_id)
            except HTTPException:
                pytest.fail(f"Valid place_id '{place_id}' with underscores/hyphens was incorrectly rejected")

if __name__ == "__main__":
    # Run tests
    pytest.main([__file__, "-v"])
