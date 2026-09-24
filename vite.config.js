import { createReadStream, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/kikitori/' : '/',
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  worker: { format: 'es' },
  plugins: [{
    name: 'raw-kuromoji-dictionary',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
        if (!/^\/vendor\/dict\/[a-z_]+\.dat\.gz$/.test(pathname)) return next();
        const path = resolve('public', pathname.slice(1));
        if (!existsSync(path)) return next();
        res.setHeader('Content-Type', 'application/gzip');
        createReadStream(path).pipe(res);
      });
    },
  }],
});
