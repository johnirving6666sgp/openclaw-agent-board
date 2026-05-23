# OpenClaw 输出看板

OpenClaw 输出看板用于把 Agent 报告整理成一个手机优先的阅读页面。当前按六个板块组织：企业AI大师、港股大师、日股大师、美股大师、A股大师、总管AIJamie。

## 功能

- 优先从 `/Users/aijamie4bc/Documents/AIJamie/agent-inbox` 读取原始 Agent 报告
- 如果 `agent-inbox` 为空，继续兼容读取 `/Users/aijamie4bc/Documents/AIJamie/agents/reports`
- Inbox 模式会同时在 Obsidian vault 里生成阅读副本：`agents/reports/_inbox`
- 按六个 Agent 板块浏览报告
- 搜索标题、摘要和原文
- 默认显示摘要，点开后阅读要点和原始 Markdown
- 保留空板块，方便后续接入日股大师等新增输出

## 当前接入方式：Report Inbox

推荐让每位 Agent 把完整原文写入：

```text
/Users/aijamie4bc/Documents/AIJamie/agent-inbox
```

建议目录：

```text
agent-inbox/
  enterprise-ai-master/
  hk-stock-master/
  jp-stock-master/
  us-stock-master/
  a-stock-master/
  jamie-chief/
```

每份报告建议是一个独立 Markdown 文件，带 frontmatter：

```md
---
agent: A股大师
date: 2026-05-23
title: A股大师 · 10:00 第二报
createdAt: 2026-05-23T10:00:00+08:00
---

完整报告原文……
```

这样完整原文会先进入 Inbox，再同时生成网站数据和 Obsidian 阅读副本。AIJamie 后续可以从 Inbox 原文做总管总结，但不再覆盖原始报告。

当前版本生成了一个前端数据快照：`src/reportsData.js`。如果报告更新，运行：

```bash
npm run sync:reports
```

然后刷新页面即可。

同步会同时生成 `src/reportsManifest.json`，记录源文件数量、每个文件切出的报告段落数、各板块计数和警告。也可以单独运行：

```bash
npm run check:reports
```

Inbox 模式下，每个 Markdown 文件默认是一份完整报告。兼容 Vault 模式下，解析规则只按明确的 Agent 标题切分报告，例如「企业AI大师」「港股大师」「日股大师」「美股大师」「A股大师」「总管AIJamie」。普通小节会保留在所属报告原文里，不再单独拆成卡片，以减少漏报、碎报和错报。

## 自动更新线上看板

线上 `claw.beyondaiwork.com` 无法直接读取本机 Obsidian vault。当前自动化方案是在本机定时同步：

1. 优先读取 `/Users/aijamie4bc/Documents/AIJamie/agent-inbox`；如果为空，则读取 `/Users/aijamie4bc/Documents/AIJamie/agents/reports`
2. 生成并校验 `src/reportsData.js` 与 `src/reportsManifest.json`
3. 如果使用 Inbox，同时写入 Obsidian 阅读副本 `agents/reports/_inbox`
4. 构建项目
5. 如果报告数据变化，自动提交并推送 `origin/main`
6. 直接部署到 Cloudflare；如果上次部署失败，下一轮会继续重试

安装本机定时任务：

```bash
npm run install:auto-sync
```

安装后 macOS 会每 2 分钟运行一次：

```bash
npm run auto:reports
```

日志位置：

```text
logs/auto-sync.log
logs/auto-sync-errors.log
```

## 启动

```bash
npm install
npm run dev
```
