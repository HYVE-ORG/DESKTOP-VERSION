import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import {existsSync} from 'node:fs';

const children = [
  spawn(process.execPath, ['--import', 'tsx', 'apps/api/src/main.ts'], { stdio: 'inherit', env: process.env }),
  spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { stdio: 'inherit', env: process.env }),
];
if(process.env.LIVEKIT_URL==='ws://127.0.0.1:7880'&&existsSync(resolve('.tools/livekit/livekit-server.exe'))){
  children.push(spawn(resolve('.tools/livekit/livekit-server.exe'),['--config','scripts/livekit-local.yaml','--dev'],{stdio:'inherit',env:process.env}));
}
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500).unref();
}
for (const child of children) {
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code || 0); });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
