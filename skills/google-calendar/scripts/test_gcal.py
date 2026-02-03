#!/usr/bin/env python3
"""
Unit tests for Google Calendar CLI.
Tests date/time parsing without needing API credentials.
"""

import unittest
from datetime import datetime, timedelta, date
from gcal_utils import parse_date, parse_time


class TestDateParsing(unittest.TestCase):
    """Test date parsing functions."""
    
    def test_parse_today(self):
        """Test 'today' keyword."""
        result = parse_date('today')
        self.assertEqual(result, datetime.now().date())
    
    def test_parse_tomorrow(self):
        """Test 'tomorrow' keyword."""
        result = parse_date('tomorrow')
        expected = datetime.now().date() + timedelta(days=1)
        self.assertEqual(result, expected)
    
    def test_parse_yesterday(self):
        """Test 'yesterday' keyword."""
        result = parse_date('yesterday')
        expected = datetime.now().date() - timedelta(days=1)
        self.assertEqual(result, expected)
    
    def test_parse_iso_date(self):
        """Test ISO format YYYY-MM-DD."""
        result = parse_date('2026-02-15')
        self.assertEqual(result, date(2026, 2, 15))
    
    def test_parse_us_date(self):
        """Test US format MM/DD/YYYY."""
        result = parse_date('02/15/2026')
        self.assertEqual(result, date(2026, 2, 15))
    
    def test_parse_eu_date(self):
        """Test EU format DD/MM/YYYY."""
        result = parse_date('15/02/2026')
        self.assertEqual(result, date(2026, 2, 15))
    
    def test_case_insensitive(self):
        """Test case insensitivity."""
        self.assertEqual(parse_date('TODAY'), datetime.now().date())
        self.assertEqual(parse_date('Tomorrow'), datetime.now().date() + timedelta(days=1))


class TestTimeParsing(unittest.TestCase):
    """Test time parsing functions."""
    
    def test_parse_24_hour(self):
        """Test 24-hour format."""
        hour, minute = parse_time('14:30')
        self.assertEqual(hour, 14)
        self.assertEqual(minute, 30)
    
    def test_parse_12_hour_pm(self):
        """Test 12-hour PM format."""
        hour, minute = parse_time('2pm')
        self.assertEqual(hour, 14)
        self.assertEqual(minute, 0)
        
        hour, minute = parse_time('2:30pm')
        self.assertEqual(hour, 14)
        self.assertEqual(minute, 30)
    
    def test_parse_12_hour_am(self):
        """Test 12-hour AM format."""
        hour, minute = parse_time('9am')
        self.assertEqual(hour, 9)
        self.assertEqual(minute, 0)
        
        hour, minute = parse_time('9:30am')
        self.assertEqual(hour, 9)
        self.assertEqual(minute, 30)
    
    def test_parse_midnight(self):
        """Test midnight parsing."""
        hour, minute = parse_time('12am')
        self.assertEqual(hour, 0)
        self.assertEqual(minute, 0)
    
    def test_parse_noon(self):
        """Test noon parsing."""
        hour, minute = parse_time('12pm')
        self.assertEqual(hour, 12)
        self.assertEqual(minute, 0)


class TestEdgeCases(unittest.TestCase):
    """Test edge cases and error handling."""
    
    def test_invalid_date_raises_error(self):
        """Test that invalid dates raise ValueError."""
        with self.assertRaises(ValueError):
            parse_date('not-a-date')
    
    def test_invalid_time_raises_error(self):
        """Test that invalid times raise ValueError."""
        with self.assertRaises(ValueError):
            parse_time('not-a-time')
    
    def test_empty_string_raises_error(self):
        """Test empty strings raise errors."""
        with self.assertRaises(ValueError):
            parse_date('')
        with self.assertRaises(ValueError):
            parse_time('')


def run_tests():
    """Run all tests and return success status."""
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromModule(__import__(__name__))
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    return result.wasSuccessful()


if __name__ == '__main__':
    import sys
    success = run_tests()
    sys.exit(0 if success else 1)
