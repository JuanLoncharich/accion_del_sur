import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// En desarrollo Vite sirve el frontend y reenvía /api y /uploads al backend.
// En producción Nginx sirve frontend/dist y hace el mismo proxy (ver deploy/).
const apiUrl = process.env.API_URL || 'http://localhost:3012';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: Number(process.env.PORT) || 5000,
    proxy: {
      '/api': { target: apiUrl, changeOrigin: true },
      '/uploads': { target: apiUrl, changeOrigin: true },
    },
  },
  preview: {
    host: true,
    port: Number(process.env.PORT) || 5000,
    proxy: {
      '/api': { target: apiUrl, changeOrigin: true },
      '/uploads': { target: apiUrl, changeOrigin: true },
    },
  },
});
