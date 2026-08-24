import { Suspense, lazy } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from '@/lib/PageNotFound';
import ScrollToTop from '@/components/ScrollToTop';
// NX-243: layoutul care deține SINGURA instanță de ChatWidget. Deliberat NU e `lazy`: un layout
// suspendabil s-ar remonta la prima navigare între rutele copil, adică exact bug-ul reparat aici.
import ProtectedStorefrontChatLayout from '@/layouts/ProtectedStorefrontChatLayout';

// Route-level code splitting: each page (and its heavy deps — supabase on the
// store routes) lands in its own chunk instead of one monolithic bundle on
// first paint.
const Landing = lazy(() => import('@/pages/Landing'));
const Store = lazy(() => import('@/pages/Store'));
const ProductDetail = lazy(() => import('@/pages/ProductDetail'));
const Cart = lazy(() => import('@/pages/Cart'));
// Lazy like the pages it guards: the gate pulls in supabase-js, and the public
// landing page must not pay for that chunk.
const DemoGate = lazy(() => import('@/components/DemoGate'));

function RouteFallback() {
  return (
    <div className="fixed inset-0 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-gray-200 border-t-brand-600 rounded-full animate-spin" />
    </div>
  );
}

// The storefront routes are gated behind a demo access code. The gate here is the
// visible half — the enforcing half is the database (see DEMO_ACCESS.md): without
// a redeemed session the catalog reads empty no matter what the client does.
const Protected = ({ children }) => <DemoGate>{children}</DemoGate>;

// The landing page stays public — it explains the demo and points at the signup.
function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router>
        <ScrollToTop />
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            {/* Rutele de vitrină împart un layout persistent: paginile se schimbă prin
                `<Outlet />`, widgetul rămâne montat. Allowlist strict — landing și /Cart
                rămân în afara lui.
                Poarta stă PESTE layout, nu în interiorul lui: așa se evaluează o
                singură dată pentru toată vitrina, iar `/store ↔ /product` nu o
                traversează din nou — deci nici widgetul nu se remontează. */}
            <Route element={<Protected><ProtectedStorefrontChatLayout /></Protected>}>
              <Route path="/store" element={<Store />} />
              <Route path="/product/:id" element={<ProductDetail />} />
            </Route>
            <Route path="/Cart" element={<Protected><Cart /></Protected>} />
            <Route path="/cart" element={<Navigate to="/Cart" replace />} />
            <Route path="*" element={<PageNotFound />} />
          </Routes>
        </Suspense>
      </Router>
    </QueryClientProvider>
  )
}

export default App
