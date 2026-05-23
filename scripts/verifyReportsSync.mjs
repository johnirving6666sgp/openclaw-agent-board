import fs from 'node:fs/promises';
import path from 'node:path';
import { agentReports, reportAgents } from '../src/reportsData.js';
import manifest from '../src/reportsManifest.json' with { type: 'json' };

const errors = [];
const sourceRoot = manifest.sourceRoot || manifest.reportsDir;
const ignoreDirs = new Set(['_inbox']);
const sourceFiles = [];

async function walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!ignoreDirs.has(entry.name)) await walk(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      sourceFiles.push(path.relative(sourceRoot, fullPath));
    }
  }
}

await walk(sourceRoot);
sourceFiles.sort();
const manifestFiles = manifest.sourceFiles.map((file) => file.fileName).sort();

if (sourceFiles.length !== manifestFiles.length) {
  errors.push(`source file count mismatch: vault=${sourceFiles.length}, manifest=${manifestFiles.length}`);
}

for (const fileName of sourceFiles) {
  if (!manifestFiles.includes(fileName)) errors.push(`missing from manifest: ${fileName}`);
}

for (const sourceFile of manifest.sourceFiles) {
  const filePath = path.join(sourceRoot, sourceFile.fileName);
  try {
    const stat = await fs.stat(filePath);
    if (stat.size !== sourceFile.bytes) errors.push(`${sourceFile.fileName}: file size changed after sync`);
    if (stat.mtime > new Date(manifest.generatedAt)) {
      errors.push(`${sourceFile.fileName}: modified after sync; rerun npm run sync:reports`);
    }
    if (sourceFile.sections < 1) errors.push(`${sourceFile.fileName}: no parsed sections`);
  } catch {
    errors.push(`${sourceFile.fileName}: cannot stat source file`);
  }
}

if (agentReports.length !== manifest.totalReports) {
  errors.push(`report count mismatch: data=${agentReports.length}, manifest=${manifest.totalReports}`);
}

const ids = agentReports.map((report) => report.id);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicateIds.length) errors.push(`duplicate report ids: ${Array.from(new Set(duplicateIds)).join(', ')}`);

for (const report of agentReports) {
  if (!reportAgents.includes(report.agent)) errors.push(`unknown agent: ${report.agent}`);
}

for (const agent of reportAgents) {
  const count = agentReports.filter((report) => report.agent === agent).length;
  if (count !== manifest.agentCounts[agent]) errors.push(`${agent}: data count ${count} != manifest count ${manifest.agentCounts[agent]}`);
}

if (manifest.warnings?.length) errors.push(`manifest warnings: ${manifest.warnings.join('; ')}`);

if (errors.length) {
  console.error('Report sync verification failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log('Report sync verification passed.');
  console.log(`Source files: ${sourceFiles.length}`);
  console.log(`Report sections: ${agentReports.length}`);
  for (const agent of reportAgents) console.log(`${agent}: ${manifest.agentCounts[agent]}`);
}
