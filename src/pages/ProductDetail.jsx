import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Droplet,
  Droplets,
  Eye,
  Feather,
  Heart,
  Layers,
  Leaf,
  Minus,
  Package,
  Plus,
  Repeat,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
} from "lucide-react";
import { getProduct } from "@/api/catalog";
import { addToCart } from "@/lib/cart";
import { keyOfProduct, toggleWish, useWished } from "@/lib/wishlist";
import { buildHighlights, buildProductPanels, deliveryEta, stripNamePrefix } from "@/lib/productContent";
import { formatCurrency } from "@/utils";
import StoreHeader from "@/components/store/StoreHeader";
// NX-243: mountul widgetului s-a mutat în `ProtectedStorefrontChatLayout` — o singură
// instanță pentru /store și /product/:id, care supraviețuiește navigării.
import ProductPanels from "@/components/store/ProductPanels";

// Highlight pills carry an icon name (lib/productContent.js stays React-free);
// this is where the name becomes a glyph.
const HIGHLIGHT_ICONS = {
  droplet: Droplet,
  droplets: Droplets,
  eye: Eye,
  feather: Feather,
  layers: Layers,
  leaf: Leaf,
  repeat: Repeat,
  shield: ShieldCheck,
  sparkles: Sparkles,
  sun: Sun,
};

