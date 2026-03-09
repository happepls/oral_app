#!/usr/bin/env python3
import httpx
import json

api_key = 'sk-c5a4730628ba4017b7ca10241bedf7ad'
prompt = """You are an English language teaching expert. For the following speaking practice scenario and task, generate 10-15 essential English keywords/phrases.

Scenario: 日常问候
Task: 问候你刚认识的朋友

Return ONLY a JSON array: ["keyword1", "keyword2", ...]"""

headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
payload = {"model": "qwen-turbo", "messages": [{"role": "user", "content": prompt}]}

try:
    response = httpx.post(
        "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
        headers=headers, json=payload, timeout=30.0
    )
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    if response.status_code == 200:
        result = response.json()
        content = result.get("output", {}).get("choices", [{}])[0].get("message", {}).get("content", "")
        print(f"\nContent: {content}")
        
        # Try to parse JSON
        import re
        json_match = re.search(r'\[.*\]', content, re.DOTALL)
        if json_match:
            keywords = json.loads(json_match.group())
            print(f"\nKeywords: {keywords}")
except Exception as e:
    print(f"Error: {e}")
