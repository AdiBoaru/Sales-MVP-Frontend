import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // @/ -> src/  (previously injected by the base44 plugin)
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      // The izi bot only allows CORS for https://shop.nativextech.com.
      // In dev we proxy /web/* and spoof the Origin header (server-side, no CORS).
      // In prod the build hits VITE_CHAT_API_BASE directly (real origin = the shop).
      '/web': {
        target: 'https://bot.nativextech.com',
        changeOrigin: true,
        secure: true,
        headers: { Origin: 'https://shop.nativextech.com' },
      },
    },
  },
});
