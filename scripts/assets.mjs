import { cp, mkdir } from 'node:fs/promises';
await mkdir('public/vendor', { recursive: true });
await cp('node_modules/kuromoji/build/kuromoji.js', 'public/vendor/kuromoji.js');
await cp('node_modules/kuromoji/dict', 'public/vendor/dict', { recursive: true });
