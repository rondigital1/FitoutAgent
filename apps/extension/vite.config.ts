import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { extReloadPlugin } from './vite-ext-reload';

export default defineConfig({
  plugins: [react(), tailwindcss(), extReloadPlugin()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      input: { panel: 'index.html', background: 'src/background.ts' },
      output: {
        entryFileNames: chunk => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
});
