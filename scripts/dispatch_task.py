#!/usr/bin/env python3
"""Create AIJamie strategy notes and dispatch research tasks to agent queues.

Usage:
  python3 dispatch_task.py --topic "AI工业革命" \
    --agent "美股大师:NVDA,PLTR,CRDO" \
    --agent "日股大师:软银集团,Advantest" <<'EOF'
  这里放 James 和 AIJamie 对话后提炼出的背景、判断和研究问题。
  EOF

Outputs:
  - /Users/aijamie4bc/Documents/AIJamie/agent-inbox/jamie-chief/
  - /Users/aijamie4bc/Documents/AIJamie/agent-tasks/<agent-folder>/
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/Los_Angeles")
ROOT = Path("/Users/aijamie4bc/Documents/AIJamie")
JAMIE_INBOX = ROOT / "agent-inbox" / "jamie-chief"
AGENT_TASKS = ROOT / "agent-tasks"

AGENT_FOLDERS = {
    "企业AI大师": "enterprise-ai-master",
    "港股大师": "hk-stock-master",
    "日股大师": "jp-stock-master",
    "美股大师": "us-stock-master",
    "A股大师": "a-stock-master",
    "总管AIJamie": "jamie-chief",
}


@dataclass
class Assignment:
    agent: str
    companies: list[str]
    instruction: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--topic", required=True, help="Discussion topic, e.g. AI工业革命")
    parser.add_argument("--date", default=None, help="Override date YYYY-MM-DD (default: today PT)")
    parser.add_argument(
        "--agent",
        action="append",
        default=[],
        help='Assignment in "Agent:CompanyA,CompanyB" form. Repeat for multiple agents.',
    )
    parser.add_argument(
        "--question",
        action="append",
        default=[],
        help="Shared research question. Repeat for multiple questions.",
    )
    return parser.parse_args()


def today_str() -> str:
    return datetime.now(TZ).strftime("%Y-%m-%d")


def yaml_quote(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def slugify(value: str) -> str:
    value = re.sub(r"\s+", "-", value.strip().lower())
    value = re.sub(r"[^0-9a-zA-Z\u4e00-\u9fff._-]+", "", value)
    return value[:48] or "task"


def digest_for(*values: str) -> str:
    joined = "|".join(values)
    return hashlib.sha1(joined.encode("utf-8")).hexdigest()[:10]


def parse_assignment(raw: str) -> Assignment:
    if ":" not in raw and "：" not in raw:
        raise ValueError(f'Invalid --agent value: {raw!r}. Expected "Agent:CompanyA,CompanyB".')

    agent, companies_raw = re.split(r"[:：]", raw, maxsplit=1)
    agent = agent.strip()
    if agent not in AGENT_FOLDERS:
        valid = ", ".join(AGENT_FOLDERS)
        raise ValueError(f"Unknown agent {agent!r}. Valid agents: {valid}")

    companies = [item.strip() for item in re.split(r"[,，、\n]", companies_raw) if item.strip()]
    if not companies:
        raise ValueError(f"No companies provided for {agent}.")

    return Assignment(agent=agent, companies=companies, instruction="")


def ensure_dirs() -> None:
    JAMIE_INBOX.mkdir(parents=True, exist_ok=True)
    for folder in AGENT_FOLDERS.values():
        (AGENT_TASKS / folder).mkdir(parents=True, exist_ok=True)


def render_questions(questions: list[str]) -> str:
    if questions:
        return "\n".join(f"{idx}. {question}" for idx, question in enumerate(questions, start=1))
    return "\n".join([
        "1. 这家公司和本主题的关系是什么？是核心受益、间接受益，还是只是叙事相关？",
        "2. 关键验证点是什么？请区分已经发生的事实、需要继续跟踪的数据、以及纯假设。",
        "3. 当前值得进入观察池、继续研究，还是暂时排除？请给出理由。",
        "4. 如涉及财务、市占率、订单、客户、监管等关键数据，请标注信源可信度。",
    ])


def write_jamie_note(day: str, topic: str, context: str, assignments: list[Assignment], questions: list[str]) -> Path:
    now = datetime.now(TZ).isoformat()
    title = f"总管AIJamie · {topic} 任务分发"
    slug = slugify(topic)
    file_name = f"{day}-aijamie-dispatch-{slug}-{digest_for(day, topic)}.md"
    assignment_lines = []
    for item in assignments:
        assignment_lines.append(f"- {item.agent}：{', '.join(item.companies)}")

    body = f"""---
agent: "总管AIJamie"
date: {day}
title: {yaml_quote(title)}
createdAt: {now}
source: "dispatch_task.py"
---

# {title}

## 对话提炼
{context.strip() or "本次未提供额外背景。"}

## 任务分配
{chr(10).join(assignment_lines)}

## 共用研究问题
{render_questions(questions)}
"""
    out_path = JAMIE_INBOX / file_name
    out_path.write_text(body, encoding="utf-8")
    return out_path


def write_agent_task(day: str, topic: str, context: str, assignment: Assignment, questions: list[str]) -> Path:
    now = datetime.now(TZ).isoformat()
    folder = AGENT_FOLDERS[assignment.agent]
    slug = slugify(topic)
    file_name = f"{day}-{slug}-{digest_for(day, topic, assignment.agent)}.md"
    title = f"{assignment.agent} · {topic} 研究任务"
    companies = ", ".join(assignment.companies)
    body = f"""---
status: "open"
assignee: {yaml_quote(assignment.agent)}
topic: {yaml_quote(topic)}
date: {day}
createdAt: {now}
source: "AIJamie"
companies: {yaml_quote(companies)}
---

# {title}

## 研究对象
{chr(10).join(f"- {company}" for company in assignment.companies)}

## 背景与判断
{context.strip() or "本次任务由 AIJamie 从对话中提炼，暂无额外背景。"}

## 需要回答的问题
{render_questions(questions)}

## 输出要求
- 把研究结论写入本大师自己的日报或专题报告。
- 输出前使用 `append_report.py` 写入对应 `agent-inbox`，保证小看板能同步到完整原文。
- 明确区分事实、推断、待验证假设。
- 给出下一步是否继续跟踪的判断。
"""
    out_dir = AGENT_TASKS / folder
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / file_name
    out_path.write_text(body, encoding="utf-8")
    return out_path


def main() -> int:
    args = parse_args()
    day = args.date or today_str()
    context = sys.stdin.read().strip()
    assignments = [parse_assignment(raw) for raw in args.agent]
    if not assignments:
        raise ValueError("At least one --agent assignment is required.")

    ensure_dirs()
    jamie_note = write_jamie_note(day, args.topic, context, assignments, args.question)
    task_paths = [
        write_agent_task(day, args.topic, context, assignment, args.question)
        for assignment in assignments
    ]

    print(f"AIJamie note: {jamie_note}")
    for path in task_paths:
        print(f"Task: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