export default function ProductDetail() {
  const { id } = useParams();
  const [product, setProduct] = useState(/** @type {any} */ (null));
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getProduct(id)
      .then((p) => {
        if (!active) return;
        setProduct(p);
        setActiveImage(0);
        setQty(1);
        setJustAdded(false);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  // "Adăugat în coș" is the only confirmation the click gets — the cart badge in
  // the header is easy to miss — so it reverts on its own.
  useEffect(() => {
    if (!justAdded) return;
    const timer = setTimeout(() => setJustAdded(false), 2400);
    return () => clearTimeout(timer);
  }, [justAdded]);

  const wishItem = {
    name: product?.name,
    price: product?.effectivePrice,
    currency: product?.currency,
    image_url: product?.image,
    url: product?.productUrl,
  };
  const wishKey = product ? keyOfProduct(wishItem) : "";
  const wished = useWished(wishKey);

  const panels = useMemo(() => (product ? buildProductPanels(product) : []), [product]);
  const highlights = useMemo(() => (product ? buildHighlights(product.attributes) : []), [product]);

  const handleAdd = () => {
    if (!product?.inStock) return;
    addToCart(
      {
        product_id: product.id,
        product_name: product.name,
        price: product.effectivePrice,
        currency: product.currency,
        image_url: product.image,
        url: product.productUrl,
      },
      qty
    );
    setJustAdded(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf9f6]">
        <StoreHeader />
        <div className="flex items-center justify-center py-32">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-600" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-[#faf9f6]">
        <StoreHeader />
        <div className="mx-auto max-w-md px-4 py-32 text-center">
          <p className="mb-6 text-muted-foreground">Produsul nu a fost găsit.</p>
          <Link
            to="/store"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-brand-700"
          >
            <ArrowLeft className="h-4 w-4" /> Înapoi în magazin
          </Link>
        </div>
      </div>
    );
  }

  const images = product.images?.length ? product.images : [{ url: product.image }];
  const summary = stripNamePrefix(product.shortDescription, product.name);

  return (
    <div className="min-h-screen bg-[#faf9f6]">
      <StoreHeader />

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:py-8">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-1.5 text-[11.5px] text-gray-400">
          <Link to="/" className="transition-colors hover:text-gray-700">
            Acasă
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link to="/store" className="transition-colors hover:text-gray-700">
            Magazin
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="truncate text-gray-600">{product.name}</span>
        </nav>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
          {/* Gallery */}
          <div>
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-black/[0.05] bg-brand-50">
              {images[activeImage]?.url ? (
                <img
                  src={images[activeImage].url}
                  alt={images[activeImage].alt || product.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center px-10 text-center">
                  <span className="font-display text-lg text-brand-700/70">{product.name}</span>
                </div>
              )}
              {product.onSale && (
                <span className="absolute left-4 top-4 rounded-md bg-white/95 px-2.5 py-1 text-[11px] font-bold text-brand-700 shadow-sm">
                  -{product.discountPercent}%
                </span>
              )}
            </div>

            {images.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-2.5">
                {images.map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActiveImage(i)}
                    aria-label={`Imaginea ${i + 1}`}
                    className={`h-16 w-16 overflow-hidden rounded-xl border bg-brand-50 transition-colors ${
                      i === activeImage ? "border-brand-600" : "border-black/[0.06] hover:border-brand-300"
                    }`}
                  >
                    <img
                      src={img.url}
                      alt={img.alt || product.name}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Buy box */}
          <div>
            {/* Neutral ink rather than Tailwind's blue-tinted gray-900: the serif
                is the shop's voice and it should read warm, not navy. */}
            <h1 className="font-display text-[26px] font-medium leading-[1.15] tracking-[-0.01em] text-[#1b1a18] md:text-[34px]">
              {product.name}
            </h1>

            <div className="mt-3 flex items-center gap-2">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              <span className="text-[13px] font-semibold text-gray-800">{product.rating ?? "—"}</span>
              <span className="text-[12px] text-gray-400">
                ({(product.reviewCount || 0).toLocaleString("ro-RO")} recenzii)
              </span>
            </div>

            <div className="mt-5 flex flex-wrap items-baseline gap-3">
              <span className="font-display text-[28px] font-semibold text-[#1b1a18] md:text-[32px]">
                {formatCurrency(product.effectivePrice, product.currency)}
              </span>
              {product.onSale && (
                <>
                  <span className="text-[16px] text-gray-400 line-through">
                    {formatCurrency(product.price, product.currency)}
                  </span>
                  <span className="rounded-md bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-700">
                    -{product.discountPercent}%
                  </span>
                </>
              )}
            </div>

            <div className="mt-2.5">
              {product.inStock ? (
                <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-green-700">
                  <Check className="h-4 w-4" /> În stoc
                </span>
              ) : (
                <span className="text-[13px] font-medium text-gray-500">Stoc epuizat</span>
              )}
            </div>

            {summary && (
              <p className="mt-4 max-w-[52ch] text-[13.5px] leading-relaxed text-gray-500">{summary}</p>
            )}

            {highlights.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {highlights.map(({ label, icon }) => {
                  const Icon = HIGHLIGHT_ICONS[icon] || Sparkles;
                  return (
                    <span
                      key={label}
                      className="inline-flex items-center gap-2 rounded-full bg-gray-100/90 px-3.5 py-2 text-[12px] font-medium text-gray-700"
                    >
                      <Icon className="h-3.5 w-3.5 text-brand-600" />
                      {label}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Quantity · add to cart · save */}
            <div className="mt-7 flex items-stretch gap-3">
              <div className="flex items-center rounded-xl border border-black/[0.09] bg-white">
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  aria-label="Scade cantitatea"
                  className="flex h-12 w-11 items-center justify-center text-gray-400 transition-colors hover:text-gray-900"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-6 text-center text-[13px] font-semibold tabular-nums">{qty}</span>
                <button
                  type="button"
                  onClick={() => setQty((q) => q + 1)}
                  aria-label="Crește cantitatea"
                  className="flex h-12 w-11 items-center justify-center text-gray-400 transition-colors hover:text-gray-900"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={handleAdd}
                disabled={!product.inStock}
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-900 px-6 text-[14px] font-semibold text-white transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {justAdded ? (
                  <>
                    <Check className="h-4 w-4" /> Adăugat în coș
                  </>
                ) : (
                  "Adaugă în coș"
                )}
              </button>

              <button
                type="button"
                onClick={() => toggleWish(wishItem)}
                aria-label={wished ? "Scoate din favorite" : "Salvează la favorite"}
                aria-pressed={wished}
                className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-black/[0.09] bg-white transition-colors hover:border-brand-300"
              >
                <Heart
                  className={`h-[18px] w-[18px] transition-colors ${
                    wished ? "fill-brand-600 text-brand-600" : "text-gray-400"
                  }`}
                />
              </button>
            </div>

            {/* Reserved so the confirmation link doesn't shift the trust row. */}
            <div className="mt-2 h-5 text-[12px]">
              {justAdded && (
                <Link to="/Cart" className="font-medium text-brand-700 underline underline-offset-2">
                  Vezi coșul
                </Link>
              )}
            </div>

            {/* Three columns only once they fit: at 390px they turn into three
                two-word-per-line stacks. */}
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { Icon: Package, title: "Livrare rapidă", note: deliveryEta(product.deliveryClass) },
                { Icon: RotateCcw, title: "Retur 30 zile", note: "fără bătăi de cap" },
                { Icon: ShieldCheck, title: "Plată securizată", note: "100% sigură" },
              ].map(({ Icon, title, note }) => (
                <div key={title} className="flex items-center gap-2.5">
                  <Icon className="h-[22px] w-[22px] flex-shrink-0 text-gray-400" strokeWidth={1.5} />
                  <div className="min-w-0">
                    <p className="text-[11.5px] font-semibold leading-tight text-gray-800">{title}</p>
                    <p className="text-[11px] leading-tight text-gray-400">{note}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 md:mt-10">
          <ProductPanels panels={panels} />
        </div>
      </div>

    </div>
  );
}
