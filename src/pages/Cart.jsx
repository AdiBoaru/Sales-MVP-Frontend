import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trash2, Plus, Minus, ShoppingBag, ArrowLeft, Check, Loader2, X } from "lucide-react";
import { getCart, setQuantity, removeItem, clearCart } from "@/lib/cart";
import { Order, Customer, Settings } from "@/api/localEntities";
import { formatCurrency } from "@/utils";
import { BRAND } from "@/lib/brand";
import StoreHeader from "@/components/store/StoreHeader";

const EMPTY_FORM = { name: "", phone: "", address: "", city: "", notes: "" };
const inputClass =
  "w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-300 transition-all";

export default function Cart() {
  const [items, setItems] = useState(/** @type {any[]} */ ([]));
  const [view, setView] = useState(/** @type {"cart" | "success"} */ ("cart"));
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [placing, setPlacing] = useState(false);
  const [lastOrder, setLastOrder] = useState(/** @type {any} */ (null));
  const [qrUrl, setQrUrl] = useState("");

  const refresh = () => setItems(getCart());

  useEffect(() => {
    refresh();
  }, []);

  const currency = items[0]?.currency || BRAND.currency;
  const subtotal = items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0);
  const total = subtotal; // free shipping

  const handleQty = (/** @type {string} */ key, /** @type {number} */ qty) => {
    setQuantity(key, qty);
    refresh();
  };
  const handleRemove = (/** @type {string} */ key) => {
    removeItem(key);
    refresh();
  };

  const updateForm = (/** @type {string} */ field, /** @type {string} */ value) =>
    setForm((f) => ({ ...f, [field]: value }));

  const canSubmit = form.name.trim() && form.phone.trim() && form.address.trim() && form.city.trim();

  const placeOrder = async (/** @type {React.FormEvent} */ e) => {
    e.preventDefault();
    if (!canSubmit || placing) return;
    setPlacing(true);
    try {
      const orderNumber = `${BRAND.orderPrefix}${Date.now()}`;

      const customer = await Customer.create({
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
      });

      const order = await Order.create({
        order_number: orderNumber,
        customer_id: customer.id,
        customer_name: customer.name,
        customer_phone: customer.phone,
        address: customer.address,
        city: customer.city,
        notes: form.notes.trim(),
        items: items.map((it) => ({
          product_id: it.product_id,
          product_name: it.product_name,
          price: it.price,
          quantity: it.quantity,
        })),
        currency,
        subtotal,
        total,
        status: "pending",
      });

      // QR: prefer configured Settings image, else generate one.
      let qr = "";
      try {
        const settings = await Settings.list();
        qr = settings[0]?.qrCodeImageUrl || "";
      } catch {
        /* ignore */
      }
      if (!qr) {
        const payload = `${BRAND.name} • Comanda ${orderNumber} • ${formatCurrency(total, currency)}`;
        qr = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(payload)}`;
      }

      clearCart();
      setLastOrder(order);
      setQrUrl(qr);
      setCheckoutOpen(false);
      setForm(EMPTY_FORM);
      setView("success");
      window.scrollTo(0, 0);
    } finally {
      setPlacing(false);
    }
  };

  // ── Success ──────────────────────────────────────────────────────────────────
  if (view === "success" && lastOrder) {
    return (
      <div className="min-h-screen bg-gray-50/50">
        <StoreHeader />
        <div className="max-w-md mx-auto px-4 py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold font-heading">Comandă plasată!</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Mulțumim! Comanda <span className="font-semibold text-foreground">{lastOrder.order_number}</span> a fost înregistrată.
          </p>

          <div className="bg-white border border-gray-100 rounded-2xl p-6 mt-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Scanează pentru plată</p>
            {qrUrl && <img src={qrUrl} alt="Cod QR plată" className="w-44 h-44 mx-auto rounded-xl" />}
            <p className="text-lg font-bold mt-4">{formatCurrency(lastOrder.total, lastOrder.currency)}</p>
          </div>

          <Link
            to="/store"
            className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors mt-7"
          >
            <ArrowLeft className="w-4 h-4" /> Continuă cumpărăturile
          </Link>
        </div>
      </div>
    );
  }

  // ── Empty ────────────────────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50/50">
        <StoreHeader />
        <div className="max-w-md mx-auto px-4 py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-5">
            <ShoppingBag className="w-8 h-8 text-gray-400" />
          </div>
          <h1 className="text-xl font-bold font-heading">Coșul e gol</h1>
          <p className="text-sm text-muted-foreground mt-2">Adaugă produse din magazin ca să continui.</p>
          <Link
            to="/store"
            className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors mt-6"
          >
            <ArrowLeft className="w-4 h-4" /> Mergi în magazin
          </Link>
        </div>
      </div>
    );
  }

  // ── Cart ─────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50/50">
      <StoreHeader />

      <div className="max-w-5xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold font-heading mb-6">Coșul tău</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Items */}
          <div className="lg:col-span-2 space-y-3">
            {items.map((it) => (
              <div key={it.key} className="flex gap-4 bg-white border border-gray-100 rounded-2xl p-3">
                <div className="w-20 h-20 rounded-xl bg-gray-50 overflow-hidden flex-shrink-0">
                  {it.image_url ? (
                    <img src={it.image_url} alt={it.product_name} className="w-full h-full object-cover" />
                  ) : null}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-snug line-clamp-2">{it.product_name}</p>
                  <p className="text-sm font-bold mt-1">{formatCurrency(it.price, it.currency)}</p>
                  <div className="flex items-center justify-between mt-2">
                    <div className="inline-flex items-center border border-gray-200 rounded-lg">
                      <button
                        onClick={() => handleQty(it.key, it.quantity - 1)}
                        className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-8 text-center text-sm font-semibold">{it.quantity}</span>
                      <button
                        onClick={() => handleQty(it.key, it.quantity + 1)}
                        className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button
                      onClick={() => handleRemove(it.key)}
                      className="text-muted-foreground hover:text-red-500 transition-colors"
                      aria-label="Șterge"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white border border-gray-100 rounded-2xl p-5 sticky top-20">
              <h2 className="font-semibold mb-4">Sumar comandă</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">{formatCurrency(subtotal, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Livrare</span>
                  <span className="font-medium text-green-600">Gratuită</span>
                </div>
                <div className="border-t border-gray-100 pt-3 flex justify-between text-base">
                  <span className="font-semibold">Total</span>
                  <span className="font-bold">{formatCurrency(total, currency)}</span>
                </div>
              </div>
              <button
                onClick={() => setCheckoutOpen(true)}
                className="w-full mt-5 bg-violet-600 hover:bg-violet-700 text-white font-semibold py-3 rounded-xl transition-colors"
              >
                Finalizează comanda
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Checkout modal */}
      {checkoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !placing && setCheckoutOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold font-heading">Date de livrare</h2>
              <button
                onClick={() => !placing && setCheckoutOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-gray-50"
                aria-label="Închide"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={placeOrder} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="name" className="text-sm font-medium">Nume complet</label>
                <input id="name" className={inputClass} value={form.name} onChange={(e) => updateForm("name", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="phone" className="text-sm font-medium">Telefon</label>
                <input id="phone" type="tel" className={inputClass} value={form.phone} onChange={(e) => updateForm("phone", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="address" className="text-sm font-medium">Adresă</label>
                <input id="address" className={inputClass} value={form.address} onChange={(e) => updateForm("address", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="city" className="text-sm font-medium">Oraș</label>
                <input id="city" className={inputClass} value={form.city} onChange={(e) => updateForm("city", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="notes" className="text-sm font-medium">Observații (opțional)</label>
                <textarea id="notes" rows={2} className={inputClass} value={form.notes} onChange={(e) => updateForm("notes", e.target.value)} />
              </div>
              <button
                type="submit"
                disabled={!canSubmit || placing}
                className="w-full inline-flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
              >
                {placing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Se plasează...
                  </>
                ) : (
                  `Plasează comanda · ${formatCurrency(total, currency)}`
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
