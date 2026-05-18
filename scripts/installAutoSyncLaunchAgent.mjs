import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const label = 'com.openclaw.agent-board-sync';
const launchAgentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
const plistPath = path.join(launchAgentsDir, `${label}.plist`);
const logDir = path.join(root, 'logs');
const runnerPath = path.join(logDir, 'run-auto-sync.zsh');
const uid = execFileSync('id', ['-u'], { encoding: 'utf8' }).trim();
const nodePath = fs.realpathSync(process.execPath);
const npmCliPath = path.resolve(path.dirname(nodePath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');

fs.mkdirSync(launchAgentsDir, { recursive: true });
fs.mkdirSync(logDir, { recursive: true });

fs.writeFileSync(
  runnerPath,
  `#!/bin/zsh
cd "${root}" || exit 1
exec "${nodePath}" "${npmCliPath}" run auto:reports
`
);
fs.chmodSync(runnerPath, 0o755);

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${runnerPath}</string>
  </array>
  <key>StartInterval</key>
  <integer>300</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${path.join(logDir, 'auto-sync.log')}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(logDir, 'auto-sync-errors.log')}</string>
</dict>
</plist>
`;

fs.writeFileSync(plistPath, plist);

try {
  execFileSync('launchctl', ['bootout', `gui/${uid}`, plistPath], { stdio: 'ignore' });
} catch {
  // It is fine if the agent was not already loaded.
}

execFileSync('launchctl', ['bootstrap', `gui/${uid}`, plistPath], { stdio: 'inherit' });
execFileSync('launchctl', ['enable', `gui/${uid}/${label}`], { stdio: 'inherit' });

console.log(`Installed ${label}`);
console.log(`Plist: ${plistPath}`);
console.log(`Logs: ${logDir}`);
