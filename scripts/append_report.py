#!/usr/bin/env python3
"""Write/update daily report blocks for any agent.

Usage:
  python3 append_report.py --agent "港股大师" --title "现金+金融资产 > 市值" <<'EOF'
  内容...
  EOF

Behavior:
  - Stores report under ~/.../workspace/reports/YYYY-MM-DD.md by default.
  - Writes a full raw copy into /Users/aijamie4bc/Documents/AIJamie/agent-inbox.
  - Maintains a fixed section order for core agents.
  - Replaces the same agent+title block if it already exists for that day.
  - Allows multiple blocks under the same agent (e.g. A股大师四次播报).
  - Preserves unknown/custom sections after the fixed core order.
"""

from __future__ import annotations

import argparse
import hashlib
import re
from datetime import datetime
from pathlib import Path
import sys

try:
    from zoneinfo import ZoneInfo
except ImportError:  # py<3.9
    from backports.zoneinfo import ZoneInfo  # type: ignore

TZ = ZoneInfo("America/Los_Angeles")
WORKSPACE = Path("/Users/aijamie4bc/.openclaw/workspace")
AGENT_INBOX = Path("/Users/aijamie4bc/Documents/AIJamie/agent-inbox")
CORE_AGENT_ORDER = ["A股大师", "港股大师", "美股大师", "日股大师", "企业AI大师"]
INBOX_AGENT_FOLDERS = {
    "企业AI大师": "enterprise-ai-master",
    "港股大师": "hk-stock-master",
    "日股大师": "jp-stock-master",
    "美股大师": "us-stock-master",
    "A股大师": "a-stock-master",
    "总管AIJamie": "jamie-chief",
}
SECTION_RE = re.compile(r"(?m)^##\s+(.+?)\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--agent", required=True, help="Section owner, e.g., A股大师")
    parser.add_argument("--title", default="", help="Optional section subtitle")
    parser.add_argument("--date", default=None, help="Override date YYYY-MM-DD (default: today PT)")
    parser.add_argument("--file", default=None, help="Optional specific file path")
    return parser.parse_args()


def today_str() -> str:
    return datetime.now(TZ).strftime("%Y-%m-%d")


def yaml_quote(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def inbox_title(agent: str, title: str) -> str:
    return f"{agent} · {title}" if title else agent


def inbox_file_name(day: str, agent: str, title: str) -> str:
    digest = hashlib.sha1(f"{day}|{agent}|{title}".encode("utf-8")).hexdigest()[:10]
    return f"{day}-{digest}.md"


def split_header(header: str) -> tuple[str, str]:
    parts = header.split(" · ", 1)
    agent = parts[0].strip()
    title = parts[1].strip() if len(parts) > 1 else ""
    return agent, title


def extract_sections(text: str) -> tuple[str, list[dict[str, str]]]:
    matches = list(SECTION_RE.finditer(text))
    if not matches:
        return text.strip(), []

    preamble = text[: matches[0].start()].strip()
    sections: list[dict[str, str]] = []
    for idx, match in enumerate(matches):
        start = match.start()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        block = text[start:end].strip()
        header = match.group(1).strip()
        agent, title = split_header(header)
        sections.append({"agent": agent, "title": title, "header": header, "block": block})
    return preamble, sections


def render(day: str, preamble: str, sections: list[dict[str, str]]) -> str:
    title = f"# 大师每日报告 - {day}"
    if not preamble or not preamble.startswith("# "):
        preamble = title

    grouped: dict[str, list[str]] = {}
    unknown_order: list[str] = []
    for section in sections:
        agent = section["agent"]
        grouped.setdefault(agent, []).append(section["block"])
        if agent not in CORE_AGENT_ORDER and agent not in unknown_order:
            unknown_order.append(agent)

    ordered_blocks: list[str] = []
    for agent in CORE_AGENT_ORDER:
        ordered_blocks.extend(grouped.get(agent, []))
    for agent in unknown_order:
        ordered_blocks.extend(grouped.get(agent, []))

    if ordered_blocks:
        return preamble.strip() + "\n\n" + "\n\n".join(ordered_blocks) + "\n"
    return preamble.strip() + "\n"


def write_inbox_report(agent: str, title: str, day: str, timestamp: str, content: str) -> None:
    folder = INBOX_AGENT_FOLDERS.get(agent, "jamie-chief")
    inbox_dir = AGENT_INBOX / folder
    inbox_dir.mkdir(parents=True, exist_ok=True)
    report_title = inbox_title(agent, title)
    created_at = datetime.now(TZ).isoformat()
    body = f"""---
agent: {yaml_quote(agent)}
date: {day}
title: {yaml_quote(report_title)}
createdAt: {created_at}
source: "append_report.py"
---

## {report_title}
_生成时间：{timestamp}_

{content.strip()}
"""
    (inbox_dir / inbox_file_name(day, agent, title)).write_text(body, encoding="utf-8")


def main() -> int:
    args = parse_args()
    content = sys.stdin.read().strip()
    if not content:
        return 0

    day = args.date or today_str()
    report_dir = WORKSPACE / "reports"
    report_dir.mkdir(parents=True, exist_ok=True)

    if args.file:
        report_path = Path(args.file).expanduser()
    else:
        report_path = report_dir / f"{day}.md"

    header = f"## {args.agent}"
    if args.title:
        header += f" · {args.title}"
    timestamp = datetime.now(TZ).strftime("%H:%M")
    new_block = f"{header}\n_生成时间：{timestamp}_\n{content}".strip()
    write_inbox_report(args.agent, args.title, day, timestamp, content)

    existing = report_path.read_text(encoding="utf-8") if report_path.exists() else ""
    preamble, sections = extract_sections(existing)

    updated = False
    for section in sections:
        if section["agent"] == args.agent and section["title"] == args.title:
            section["header"] = header.removeprefix("## ")
            section["block"] = new_block
            updated = True
            break

    if not updated:
        sections.append({
            "agent": args.agent,
            "title": args.title,
            "header": header.removeprefix("## "),
            "block": new_block,
        })

    final_text = render(day, preamble, sections)
    report_path.write_text(final_text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
