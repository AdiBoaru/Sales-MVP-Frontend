import React from "react";
import { Link } from "react-router-dom";
import { Heart, Plus, Star } from "lucide-react";
import { addToCart } from "@/lib/cart";
import { formatCurrency } from "@/utils";

export default function ProductCard({ product }) {
  const handleAdd = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!product.inStock) return;
    addToCart({
      product_id: product.id,
      product_name: product.name,
      price: product.effectivePrice,
      currency: product.currency,
      image_url: product.image,
      url: product.productUrl,
    });
  };

  return (
    <Link
      to={`/product/${product.id}`}
      className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg transition-all duration-300 group flex flex-col"
    >
      {/* Image area */}
      <div className="relative aspect-square bg-gray-50 overflow-hidden">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
            Fără imagine
          </div>
        )}
        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          {product.onSale && (
            <span className="text-[10px] font-bold bg-violet-100 text-violet-700 px-2.5 py-1 rounded-md">
              -{product.discountPercent}%
            </span>
          )}
          {!product.inStock && (
            <span className="text-[10px] font-bold uppercase tracking-wider bg-gray-800 text-white px-2.5 py-1 rounded-md">
              Stoc epuizat
            </span>
          )}
        </div>
        {/* Wishlist (decorative) */}
        <button
          type="button"
          onClick={(e) => e.preventDefault()}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-white"
          aria-label="Salvează"
        >
          <Heart className="w-4 h-4 text-gray-400 hover:text-red-400 transition-colors" />
        </button>
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col flex-1">
        {product.shortDescription && (
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 line-clamp-1">
            {product.shortDescription}
          </p>
        )}
        <h3 className="text-sm font-semibold leading-snug mb-2 line-clamp-2 flex-1">{product.name}</h3>
        {/* Rating */}
        <div className="flex items-center gap-1.5 mb-3">
          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
          <span className="text-xs font-medium">{product.rating ?? "—"}</span>
          <span className="text-[10px] text-muted-foreground">
            ({(product.reviewCount || 0).toLocaleString("ro-RO")})
          </span>
        </div>
        {/* Price + Add */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline flex-wrap gap-x-1.5 min-w-0">
            <span className="text-base font-bold whitespace-nowrap">{formatCurrency(product.effectivePrice, product.currency)}</span>
            {product.onSale && (
              <span className="text-xs text-muted-foreground line-through whitespace-nowrap">
                {formatCurrency(product.price, product.currency)}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!product.inStock}
            className="inline-flex items-center gap-1 shrink-0 whitespace-nowrap bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-3 h-3" /> Adaugă
          </button>
        </div>
      </div>
    </Link>
  );
}
