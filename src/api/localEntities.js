// Minimal localStorage-backed entity store for checkout (Order / Customer / Settings).
// Orders are NOT persisted to a real backend (decision: localStorage stub, like the
// original site — see IMPLEMENTATION.md §11.1). Swap this for Supabase orders later.

const PREFIX = "sales-mvp:";

function read(name) {
  try {
    const raw = localStorage.getItem(PREFIX + name);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(name, list) {
  try {
    localStorage.setItem(PREFIX + name, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

function createEntity(name) {
  return {
    async list() {
      return read(name);
    },
    async filter(predicate = {}) {
      return read(name).filter((row) =>
        Object.entries(predicate).every(([k, v]) => row[k] === v)
      );
    },
    async get(id) {
      return read(name).find((row) => row.id === id) || null;
    },
    async create(data) {
      const list = read(name);
      const row = { id: uid(), created_date: new Date().toISOString(), ...data };
      list.push(row);
      write(name, list);
      return row;
    },
    async update(id, data) {
      const list = read(name);
      const idx = list.findIndex((row) => row.id === id);
      if (idx === -1) return null;
      list[idx] = { ...list[idx], ...data };
      write(name, list);
      return list[idx];
    },
    async delete(id) {
      write(name, read(name).filter((row) => row.id !== id));
      return true;
    },
  };
}

export const Order = createEntity("Order");
export const Customer = createEntity("Customer");
export const Settings = createEntity("Settings");
