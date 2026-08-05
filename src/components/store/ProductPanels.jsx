import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import RichText from "@/components/store/RichText";

// The collapsible copy under the buy box. Panels come from lib/productContent.js
// (already grouped and stripped of empty rows); this file only lays them out.
//
// The first panel opens on mount and every row toggles independently — a shopper
// comparing "cum se folosește" against "potrivit pentru" shouldn't have one snap
// shut to open the other.
export default function ProductPanels({ panels }) {
  const [open, setOpen] = useState(() => new Set(panels.slice(0, 1).map((panel) => panel.id)));

  if (!panels.length) return null;

  const toggle = (id) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className="divide-y divide-black/[0.06] overflow-hidden rounded-2xl border border-black/[0.07] bg-white">
      {panels.map((panel) => {
        const isOpen = open.has(panel.id);
        return (
          <div key={panel.id}>
            <button
              type="button"
              onClick={() => toggle(panel.id)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-gray-50/80 sm:px-6"
            >
              <span className="text-[13.5px] font-medium text-gray-900">{panel.title}</span>
              <ChevronDown
                className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform duration-200 ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {isOpen && (
              <div className="px-5 pb-6 sm:px-6">
                <PanelBody panel={panel} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PanelBody({ panel }) {
  return (
    <div className="space-y-5">
      {panel.lead && <p className="max-w-[88ch] text-[13px] font-medium text-gray-800">{panel.lead}</p>}

      {panel.chips?.length > 0 && (
        <div>
          {panel.chipsLabel && (
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">
              {panel.chipsLabel}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {panel.chips.map((chip) => (
              <span
                key={chip}
                className="rounded-full bg-brand-50 px-3 py-1 text-[11.5px] font-medium text-brand-700"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
      )}

      {panel.blocks?.map((block, i) => (
        <div key={block.title || i}>
          {block.title && (
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">
              {block.title}
            </p>
          )}
          {/* Capped measure: the panel spans both columns, and a 150-character
              line is a wall of text however good the copy is. */}
          <div className="max-w-[88ch] space-y-2.5 text-[13px] leading-relaxed text-gray-600">
            {block.body.split(/\n{2,}/).map((paragraph, j) => (
              <p key={j}>
                <RichText text={paragraph} />
              </p>
            ))}
          </div>
        </div>
      ))}

      {panel.specs?.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
          {panel.specs.map((spec) => (
            <div
              key={spec.label}
              className="flex items-baseline justify-between gap-4 border-b border-dashed border-black/[0.08] py-2 text-[12.5px]"
            >
              <dt className="text-gray-500">{spec.label}</dt>
              <dd className="text-right font-medium text-gray-800">{spec.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
