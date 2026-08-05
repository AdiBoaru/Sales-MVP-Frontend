import React from "react";
import { Layers, Droplet, Palette, Scissors, SprayCan, Smile, Sun, Package } from "lucide-react";

// Icon per root category slug (visual only). Slugs come from the DB; anything
// unmapped — a new root, a subcategory — falls back to Package.
const ICONS = {
  all: Layers,
  "ingrijirea-tenului": Droplet,
  machiaj: Palette,
  "ingrijirea-parului": Scissors,
  "ingrijire-corp": SprayCan,
  buze: Smile,
  "protectie-solara": Sun,
};

/**
 * Two levels: roots always visible, children revealed under the selected root
 * (or under the selected child's root). Flattening all ~42 categories would bury
 * the six that matter; hiding the children would drop the granularity the
 * catalog actually has.
 *
 * @param {{
 *   categories?: Array<{slug: string, name: string, productCount: number, children?: any[]}>,
 *   selected?: string,
 *   onSelect: (slug: string) => void,
 *   counts?: Record<string, number>,
 * }} props
 */
export default function CategorySidebar({ categories = [], selected, onSelect, counts = {} }) {
  const countFor = (slug, fallback) => counts[slug] ?? fallback ?? 0;

  const renderButton = (slug, label, count, { child = false } = {}) => {
    const isActive = selected === slug;
    const Icon = child ? null : ICONS[slug] || Package;

    return (
      <button
        key={slug}
        onClick={() => onSelect(slug)}
        className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all duration-150 ${
          child ? "text-[13px] ml-4" : "text-sm"
        } ${isActive ? "bg-violet-600 text-white font-semibold shadow-sm" : "text-foreground hover:bg-gray-50"}`}
      >
        {Icon ? (
          <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-white" : "text-muted-foreground"}`} />
        ) : (
          <span
            className={`w-1 h-1 rounded-full flex-shrink-0 ml-1.5 ${
              isActive ? "bg-white" : "bg-gray-300"
            }`}
          />
        )}
        <span className="truncate flex-1">{label}</span>
        <span className={`text-[10px] font-medium ${isActive ? "text-violet-200" : "text-muted-foreground"}`}>
          {count.toLocaleString("ro-RO")}
        </span>
      </button>
    );
  };

  return (
    <nav className="flex flex-col gap-0.5">
      {renderButton("all", "Toate produsele", countFor("all"))}

      {categories.map((root) => {
        const children = root.children || [];
        const expanded =
          selected === root.slug || children.some((child) => child.slug === selected);

        return (
          <React.Fragment key={root.slug}>
            {renderButton(root.slug, root.name, countFor(root.slug, root.productCount))}
            {expanded &&
              children.map((child) =>
                renderButton(child.slug, child.name, countFor(child.slug, child.productCount), {
                  child: true,
                })
              )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
