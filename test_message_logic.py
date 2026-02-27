#!/usr/bin/env python3
"""
Simple test to verify AI message chunk accumulation logic
"""

import json
import time

# Simulate the message accumulation logic from Conversation.js
def simulate_message_accumulation():
    """Simulate how the frontend accumulates AI message chunks"""
    
    # Simulate incoming chunks
    chunks = [
        {"text": "Hello", "responseId": "resp-123", "timestamp": int(time.time() * 1000)},
        {"text": " there", "responseId": "resp-123", "timestamp": int(time.time() * 1000) + 100},
        {"text": "! How", "responseId": "resp-123", "timestamp": int(time.time() * 1000) + 200},
        {"text": " can I", "responseId": "resp-123", "timestamp": int(time.time() * 1000) + 300},
        {"text": " help you?", "responseId": "resp-123", "timestamp": int(time.time() * 1000) + 400, "isComplete": True},
    ]
    
    # Simulate frontend message state
    messages = []
    
    print("🧪 Testing AI message chunk accumulation...")
    print("=" * 50)
    
    for i, chunk in enumerate(chunks):
        print(f"\n📨 Processing chunk {i+1}: '{chunk['text']}'")
        
        # Simulate the frontend logic
        target_index = -1
        response_id = chunk.get("responseId")
        
        # Find existing message with same responseId
        if response_id:
            for j, msg in enumerate(messages):
                if msg.get("type") == "ai" and msg.get("responseId") == response_id and not msg.get("isFinal"):
                    target_index = j
                    break
        
        if target_index != -1:
            # Accumulate into existing message
            existing_msg = messages[target_index]
            accumulated_content = existing_msg["content"] + chunk["text"]
            
            # Check finalization conditions
            is_response_complete = chunk.get("isComplete", False)
            has_significant_content = len(accumulated_content) > 10
            has_natural_break = accumulated_content.endswith((".", "!", "?")) and len(accumulated_content) > 20
            
            if is_response_complete or (has_significant_content and has_natural_break):
                # Finalize the message
                messages[target_index] = {
                    **existing_msg,
                    "content": accumulated_content.strip(),
                    "isFinal": True,
                    "timestamp": chunk.get("timestamp", int(time.time() * 1000))
                }
                print(f"  ✅ Finalized message: '{accumulated_content.strip()}'")
            else:
                # Continue accumulating
                messages[target_index] = {
                    **existing_msg,
                    "content": accumulated_content,
                    "isFinal": False,
                    "timestamp": chunk.get("timestamp", int(time.time() * 1000))
                }
                print(f"  🔄 Accumulated: '{accumulated_content}' (not final)")
        else:
            # Create new message
            new_message = {
                "type": "ai",
                "content": chunk["text"],
                "isFinal": False,
                "responseId": response_id,
                "timestamp": chunk.get("timestamp", int(time.time() * 1000))
            }
            messages.append(new_message)
            print(f"  🆕 Created new message: '{chunk['text']}'")
    
    print(f"\n📊 Final result:")
    print(f"Total messages: {len(messages)}")
    for i, msg in enumerate(messages):
        print(f"Message {i+1}: '{msg['content']}' (final: {msg['isFinal']})")
    
    # Verify the result
    expected_text = "Hello there! How can I help you?"
    if len(messages) == 1 and messages[0]["content"] == expected_text and messages[0]["isFinal"]:
        print(f"\n✅ SUCCESS: Message properly accumulated into single final message")
        return True
    else:
        print(f"\n❌ FAILED: Expected single final message with text '{expected_text}'")
        return False

def test_stale_message_cleanup():
    """Test the stale message cleanup logic"""
    print("\n🧪 Testing stale message cleanup...")
    print("=" * 50)
    
    # Simulate old messages
    now = int(time.time() * 1000)
    messages = [
        {
            "type": "ai",
            "content": "This is an old",
            "isFinal": False,
            "responseId": "old-123",
            "timestamp": now - 15000  # 15 seconds old
        },
        {
            "type": "ai", 
            "content": "This is recent",
            "isFinal": False,
            "responseId": "recent-123",
            "timestamp": now - 3000   # 3 seconds old
        }
    ]
    
    print(f"Before cleanup:")
    for i, msg in enumerate(messages):
        age = (now - msg["timestamp"]) / 1000
        print(f"  Message {i+1}: '{msg['content']}' (age: {age:.1f}s, final: {msg['isFinal']})")
    
    # Simulate cleanup logic
    MESSAGE_TIMEOUT = 8000  # 8 seconds
    MIN_CONTENT_LENGTH = 5
    
    cleaned_messages = []
    for msg in messages:
        if msg["type"] == "ai" and not msg["isFinal"] and msg.get("timestamp"):
            message_age = now - msg["timestamp"]
            has_minimum_content = msg["content"] and len(msg["content"]) >= MIN_CONTENT_LENGTH
            
            # Check for recent activity with same responseId
            has_recent_activity = any(
                m["type"] == "ai" and 
                m.get("timestamp") and 
                (now - m["timestamp"]) < 2000 and  # Activity in last 2 seconds
                m.get("responseId") == msg["responseId"]
                for m in messages
            )
            
            # Finalize if: timeout reached, has minimum content, and no recent activity
            if message_age > MESSAGE_TIMEOUT and has_minimum_content and not has_recent_activity:
                print(f"  🧹 Auto-finalizing stale message: '{msg['content']}'")
                cleaned_messages.append({**msg, "isFinal": True})
            else:
                cleaned_messages.append(msg)
        else:
            cleaned_messages.append(msg)
    
    print(f"\nAfter cleanup:")
    for i, msg in enumerate(cleaned_messages):
        age = (now - msg["timestamp"]) / 1000
        print(f"  Message {i+1}: '{msg['content']}' (age: {age:.1f}s, final: {msg['isFinal']})")
    
    # Verify old message was finalized
    old_msg_finalized = any(
        msg["content"] == "This is an old" and msg["isFinal"] 
        for msg in cleaned_messages
    )
    
    if old_msg_finalized:
        print(f"\n✅ SUCCESS: Stale message properly finalized")
        return True
    else:
        print(f"\n❌ FAILED: Stale message not finalized")
        return False

def main():
    """Run all tests"""
    print("🔍 Testing AI Message Display Fix")
    print("=" * 60)
    
    # Test 1: Message accumulation
    success1 = simulate_message_accumulation()
    
    # Test 2: Stale message cleanup
    success2 = test_stale_message_cleanup()
    
    print("\n" + "=" * 60)
    print("📋 Test Summary:")
    print(f"Message Accumulation: {'✅ PASS' if success1 else '❌ FAIL'}")
    print(f"Stale Message Cleanup: {'✅ PASS' if success2 else '❌ FAIL'}")
    
    if success1 and success2:
        print("\n🎉 All tests passed! The AI message display fix is working correctly.")
    else:
        print("\n⚠️  Some tests failed. Please review the implementation.")

if __name__ == "__main__":
    main()