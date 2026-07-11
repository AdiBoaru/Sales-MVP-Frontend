import { useEffect, useState } from "react";

// Shared "saved products" list for the chat widget's bottom drawer, persisted in
// localStorage. Stores full snapshots (not just keys) so the drawer can render
// name/price/image without re-fetching — same shape philosophy as lib/cart.js.

const WISHLIST_KEY = "aria-wishlist";
const EVENT = "wishlist:updated";

// Item shape: { key, name, price, currency, image_url, url }

function read() {
  try {
    const raw = localStorage.getItem(WISHLIST_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(list));
  } catch {
    /* ignore quota / private mode */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT));
  }
}

export function keyOfProduct(product) {
  return String(product?.url || product?.name || "");
}

export function getWishlist() {
  return read();
}

export function isWished(key) {
  if (!key) return false;
  return read().some((it) => it.key === key);
}

export function toggleWish(product) {
  const key = keyOfProduct(product);
  if (!key) return;
  const list = read();
  const next = list.some((it) => it.key === key)
    ? list.filter((it) => it.key !== key)
    : [
        ...list,
        {
          key,
          name: product.name,
          price: Number(product.price) || 0,
          currency: product.currency || "RON",
          image_url: product.image_url || "",
          url: product.url || "",
        },
      ];
  write(next);
}

export function removeWish(key) {
  write(read().filter((it) => it.key !== key));
}

// Live "is this product saved?" flag — reactive across every card showing the
// same product (same tab, via the custom event; other tabs via storage).
export function useWished(key) {
  const [wished, setWished] = useState(() => isWished(key));
  useEffect(() => {
    const sync = () => setWished(isWished(key));
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [key]);
  return wished;
}

// Live full saved list, for the drawer.
export function useWishlist() {
  const [items, setItems] = useState(() => (typeof window !== "undefined" ? getWishlist() : []));
  useEffect(() => {
    const sync = () => setItems(getWishlist());
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
