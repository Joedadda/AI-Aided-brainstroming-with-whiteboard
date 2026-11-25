import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Ports come from the environment so a second copy can run beside the first (defaults unchanged).
const API = Number(process.env.API_PORT ?? 8787);
const COLLAB = Number(process.env.COLLAB_PORT ?? 8788);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    proxy: {
      '/api': `http://localhost:${API}`,
      // Yjs sync and presence (Hocuspocus) runs on its own port in the same Node process.
      '/collab': { target: `ws://localhost:${COLLAB}`, ws: true },
    },
  },
});
