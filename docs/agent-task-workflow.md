# Agent Task Workflow

AIJamie uses `/Users/aijamie4bc/Documents/AIJamie/agent-tasks` to dispatch research tasks to each master agent.

## Directories

```text
/Users/aijamie4bc/Documents/AIJamie/agent-tasks/
  enterprise-ai-master/
  hk-stock-master/
  jp-stock-master/
  us-stock-master/
  a-stock-master/
  jamie-chief/
```

## Master Agent Rule

Before producing a daily report, each master agent should:

1. Read its own task directory.
2. Prioritize open tasks related to the current market or topic.
3. Research the listed companies and questions.
4. Include conclusions in its own report.
5. Write the final report through:

```bash
python3 /Users/aijamie4bc/.openclaw/workspace/scripts/append_report.py --agent "<大师名称>" --title "<标题>" <<'EOF'
完整报告原文
EOF
```

## Agent Directory Map

```text
企业AI大师  -> enterprise-ai-master
港股大师    -> hk-stock-master
日股大师    -> jp-stock-master
美股大师    -> us-stock-master
A股大师     -> a-stock-master
总管AIJamie -> jamie-chief
```

## Task File Meaning

Each task file is a Markdown document with frontmatter:

```md
---
status: "open"
assignee: "美股大师"
topic: "AI工业革命"
date: 2026-05-24
source: "AIJamie"
companies: "NVDA, PLTR"
---
```

The task body includes background, research targets, research questions, and output requirements.
