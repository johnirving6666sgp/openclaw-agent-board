import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const trackedFiles = ['src/reportsData.js', 'src/reportsManifest.json'];
const logDir = path.join(root, 'logs');
const deployedCommitPath = path.join(logDir, 'last-deployed-commit.txt');

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit'
  });
}

function hasDiff(files) {
  try {
    run('git', ['diff', '--quiet', '--', ...files], { capture: true });
    run('git', ['diff', '--cached', '--quiet', '--', ...files], { capture: true });
    return false;
  } catch {
    return true;
  }
}

function hasUntracked(files) {
  const status = run('git', ['status', '--short', '--', ...files], { capture: true });
  return status.trim().length > 0;
}

function currentCommit() {
  return run('git', ['rev-parse', 'HEAD'], { capture: true }).trim();
}

function lastDeployedCommit() {
  try {
    return fs.readFileSync(deployedCommitPath, 'utf8').trim();
  } catch {
    return '';
  }
}

function deployIfNeeded(reason) {
  const commit = currentCommit();
  if (lastDeployedCommit() === commit) {
    console.log(`Cloudflare already deployed for ${commit.slice(0, 7)}.`);
    return;
  }

  console.log(`Deploying ${commit.slice(0, 7)} to Cloudflare (${reason}).`);
  run('npx', ['wrangler', 'deploy']);
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(deployedCommitPath, `${commit}\n`);
  console.log('Deployed latest report data to Cloudflare.');
}

function main() {
  console.log(`[${new Date().toISOString()}] syncing reports`);
  run('git', ['fetch', 'origin', 'main']);
  run('git', ['rebase', 'origin/main']);
  run('npm', ['run', 'sync:reports']);
  run('npm', ['run', 'build']);

  if (!hasDiff(trackedFiles) && !hasUntracked(trackedFiles)) {
    console.log('No report data changes to publish.');
    deployIfNeeded('retry or non-report commit');
    return;
  }

  run('git', ['add', ...trackedFiles]);
  const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  run('git', ['commit', '-m', `Sync agent reports ${timestamp}`]);
  run('git', ['push', 'origin', 'main']);
  console.log('Published report data changes to origin/main.');
  deployIfNeeded('report data changed');
}

try {
  main();
} catch (error) {
  fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(
    path.join(logDir, 'auto-sync-errors.log'),
    `[${new Date().toISOString()}]\n${error.stack || error.message}\n\n`
  );
  throw error;
}
