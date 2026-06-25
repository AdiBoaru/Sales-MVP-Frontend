import React from "react";
import {
  Layers, FlaskConical, Droplet, Sparkles, Droplets, Wind, Brush,
  Scissors, Palette, Sun, SprayCan, Wand2, Package,
} from "lucide-react";
import { CATEGORIES } from "@/api/catalog";

// Icon per derived category value (visual only).
const ICONS = {
  all: Layers,
  seruri: FlaskConical,
  creme: Droplet,
  masti: Sparkles,
  toner: Droplets,
  curatare: Wind,
  accesorii: Brush,
  par: Scissors,
  machiaj: Palette,
  spf: Sun,
  corp: SprayCan,
  parfum: Wand2,
  diverse: Package,
};

const items = [
  { value: "all", label: "Toate produsele", icon: ICONS.all },
  ...CATEGORIES.map((c) => ({ value: c.value, label: c.label, icon: ICONS[c.value] || Package })),
];

/**
 * @param {{ selected?: string, onSelect: (value: string) => void, counts?: Record<string, number> }} props
 */
export default function CategorySidebar({ selected, onSelect, counts = {} }) {
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((cat) => {
        const isActive = selected === cat.value;
        const count = cat.value === "all" ? counts.all || 0 : counts[cat.value] || 0;
        const Icon = cat.icon;

        return (
          <button
            key={cat.value}
            onClick={() => onSelect(cat.value)}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all duration-150 text-sm ${
              isActive
                ? "bg-violet-600 text-white font-semibold shadow-sm"
                : "text-foreground hover:bg-gray-50"
            }`}
          >
            <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-white" : "text-muted-foreground"}`} />
            <span className="truncate flex-1">{cat.label}</span>
            <span className={`text-[10px] font-medium ${isActive ? "text-violet-200" : "text-muted-foreground"}`}>
              {count.toLocaleString("ro-RO")}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
