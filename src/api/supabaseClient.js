import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  // Don't crash the app in dev when env is missing — catalog.js degrades to empty results.
  console.warn(
    "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing — catalog will be empty."
  );
}

// sessionStorage, NOT localStorage: the demo session dies with the tab. A code
// handed to a prospect should not leave a standing key on a laptop that gets
// lent, sold or shoulder-surfed. Falls back to an in-memory shim where storage is
// unavailable (private-mode quirks) so the client still constructs.
function sessionScopedStorage() {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      window.sessionStorage.getItem("__probe__");
      return window.sessionStorage;
    }
  } catch {
    /* blocked by the browser — fall through to memory */
  }
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, v),
    removeItem: (k) => mem.delete(k),
  };
}

// Read-only client — but NOT public any more. Since the demo-access migration,
// `anon` holds no grants on products/product_images/categories, so this key reads
// nothing on its own. Every catalog query rides on the session minted by the
// redeem-code edge function; see src/lib/demoAccess.js and DEMO_ACCESS.md.
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: sessionScopedStorage(),
        storageKey: "nx-demo-session",
        persistSession: true,
        autoRefreshToken: true,
        // No OAuth/magic-link callbacks here; parsing the URL fragment would only
        // widen the surface.
        detectSessionInUrl: false,
      },
    })
  : null;
