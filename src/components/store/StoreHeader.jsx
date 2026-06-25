import React from "react";
import { Link } from "react-router-dom";
import { Sparkles, ShoppingCart } from "lucide-react";
import { useCartCount } from "@/lib/cart";
import { BRAND } from "@/lib/brand";

// Compact storefront header used on ProductDetail / Cart (no search / sidebar).
export default function StoreHeader() {
  const cartCount = useCartCount();

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4">
        <Link to="/" className="flex items-center gap-2 flex-shrink-0">
          <div className="w-7 h-7 bg-violet-600 rounded-lg flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg font-heading hidden sm:block">{BRAND.logoText}</span>
        </Link>

        <Link to="/store" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          Magazin
        </Link>

        <Link
          to="/Cart"
          className="relative flex items-center gap-1.5 border border-gray-200 px-3 py-2 rounded-xl text-sm hover:bg-gray-50 transition-colors ml-auto"
        >
          <ShoppingCart className="w-4 h-4" />
          <span className="hidden sm:inline">Coș</span>
          {cartCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-violet-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {cartCount}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
