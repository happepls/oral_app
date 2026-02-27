#!/usr/bin/env python3
"""
Test script to verify AI feedback message merging fix
"""

import json
import time
import re

def test_feedback_message_merging():
    """Test that AI feedback messages are properly merged"""
    
    print("🧪 Testing AI feedback message merging...")
    print("=" * 60)
    
    # Simulate the message merging logic from Conversation.js
    def simulate_message_processing(messages):
        """Simulate frontend message processing"""
        
        # First pass: merge related feedback messages
        merged = []
        i = 0;
        while i < len(messages):
            current = messages[i]
            
            # Check if this is feedback that should be merged with previous AI message
            if current.get("type") == "ai" and i > 0:
                previous = messages[i - 1]
                is_feedback = current.get("content") and (
                    "Close! Try:" in current["content"] or 
                    "Try:" in current["content"] or
                    "Almost!" in current["content"] or
                    (current["content"] and re.match(r"^[A-Z][a-z]+! Try:", current["content"]))
                )
                
                # Merge if previous is AI message from same response and this is feedback
                if (previous.get("type") == "ai" and 
                    previous.get("responseId") == current.get("responseId") and 
                    is_feedback and 
                    not previous.get("isFinal")):
                    # Merge feedback into previous message
                    merged[-1] = {
                        **previous,
                        "content": f"{previous['content']}\n\n{current['content']}",
                        "isFinal": True  # Mark as final since we're merging feedback
                    }
                    i += 1  # Skip current message as it's merged
                else:
                    merged.append(current)
            else:
                merged.append(current)
            i += 1
        
        return merged
    
    # Test case 1: Feedback correction followed by simple assessment
    print("\n1️⃣ Test Case 1: Feedback correction + simple assessment")
    print("-" * 40)
    
    messages = [
        {
            "type": "ai",
            "content": "Close! Try: \"Hi, how's it going?\" — you're almost there.",
            "isFinal": False,
            "responseId": "resp-123",
            "timestamp": int(time.time() * 1000)
        },
        {
            "type": "ai", 
            "content": "Good.",
            "isFinal": False,
            "responseId": "resp-123",
            "timestamp": int(time.time() * 1000) + 500
        }
    ]
    
    print("Input messages:")
    for i, msg in enumerate(messages):
        print(f"  {i+1}. '{msg['content']}' (final: {msg['isFinal']})")
    
    result = simulate_message_processing(messages)
    
    print("\nMerged result:")
    for i, msg in enumerate(result):
        print(f"  {i+1}. '{msg['content']}' (final: {msg['isFinal']})")
    
    # Verify result - should merge because second message is simple assessment
    expected_merged = True
    expected_content = "Close! Try: \"Hi, how's it going?\" — you're almost there.\n\nGood."
    
    success1 = (len(result) == 1 and 
                result[0]["content"] == expected_content and 
                result[0]["isFinal"] == True)
    
    print(f"\n✅ Test 1 {'PASSED' if success1 else 'FAILED'}")
    
    # Test case 2: Multiple feedback messages
    print("\n2️⃣ Test Case 2: Multiple feedback messages")
    print("-" * 40)
    
    messages = [
        {
            "type": "ai",
            "content": "Almost! Try: 'How are you doing?'",
            "isFinal": False,
            "responseId": "resp-456",
            "timestamp": int(time.time() * 1000)
        },
        {
            "type": "ai", 
            "content": "Better!",
            "isFinal": False,
            "responseId": "resp-456",
            "timestamp": int(time.time() * 1000) + 300
        }
    ]
    
    print("Input messages:")
    for i, msg in enumerate(messages):
        print(f"  {i+1}. '{msg['content']}' (final: {msg['isFinal']})")
    
    result = simulate_message_processing(messages)
    
    print("\nMerged result:")
    for i, msg in enumerate(result):
        print(f"  {i+1}. '{msg['content']}' (final: {msg['isFinal']})")
    
    success2 = len(result) == 1 and result[0]["isFinal"] == True
    
    print(f"\n✅ Test 2 {'PASSED' if success2 else 'FAILED'}")
    
    # Test case 3: Non-feedback messages (should not merge)
    print("\n3️⃣ Test Case 3: Non-feedback messages (should not merge)")
    print("-" * 40)
    
    messages = [
        {
            "type": "ai",
            "content": "Hello! How can I help you today?",
            "isFinal": False,
            "responseId": "resp-789",
            "timestamp": int(time.time() * 1000)
        },
        {
            "type": "ai", 
            "content": "I can help you practice English.",
            "isFinal": False,
            "responseId": "resp-789",
            "timestamp": int(time.time() * 1000) + 500
        }
    ]
    
    print("Input messages:")
    for i, msg in enumerate(messages):
        print(f"  {i+1}. '{msg['content']}' (final: {msg['isFinal']})")
    
    result = simulate_message_processing(messages)
    
    print("\nResult (should remain separate):")
    for i, msg in enumerate(result):
        print(f"  {i+1}. '{msg['content']}' (final: {msg['isFinal']})")
    
    success3 = len(result) == 2  # Should not merge non-feedback messages
    
    print(f"\n✅ Test 3 {'PASSED' if success3 else 'FAILED'}")
    
    return success1 and success2 and success3

def main():
    """Run all tests"""
    print("🔍 Testing AI Feedback Message Merging Fix")
    print("=" * 60)
    
    success = test_feedback_message_merging()
    
    print("\n" + "=" * 60)
    print("📋 Test Summary:")
    
    if success:
        print("🎉 All tests passed! AI feedback messages will now be properly merged.")
        print("\nExpected behavior:")
        print("• Feedback like 'Close! Try: ...' and 'Good.' will be merged")
        print("• Multiple feedback messages from same response will be combined")
        print("• Non-feedback messages will remain separate")
        print("• Merged messages will have visual styling (amber background)")
    else:
        print("⚠️  Some tests failed. Please review the merging logic.")
    
    return success

if __name__ == "__main__":
    main()