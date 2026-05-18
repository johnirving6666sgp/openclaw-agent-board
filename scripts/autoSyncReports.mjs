import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const trackedFiles = ['src/reportsData.js', 'src/reportsManifest.json'];

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

function main() {
  console.log(`[${new Date().toISOString()}] syncing reports`);
  run('git', ['fetch', 'origin', 'main']);
  run('git', ['rebase', 'origin/main']);
  run('npm', ['run', 'sync:reports']);
  run('npm', ['run', 'build']);

  if (!hasDiff(trackedFiles) && !hasUntracked(trackedFiles)) {
    console.log('No report data changes to publish.');
    return;
  }

  run('git', ['add', ...trackedFiles]);
  const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  run('git', ['commit', '-m', `Sync agent reports ${timestamp}`]);
  run('git', ['push', 'origin', 'main']);
  console.log('Published report data changes to origin/main.');
}

try {
  main();
} catch (error) {
  const logDir = path.join(root, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(
    path.join(logDir, 'auto-sync-errors.log'),
    `[${new Date().toISOString()}]\n${error.stack || error.message}\n\n`
  );
  throw error;
}
