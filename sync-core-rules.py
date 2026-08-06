#!/usr/bin/env python3
"""
SSOT 同步脚本 - macOS/Linux 版本
确保 core-rules.md 作为唯一真实来源，同步到 CLAUDE.md 和 AGENTS.md

使用方法:
    python3 sync-core-rules.py

功能:
    1. 读取 core-rules.md 作为唯一真实来源
    2. 提取核心规则内容
    3. 同步生成 CLAUDE.md（给 Claude Code 读取）
    4. 同步生成 AGENTS.md（给 Codex 读取）
    5. 可选: 同步到 .codex/instructions.md
"""

import re
import os
import sys
from datetime import datetime
from pathlib import Path

# 配置
PROJECT_ROOT = Path(__file__).parent.resolve()
SOURCE_FILE = PROJECT_ROOT / "core-rules.md"
CLAUDE_FILE = PROJECT_ROOT / "CLAUDE.md"
AGENTS_FILE = PROJECT_ROOT / "AGENTS.md"
CODEX_FILE = PROJECT_ROOT / ".codex" / "instructions.md"

# SSOT 头部模板
CLAUDE_HEADER = """# CLAUDE.md

> **⚠️ 本文件由 core-rules.md 自动同步生成**
>
> 请勿直接修改此文件！
> 修改请前往: `core-rules.md`
>
> 最后同步时间: {timestamp}
> 同步脚本: `sync-core-rules.py`

---

"""

AGENTS_HEADER = """# AGENTS.md

> **⚠️ 本文件由 core-rules.md 自动同步生成**
>
> 请勿直接修改此文件！
> 修改请前往: `core-rules.md`
>
> 最后同步时间: {timestamp}
> 同步脚本: `sync-core-rules.py`

---

"""

CODEX_HEADER = """# Codex Instructions

> **⚠️ 本文件由 core-rules.md 自动同步生成**
>
> 请勿直接修改此文件！
> 修改请前往: `core-rules.md`
>
> 最后同步时间: {timestamp}
> 同步脚本: `sync-core-rules.py`

---

"""

def extract_core_rules(source_path: Path) -> str:
    """从 core-rules.md 提取核心规则内容"""
    if not source_path.exists():
        raise FileNotFoundError(f"找不到源文件: {source_path}")

    content = source_path.read_text(encoding="utf-8")

    # 移除 SSOT 警告头部（只保留实际内容）
    # 找到第一个 ## 标题开始的内容
    match = re.search(r"(## .+)", content, re.DOTALL)
    if not match:
        raise ValueError("无法在 core-rules.md 中找到内容")

    # 返回从第一个 ## 开始的所有内容
    start_idx = match.start()
    return content[start_idx:].strip()

def sync_file(target_path: Path, header: str, core_rules: str, timestamp: str):
    """同步单个文件"""
    # 确保目录存在
    target_path.parent.mkdir(parents=True, exist_ok=True)

    content = header.format(timestamp=timestamp) + core_rules
    target_path.write_text(content, encoding="utf-8")
    print(f"✅ 已同步: {target_path.relative_to(PROJECT_ROOT)}")

def main():
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    try:
        # 提取核心规则
        core_rules = extract_core_rules(SOURCE_FILE)

        # 同步 CLAUDE.md
        sync_file(CLAUDE_FILE, CLAUDE_HEADER, core_rules, timestamp)

        # 同步 AGENTS.md
        sync_file(AGENTS_FILE, AGENTS_HEADER, core_rules, timestamp)

        # 同步 .codex/instructions.md（如果 Codex 需要）
        sync_file(CODEX_FILE, CODEX_HEADER, core_rules, timestamp)

        print(f"\n🎉 SSOT 同步完成！所有文件已更新。")
        print(f"📌 下次修改请编辑: {SOURCE_FILE.relative_to(PROJECT_ROOT)}")

    except Exception as e:
        print(f"❌ 同步失败: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
