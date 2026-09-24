import { defineConfig } from 'vite';
export default defineConfig({ base: process.env.GITHUB_PAGES === 'true' ? '/kikitori/' : '/', server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8787' } }, worker: { format: 'es' } });
