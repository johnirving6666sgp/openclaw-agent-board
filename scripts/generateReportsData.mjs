import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const inboxDir = '/Users/aijamie4bc/Documents/AIJamie/agent-inbox';
const reportsDir = '/Users/aijamie4bc/Documents/AIJamie/agents/reports';
const inboxVaultOutDir = path.join(reportsDir, '_inbox');
const outFile = path.resolve('src/reportsData.js');
const manifestFile = path.resolve('src/reportsManifest.json');
const agents = ['企业AI大师', '港股大师', '日股大师', '美股大师', 'A股大师', '总管AIJamie'];
const containerTitlePattern = /大师每日报告|每日报告|日报合集|报告合集/i;
const inboxAgentFolders = [
  'enterprise-ai-master',
  'hk-stock-master',
  'jp-stock-master',
  'us-stock-master',
  'a-stock-master',
  'jamie-chief'
];
const agentFolderMap = {
  enterprise: '企业AI大师',
  'enterprise-ai-master': '企业AI大师',
  hk: '港股大师',
  'hk-stock-master': '港股大师',
  jp: '日股大师',
  'jp-stock-master': '日股大师',
  us: '美股大师',
  'us-stock-master': '美股大师',
  a: 'A股大师',
  'a-stock-master': 'A股大师',
  jamie: '总管AIJamie',
  'jamie-chief': '总管AIJamie'
};

function detectAgentFromHeading(title) {
  if (/企业AI大师|企业AI|企业 AI|企业级AI|企业级 AI|兆精summit|兆精/.test(title)) return '企业AI大师';
  if (/港股大师|港股华领|港股观察|华领模式/.test(title)) return '港股大师';
  if (/日股大师|日股|日本市场|Nikkei|TOPIX|日经/.test(title)) return '日股大师';
  if (/美股大师|美股日报|美股热点|科技长线|每周深度复盘|王者归来观察清单/.test(title)) return '美股大师';
  if (/A股大师|A股|沪深|上证|深证|创业板|龙头预测|热点轮动/.test(title)) return 'A股大师';
  if (/总管AIJamie|AIJamie|总管/.test(title)) return '总管AIJamie';
  return null;
}

function inferAgentFromContent(title, content) {
  return detectAgentFromHeading(`${title}\n${content.slice(0, 1200)}`) || '总管AIJamie';
}

function inferAgentFromPath(filePath) {
  const parts = filePath.split(path.sep).map((part) => part.toLowerCase());
  for (const [folder, agent] of Object.entries(agentFolderMap)) {
    if (parts.includes(folder)) return agent;
  }
  return null;
}

function stripMarkdown(value) {
  return value
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/[_#>*-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function summaryFor(raw) {
  const lines = raw
    .split('\n')
    .map((line) => stripMarkdown(line))
    .filter((line) => line && !/^生成时间/.test(line) && !containerTitlePattern.test(line));
  return (lines.find((line) => line.length > 24) || lines[0] || '暂无摘要').slice(0, 150);
}

function bulletsFor(raw) {
  const bullets = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => stripMarkdown(line.replace(/^[-*]\s+/, '')))
    .filter(Boolean)
    .slice(0, 4);
  return bullets.length ? bullets : [summaryFor(raw)];
}

function stableId({ agent, date, raw, source, title }) {
  return `${date}-${agent}-${crypto
    .createHash('sha1')
    .update(`${source}|${date}|${agent}|${title}|${raw.slice(0, 240)}`)
    .digest('hex')
    .slice(0, 10)}`;
}

function reportKey(report) {
  return `${report.date}|${report.agent}|${report.title}`;
}

