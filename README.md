# OpenClaw 输出看板

OpenClaw 输出看板用于把 Obsidian vault 中 `agents/reports` 下的 Agent 报告整理成一个手机优先的阅读页面。当前按六个板块组织：企业AI大师、港股大师、日股大师、美股大师、A股大师、总管AIJamie。

## 功能

- 从 `/Users/aijamie4bc/Documents/AIJamie/agents/reports` 生成报告快照
- 按六个 Agent 板块浏览报告
- 搜索标题、摘要和原文
- 默认显示摘要，点开后阅读要点和原始 Markdown
- 保留空板块，方便后续接入日股大师等新增输出

## 当前接入方式

当前版本生成了一个前端数据快照：`src/reportsData.js`。如果 Obsidian 里的报告更新，运行：

```bash
npm run sync:reports
```

然后刷新页面即可。

同步会同时生成 `src/reportsManifest.json`，记录源文件数量、每个文件切出的报告段落数、各板块计数和警告。也可以单独运行：

```bash
npm run check:reports
```

当前解析规则只按明确的 Agent 标题切分报告，例如「企业AI大师」「港股大师」「日股大师」「美股大师」「A股大师」「总管AIJamie」。普通小节会保留在所属报告原文里，不再单独拆成卡片，以减少漏报、碎报和错报。

## 自动更新线上看板

线上 `claw.beyondaiwork.com` 无法直接读取本机 Obsidian vault。当前自动化方案是在本机定时同步：

1. 读取 `/Users/aijamie4bc/Documents/AIJamie/agents/reports`
2. 生成并校验 `src/reportsData.js` 与 `src/reportsManifest.json`
3. 构建项目
4. 如果报告数据变化，自动提交并推送 `origin/main`
5. 线上部署平台监听 GitHub 更新后重新部署

安装本机定时任务：

```bash
npm run install:auto-sync
```

安装后 macOS 会每 5 分钟运行一次：

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
