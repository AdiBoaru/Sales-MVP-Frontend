import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Search, ShoppingCart, Sparkles, Menu, X } from "lucide-react";
import { listProducts, countProducts, countCategories } from "@/api/catalog";
import ProductCard from "@/components/store/ProductCard";
import CategorySidebar from "@/components/store/CategorySidebar";
import Pagination from "@/components/store/Pagination";
import ChatWidget, { openAria } from "@/components/store/ChatWidget";
import { useCartCount } from "@/lib/cart";
import { BRAND } from "@/lib/brand";

const ITEMS_PER_PAGE = 12;

const sortOptions = [
  { label: "Recomandate", value: "featured" },
  { label: "Preț crescător", value: "price_asc" },
  { label: "Preț descrescător", value: "price_desc" },
  { label: "Cele mai apreciate", value: "rating" },
  { label: "Cele mai noi", value: "newest" },
];

export default function Store() {
  const [products, setProducts] = useState(/** @type {any[]} */ ([]));
  const [total, setTotal] = useState(0);
  const [categoryCounts, setCategoryCounts] = useState({});
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("featured");
  const [currentPage, setCurrentPage] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const cartCount = useCartCount();

  // Debounce search (300ms).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Category badge counts (once).
  useEffect(() => {
    countCategories().then(setCategoryCounts);
  }, []);

  // Reset to page 1 when filters change.
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, category, sort]);

  // Fetch products + count (server-side).
  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = { search: debouncedSearch, category, sort };
    Promise.all([
      listProducts({ ...params, limit: ITEMS_PER_PAGE, offset: (currentPage - 1) * ITEMS_PER_PAGE }),
      countProducts(params),
    ])
      .then(([list, count]) => {
        if (!active) return;
        setProducts(list);
        setTotal(count);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [debouncedSearch, category, sort, currentPage]);

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  const handleCategorySelect = (/** @type {string} */ cat) => {
    setCategory(cat);
    setSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 flex-shrink-0">
            <div className="w-7 h-7 bg-violet-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg font-heading hidden sm:block">{BRAND.logoText}</span>
          </Link>

          {/* Search */}
          <div className="flex-1 max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Caută produse și categorii"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-300 transition-all"
            />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={openAria}
              className="hidden sm:inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" /> Întreabă pe {BRAND.assistant}
            </button>
            <Link
              to="/Cart"
              className="relative flex items-center gap-1.5 border border-gray-200 px-3 py-2 rounded-xl text-sm hover:bg-gray-50 transition-colors"
            >
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden sm:inline">Coș</span>
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-violet-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </Link>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-gray-50"
            >
              {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Page title */}
        <div className="mb-6">
          <p className="text-xs font-semibold tracking-widest text-violet-600 uppercase mb-1">Catalogul {BRAND.name}</p>
          <h1 className="text-2xl md:text-3xl font-bold font-heading">Toate categoriile</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Alege o categorie din stânga, caută sau întreab-o pe {BRAND.assistant}. Adaugă în coș și finalizează comanda în câțiva pași.
          </p>
        </div>

        <div className="flex gap-6">
          {/* Sidebar - Desktop */}
          <aside className="hidden md:block w-56 flex-shrink-0">
            <div className="sticky top-20">
              <CategorySidebar selected={category} onSelect={handleCategorySelect} counts={categoryCounts} />
            </div>
          </aside>

          {/* Sidebar - Mobile overlay */}
          {sidebarOpen && (
            <div className="fixed inset-0 z-50 md:hidden">
              <div className="absolute inset-0 bg-black/20" onClick={() => setSidebarOpen(false)} />
              <div className="absolute left-0 top-0 bottom-0 w-64 bg-white p-4 shadow-xl overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Categorii</h3>
                  <button onClick={() => setSidebarOpen(false)}>
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <CategorySidebar selected={category} onSelect={handleCategorySelect} counts={categoryCounts} />
              </div>
            </div>
          )}

          {/* Main content */}
          <main className="flex-1 min-w-0">
            {/* Top bar: count + sort */}
            <div className="flex items-center justify-between mb-5">
              <p className="text-sm text-muted-foreground">
                {total.toLocaleString("ro-RO")} produs{total !== 1 ? "e" : ""}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground hidden sm:inline">Sortează:</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="text-sm border border-gray-200 rounded-xl px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 cursor-pointer"
                >
                  {sortOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Product grid */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-4 border-gray-200 border-t-violet-600 rounded-full animate-spin" />
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-muted-foreground text-sm">Niciun produs găsit. Încearcă altă căutare sau categorie.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}

            {/* Pagination */}
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
          </main>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-100 bg-white mt-16">
        <div className="max-w-7xl mx-auto px-4 py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 bg-violet-600 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold font-heading">{BRAND.name}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {BRAND.tagline}. Produse atent selectate și un asistent care te ajută să alegi în câteva secunde.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Magazin</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="hover:text-foreground cursor-pointer transition-colors">Toate produsele</li>
                <li className="hover:text-foreground cursor-pointer transition-colors">Noutăți</li>
                <li className="hover:text-foreground cursor-pointer transition-colors">Cele mai vândute</li>
                <li className="hover:text-foreground cursor-pointer transition-colors">Carduri cadou</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Ajutor</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="hover:text-foreground cursor-pointer transition-colors">Cum cumperi</li>
                <li className="hover:text-foreground cursor-pointer transition-colors">Livrare</li>
                <li className="hover:text-foreground cursor-pointer transition-colors">Retururi</li>
                <li className="hover:text-foreground cursor-pointer transition-colors">Urmărește comanda</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Companie</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="hover:text-foreground cursor-pointer transition-colors">Despre {BRAND.name}</li>
                <li className="hover:text-foreground cursor-pointer transition-colors">Cariere</li>
                <li className="hover:text-foreground cursor-pointer transition-colors">Centru de ajutor</li>
                <li className="hover:text-foreground cursor-pointer transition-colors">Contact</li>
              </ul>
            </div>
          </div>
        </div>
      </footer>

      {/* Aria chat */}
      <ChatWidget />
    </div>
  );
}
