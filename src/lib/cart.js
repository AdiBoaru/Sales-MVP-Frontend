import { useEffect, useState } from "react";

// Shared cart, persisted in localStorage. Key name kept from the original
// template (used to be duplicated in 4 places — now centralized here).
const CART_KEY = "hamro-pasal-cart";
const EVENT = "cart:updated";

// Item shape: { key, product_id, product_name, price, currency, quantity, image_url, url }
// Products coming from chat have no catalog id -> their key falls back to url/name.

function read() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT));
  }
}

function keyOf(item) {
  // Falsy fallback (not just nullish): chat products set product_id=null and may
  // have url="" — an empty string must still fall through to product_name so two
  // distinct url-less chat products don't collide on key "".
  return String(item.product_id || item.url || item.product_name || "");
}

export function getCart() {
  return read();
}

export function getCartCount() {
  return read().reduce((n, it) => n + (Number(it.quantity) || 0), 0);
}

export function addToCart(item, qty = 1) {
  const list = read();
  const key = keyOf(item);
  const existing = list.find((it) => it.key === key);
  if (existing) {
    existing.quantity = (Number(existing.quantity) || 0) + qty;
  } else {
    list.push({
      key,
      product_id: item.product_id ?? null,
      product_name: item.product_name,
      price: Number(item.price) || 0,
      currency: item.currency || "RON",
      quantity: qty,
      image_url: item.image_url || "",
      url: item.url || "",
    });
  }
  write(list);
}

export function setQuantity(key, qty) {
  const list = read();
  const item = list.find((it) => it.key === key);
  if (!item) return;
  item.quantity = Math.max(1, Number(qty) || 1);
  write(list);
}

export function removeItem(key) {
  write(read().filter((it) => it.key !== key));
}

export function clearCart() {
  write([]);
}

// Live cart-count badge for navbars. Updates on add/remove (same tab) and on
// storage events (other tabs).
export function useCartCount() {
  const [count, setCount] = useState(() => (typeof window !== "undefined" ? getCartCount() : 0));
  useEffect(() => {
    const sync = () => setCount(getCartCount());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return count;
}

// Live cart items. Same wiring as useCartCount, but returns the full list — for
// UIs that render the cart inline (e.g. the chat widget's cart panel).
export function useCart() {
  const [items, setItems] = useState(() => (typeof window !== "undefined" ? getCart() : []));
  useEffect(() => {
    const sync = () => setItems(getCart());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return items;
}
