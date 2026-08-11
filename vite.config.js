import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Originul pe care botul îl acceptă. Botul verifică `Origin` SERVER-SIDE pe toate rutele
// `/web/*` (NX-229), nu doar la bootstrap, iar potrivirea e exactă: `demo.x` ≠ `www.demo.x` ≠
// `http://demo.x` ≠ `demo.x:8443`.
//
// Era `https://shop.nativextech.com` — greșit. Vitrina trăiește pe `demo.nativextech.com`
// (vezi DEMO_ACCESS.md), iar botul nu a allowlistat niciodată `shop.`. Câtă vreme originul se
// verifica doar la bootstrap, dev-ul mergea din întâmplare; de la NX-229 e respins pe toate rutele.
//
// Se poate suprascrie din `.env.local` cu `VITE_CHAT_DEV_ORIGIN`, ca schimbarea următoare de
// domeniu să fie o linie de configurare, nu o editare de cod în două repo-uri deodată — exact
// duplicarea care a produs greșeala asta.
const DEFAULT_DEV_ORIGIN = 'https://demo.nativextech.com'
const DEFAULT_BOT_BASE = 'https://bot.nativextech.com'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devOrigin = env.VITE_CHAT_DEV_ORIGIN || DEFAULT_DEV_ORIGIN
  const botBase = env.VITE_CHAT_API_BASE || DEFAULT_BOT_BASE

  return {
    plugins: [react()],
    resolve: {
      alias: {
        // @/ -> src/  (previously injected by the base44 plugin)
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        // În dev proxăm `/web/*` și falsificăm `Origin` server-side (deci fără CORS de browser).
        // În prod build-ul lovește direct `VITE_CHAT_API_BASE`, iar originul real e vitrina.
        '/web': {
          target: botBase,
          changeOrigin: true,
          secure: true,
          headers: { Origin: devOrigin },
        },
      },
    },
  }
});
