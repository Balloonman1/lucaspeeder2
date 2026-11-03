import { defineConfig } from 'vite';
export default defineConfig({ base: './', build: { target: 'es2022', chunkSizeWarningLimit: 6000, assetsDir: 'bundle' }, server: { port: 5173, strictPort: true } });
