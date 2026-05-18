import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const reportsDir = '/Users/aijamie4bc/Documents/AIJamie/agents/reports';
const outFile = path.resolve('src/reportsData.js');
const manifestFile = path.resolve('src/reportsManifest.json');
const agents = ['企业AI大师', '港股大师', '日股大师', '美股大师', 'A股大师', '总管AIJamie'];
const containerTitlePattern = /大师每日报告|每日报告|日报合集|报告合集/i;

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

function cleanTitle(title) {
  return stripMarkdown(title.replace(/^#{1,2}\s+/, '')).slice(0, 80);
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

async function main() {
  const files = (await fs.readdir(reportsDir)).filter((name) => name.endsWith('.md')).sort();
  const reports = [];
  const manifest = { generatedAt: new Date().toISOString(), reportsDir, sourceFiles: [], warnings: [] };

  for (const fileName of files) {
    const date = fileName.replace(/\.md$/, '');
    const filePath = path.join(reportsDir, fileName);
    const stat = await fs.stat(filePath);
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
      const title = cleanTitle(section.title);
      reports.push({
        id: stableId({ agent: section.agent, date, raw: section.raw, source: fileName, title }),
        agent: section.agent,
        date,
        title,
        summary: summaryFor(section.raw),
        bullets: bulletsFor(section.raw),
        raw: section.raw,
        source: fileName
      });
    }
  }

  reports.sort((a, b) => b.date.localeCompare(a.date) || a.agent.localeCompare(b.agent));
  manifest.totalReports = reports.length;
  manifest.agentCounts = Object.fromEntries(agents.map((agent) => [agent, reports.filter((report) => report.agent === agent).length]));

  await fs.writeFile(outFile, `export const reportAgents = ${JSON.stringify(agents, null, 2)};\n\nexport const agentReports = ${JSON.stringify(reports, null, 2)};\n`);
  await fs.writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Synced ${reports.length} report sections from ${reportsDir}`);
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