function cleanTitle(title) {
  return stripMarkdown(title.replace(/^#{1,2}\s+/, '')).slice(0, 80);
}

function parseFrontmatter(content) {
  if (!content.startsWith('---\n')) return { data: {}, body: content };
  const end = content.indexOf('\n---', 4);
  if (end === -1) return { data: {}, body: content };

  const data = {};
  const rawFrontmatter = content.slice(4, end).trim();
  for (const line of rawFrontmatter.split('\n')) {
    const match = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[match[1]] = value;
  }

  return { data, body: content.slice(end + 4).trim() };
}

function dateFromInbox({ frontmatter, fileName }) {
  const value = frontmatter.date || frontmatter.createdAt || fileName;
  return String(value).match(/\d{4}-\d{2}-\d{2}/)?.[0] || new Date().toISOString().slice(0, 10);
}

function titleFromInbox({ frontmatter, body, date }) {
  if (frontmatter.title) return frontmatter.title;
  return body.match(/^#{1,2}\s+(.+)$/m)?.[1]?.trim() || `${date} 报告`;
}

function splitSections(content, date) {
  const headings = [...content.matchAll(/^(#{1,2})\s+(.+)$/gm)].map((match) => ({
    index: match.index,
    title: match[2].trim(),
    agent: detectAgentFromHeading(match[2].trim())
  }));
  const agentHeadings = headings.filter((heading) => heading.agent);

  if (!agentHeadings.length) {
    const title = headings.find((heading) => !containerTitlePattern.test(heading.title))?.title || `${date} 报告`;
    return [{ agent: inferAgentFromContent(title, content), raw: content.trim(), title }];
  }

  const sections = [];
  const preamble = content.slice(0, agentHeadings[0].index).trim();
  if (preamble && !containerTitlePattern.test(stripMarkdown(preamble))) {
    const title = headings[0]?.title || `${date} 前言`;
    sections.push({ agent: inferAgentFromContent(title, preamble), raw: preamble, title });
  }

  for (let index = 0; index < agentHeadings.length; index += 1) {
    const heading = agentHeadings[index];
    const nextHeading = agentHeadings[index + 1];
    const raw = content.slice(heading.index, nextHeading?.index ?? content.length).trim();
    if (raw.length > 40) sections.push({ agent: heading.agent, raw, title: heading.title });
  }
  return sections;
}

async function readMarkdownFiles(root, ignoreDirs = new Set()) {
  try {
    await fs.access(root);
  } catch {
    return [];
  }

  const files = [];
  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!ignoreDirs.has(entry.name)) await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }

  await walk(root);
  return files.sort();
}

function makeReport({ agent, date, raw, source, title, origin }) {
  const clean = cleanTitle(title);
  return {
    id: stableId({ agent, date, raw, source, title: clean }),
    agent,
    date,
    title: clean,
    summary: summaryFor(raw),
    bullets: bulletsFor(raw),
    raw,
    source,
    origin
  };
}

async function collectInboxReports(files, manifest) {
  const reports = [];
  let latestSourceModifiedMs = 0;

  for (const filePath of files) {
    const relativePath = path.relative(inboxDir, filePath);
    const stat = await fs.stat(filePath);
    latestSourceModifiedMs = Math.max(latestSourceModifiedMs, stat.mtimeMs);
    const content = await fs.readFile(filePath, 'utf8');
    const { data, body } = parseFrontmatter(content);
    const date = dateFromInbox({ frontmatter: data, fileName: path.basename(filePath) });
    const title = titleFromInbox({ frontmatter: data, body, date });
    const agent = data.agent || inferAgentFromPath(filePath) || inferAgentFromContent(title, body);
    const raw = body.trim();

    manifest.sourceFiles.push({
      fileName: relativePath,
      bytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      sections: raw.length > 40 ? 1 : 0
    });

    if (raw.length <= 40) {
      if (content.trim()) manifest.warnings.push(`${relativePath}: non-empty file produced no sections`);
      continue;
    }

    reports.push(makeReport({ agent, date, raw, source: relativePath, title, origin: 'inbox' }));
  }

  return { latestSourceModifiedMs, reports };
}

async function collectVaultReports(files, manifest) {
  const reports = [];
  let latestSourceModifiedMs = 0;

  for (const filePath of files) {
    const fileName = path.basename(filePath);
    const date = fileName.replace(/\.md$/, '');
    const stat = await fs.stat(filePath);
    latestSourceModifiedMs = Math.max(latestSourceModifiedMs, stat.mtimeMs);
    const content = await fs.readFile(filePath, 'utf8');
    const sections = splitSections(content, date).filter((section) => section.raw.length > 40);
    manifest.sourceFiles.push({
      fileName,
      bytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      sections: sections.length
    });
    if (!sections.length && content.trim()) manifest.warnings.push(`${fileName}: non-empty file produced no sections`);

    for (const section of sections) {
      reports.push(
        makeReport({
          agent: section.agent,
          date,
          raw: section.raw,
          source: fileName,
          title: section.title,
          origin: 'vault'
        })
      );
    }
  }

  return { latestSourceModifiedMs, reports };
}

async function exportInboxToVault(reports) {
  await fs.mkdir(inboxVaultOutDir, { recursive: true });
  const byDate = reports.reduce((groups, report) => {
    const dailyReports = groups.get(report.date) || [];
    dailyReports.push(report);
    groups.set(report.date, dailyReports);
    return groups;
  }, new Map());

  await Promise.all(
    [...byDate.entries()].map(async ([date, dailyReports]) => {
      const body = [
        `# Agent Inbox 每日报告 - ${date}`,
        '',
        '<!-- Generated from /Users/aijamie4bc/Documents/AIJamie/agent-inbox. Do not edit manually. -->',
        '',
        ...dailyReports.flatMap((report) => [
          `## ${report.title}`,
          `_Agent：${report.agent}_`,
          `_Source：${report.source}_`,
          '',
          report.raw,
          ''
        ])
      ].join('\n');
      await fs.writeFile(path.join(inboxVaultOutDir, `${date}.md`), body);
    })
  );
}

async function main() {
  await fs.mkdir(inboxDir, { recursive: true });
  await Promise.all(inboxAgentFolders.map((folder) => fs.mkdir(path.join(inboxDir, folder), { recursive: true })));

  const inboxFiles = await readMarkdownFiles(inboxDir);
  const vaultFiles = await readMarkdownFiles(reportsDir, new Set(['_inbox']));
  const sourceMode = inboxFiles.length ? 'hybrid' : 'vault';
  const sourceRoot = sourceMode === 'hybrid' ? inboxDir : reportsDir;
  const manifest = { generatedAt: '', sourceMode, sourceRoot, reportsDir, inboxDir, sourceFiles: [], warnings: [] };
  const inboxManifest = { sourceFiles: [], warnings: [] };
  const vaultManifest = { sourceFiles: [], warnings: [] };
  const inboxCollected = await collectInboxReports(inboxFiles, inboxManifest);
  const vaultCollected = await collectVaultReports(vaultFiles, vaultManifest);
  const latestSourceModifiedMs = Math.max(
    inboxCollected.latestSourceModifiedMs,
    vaultCollected.latestSourceModifiedMs
  );
  const reportsByKey = new Map();

  for (const report of vaultCollected.reports) reportsByKey.set(reportKey(report), report);
  for (const report of inboxCollected.reports) reportsByKey.set(reportKey(report), report);

  const reports = [...reportsByKey.values()];
  manifest.sourceFiles = [
    ...inboxManifest.sourceFiles.map((file) => ({ ...file, sourceType: 'inbox' })),
    ...vaultManifest.sourceFiles.map((file) => ({ ...file, sourceType: 'vault' }))
  ];
  manifest.warnings = [...inboxManifest.warnings, ...vaultManifest.warnings];
  manifest.inboxFiles = inboxManifest.sourceFiles.length;
  manifest.vaultFiles = vaultManifest.sourceFiles.length;

  if (inboxCollected.reports.length) await exportInboxToVault(inboxCollected.reports);

  reports.sort((a, b) => b.date.localeCompare(a.date) || a.agent.localeCompare(b.agent));
  manifest.generatedAt = new Date((latestSourceModifiedMs || Date.now()) + 1000).toISOString();
  manifest.totalReports = reports.length;
  manifest.agentCounts = Object.fromEntries(agents.map((agent) => [agent, reports.filter((report) => report.agent === agent).length]));

  await fs.writeFile(outFile, `export const reportAgents = ${JSON.stringify(agents, null, 2)};\n\nexport const agentReports = ${JSON.stringify(reports, null, 2)};\n`);
  await fs.writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Synced ${reports.length} report sections (${sourceMode})`);
  console.log(`Inbox files: ${manifest.inboxFiles}; Vault files: ${manifest.vaultFiles}`);
  if (inboxCollected.reports.length) console.log(`Exported Obsidian reading copies to ${inboxVaultOutDir}`);
  for (const agent of agents) console.log(`${agent}: ${manifest.agentCounts[agent]}`);
  if (manifest.warnings.length) {
    console.warn('\nWarnings:');
    manifest.warnings.forEach((warning) => console.warn(`- ${warning}`));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
