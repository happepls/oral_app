#!/usr/bin/env python3
"""
Debug feedback detection logic
"""

import re

def debug_feedback_detection():
    test_messages = [
        "Close! Try: \"Hi, how's it going?\" — you're almost there.",
        "Good.",
        "Almost! Try: 'How are you doing?'",
        "Better!",
        "Hello! How can I help you today?"
    ]
    
    for msg in test_messages:
        is_feedback = msg and (
            "Close! Try:" in msg or 
            "Try:" in msg or
            "Almost!" in msg or
            (msg and re.match(r"^[A-Z][a-z]+! Try:", msg))
        )
        
        print(f"Message: '{msg}'")
        print(f"  Contains 'Close! Try:': {'Close! Try:' in msg}")
        print(f"  Contains 'Try:': {'Try:' in msg}")
        print(f"  Contains 'Almost!': {'Almost!' in msg}")
        print(f"  Matches regex: {bool(re.match(r'^[A-Z][a-z]+! Try:', msg))}")
        print(f"  Is feedback: {is_feedback}")
        print()

if __name__ == "__main__":
    debug_feedback_detection()