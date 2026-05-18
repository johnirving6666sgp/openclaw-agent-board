import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const label = 'com.openclaw.agent-board-sync';
const launchAgentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
const plistPath = path.join(launchAgentsDir, `${label}.plist`);
const logDir = path.join(root, 'logs');
const uid = execFileSync('id', ['-u'], { encoding: 'utf8' }).trim();
const nodePath = fs.realpathSync(process.execPath);
const npmPath = path.join(path.dirname(nodePath), 'npm');

fs.mkdirSync(launchAgentsDir, { recursive: true });
fs.mkdirSync(logDir, { recursive: true });

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${npmPath}</string>
    <string>run</string>
    <string>auto:reports</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${root}</string>
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
