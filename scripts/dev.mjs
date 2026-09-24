import './assets.mjs';
import { spawn } from 'node:child_process';
const children = [spawn(process.execPath, ['server/index.mjs'], { stdio: 'inherit' }), spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' })];
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => children.forEach(p=>p.kill()));
for (const child of children) child.on('exit', code => { children.forEach(p=>p.kill()); process.exit(code ?? 0); });
