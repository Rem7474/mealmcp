import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // In dev the UI runs on Vite and talks to the backend on :3000.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
