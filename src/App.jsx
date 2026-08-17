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

function RouteFallback() {
  return (
    <div className="fixed inset-0 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-gray-200 border-t-brand-600 rounded-full animate-spin" />
    </div>
  );
}

// Public storefront — anonymous visitors, no auth, no third-party app SDK.
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
                rămân în afara lui. */}
            <Route element={<ProtectedStorefrontChatLayout />}>
              <Route path="/store" element={<Store />} />
              <Route path="/product/:id" element={<ProductDetail />} />
            </Route>
            <Route path="/Cart" element={<Cart />} />
            <Route path="/cart" element={<Navigate to="/Cart" replace />} />
            <Route path="*" element={<PageNotFound />} />
          </Routes>
        </Suspense>
      </Router>
    </QueryClientProvider>
  )
}

export default App
