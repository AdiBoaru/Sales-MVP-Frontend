import React, { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ChevronRight, Star, Plus, Minus, ShoppingCart, Check, ArrowLeft } from "lucide-react";
import { getProduct } from "@/api/catalog";
import { addToCart } from "@/lib/cart";
import { formatCurrency } from "@/utils";
import StoreHeader from "@/components/store/StoreHeader";
import ChatWidget from "@/components/store/ChatWidget";

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(/** @type {any} */ (null));
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getProduct(id)
      .then((p) => {
        if (!active) return;
        setProduct(p);
        setActiveImage(0);
        setQty(1);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  const buildCartItem = () => ({
    product_id: product.id,
    product_name: product.name,
    price: product.effectivePrice,
    currency: product.currency,
    image_url: product.image,
    url: product.productUrl,
  });

  const handleAdd = () => {
    if (!product?.inStock) return;
    addToCart(buildCartItem(), qty);
  };

  const handleBuyNow = () => {
    if (!product?.inStock) return;
    addToCart(buildCartItem(), qty);
    navigate("/Cart");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50/50">
        <StoreHeader />
        <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-violet-600 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-gray-50/50">
        <StoreHeader />
        <div className="max-w-md mx-auto text-center py-32 px-4">
          <p className="text-muted-foreground mb-6">Produsul nu a fost găsit.</p>
          <Link
            to="/store"
            className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Înapoi în magazin
          </Link>
        </div>
      </div>
    );
  }

  const images = product.images?.length ? product.images : [{ url: product.image }];

  return (
    <div className="min-h-screen bg-gray-50/50">
      <StoreHeader />

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-6">
          <Link to="/" className="hover:text-foreground">Acasă</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/store" className="hover:text-foreground">Magazin</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground truncate max-w-[200px]">{product.name}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Gallery */}
          <div>
            <div className="aspect-square bg-white rounded-2xl border border-gray-100 overflow-hidden">
              {images[activeImage]?.url ? (
                <img
                  src={images[activeImage].url}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                  Fără imagine
                </div>
              )}
            </div>
            {images.length > 1 && (
              <div className="flex gap-2 mt-3 flex-wrap">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImage(i)}
                    className={`w-16 h-16 rounded-xl overflow-hidden border-2 transition-colors ${
                      i === activeImage ? "border-violet-600" : "border-gray-100 hover:border-gray-200"
                    }`}
                  >
                    <img src={img.url} alt={img.alt || product.name} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div>
            <h1 className="text-2xl md:text-3xl font-bold font-heading leading-tight">{product.name}</h1>

            <div className="flex items-center gap-2 mt-3">
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                <span className="text-sm font-medium">{product.rating ?? "—"}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                ({(product.reviewCount || 0).toLocaleString("ro-RO")} recenzii)
              </span>
            </div>

            {/* Price */}
            <div className="flex items-baseline gap-3 mt-5">
              <span className="text-3xl font-bold">{formatCurrency(product.effectivePrice, product.currency)}</span>
              {product.onSale && (
                <>
                  <span className="text-lg text-muted-foreground line-through">
                    {formatCurrency(product.price, product.currency)}
                  </span>
                  <span className="text-xs font-bold bg-violet-100 text-violet-700 px-2.5 py-1 rounded-md">
                    -{product.discountPercent}%
                  </span>
                </>
              )}
            </div>

            {/* Stock */}
            <div className="mt-4">
              {product.inStock ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-green-600 font-medium">
                  <Check className="w-4 h-4" /> În stoc
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm text-gray-500 font-medium">
                  Stoc epuizat
                </span>
              )}
            </div>

            {/* Description */}
            {(product.shortDescription || product.description) && (
              <p className="text-sm text-muted-foreground leading-relaxed mt-5 whitespace-pre-line">
                {product.description || product.shortDescription}
              </p>
            )}

            {/* Quantity + actions */}
            <div className="flex items-center gap-3 mt-7">
              <div className="inline-flex items-center border border-gray-200 rounded-xl">
                <button
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-10 text-center text-sm font-semibold">{qty}</span>
                <button
                  onClick={() => setQty((q) => q + 1)}
                  className="w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <button
                onClick={handleAdd}
                disabled={!product.inStock}
                className="flex-1 inline-flex items-center justify-center gap-2 border border-violet-600 text-violet-700 hover:bg-violet-50 disabled:opacity-40 disabled:cursor-not-allowed font-semibold px-5 py-2.5 rounded-xl transition-colors"
              >
                <ShoppingCart className="w-4 h-4" /> Adaugă în coș
              </button>
            </div>

            <button
              onClick={handleBuyNow}
              disabled={!product.inStock}
              className="w-full mt-3 inline-flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-5 py-3 rounded-xl transition-colors"
            >
              Cumpără acum
            </button>
          </div>
        </div>
      </div>

      <ChatWidget />
    </div>
  );
}
