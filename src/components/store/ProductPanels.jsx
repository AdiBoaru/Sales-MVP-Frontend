import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import RichText from "@/components/store/RichText";

// The collapsible copy under the buy box. Panels come from lib/productContent.js
// (already grouped, flattened and stripped of empty rows); this file only lays
// them out.
//
// Styled as a flat editorial list — hairline rules, no card, headings set in the
// shop's display serif in caps — which is how beauty retailers present this block.
// A boxed accordion with small sans labels reads as an app control panel.
//
// The first panel opens on mount and every row toggles independently: a shopper
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
    <div className="border-t border-black/[0.09]">
      {panels.map((panel) => {
        const isOpen = open.has(panel.id);
        return (
          <section key={panel.id} className="border-b border-black/[0.09]">
            <button
              type="button"
              onClick={() => toggle(panel.id)}
              aria-expanded={isOpen}
              className="group flex w-full items-center justify-between gap-6 py-5 text-left"
            >
              <h2 className="font-display text-[17px] uppercase leading-tight tracking-[0.05em] text-[#1b1a18] md:text-[20px]">
                {panel.title}
              </h2>
              <ChevronDown
                className={`h-5 w-5 flex-shrink-0 text-gray-500 transition-transform duration-200 group-hover:text-gray-900 ${
                  isOpen ? "rotate-180" : ""
                }`}
                strokeWidth={1.5}
              />
            </button>

            {isOpen && (
              <div className="pb-8">
                <PanelBody panel={panel} />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function PanelBody({ panel }) {
  return (
    <div className="max-w-[92ch] space-y-4">
      {panel.lead && <p className="text-[14.5px] font-medium leading-[1.7] text-gray-800">{panel.lead}</p>}

      {panel.chips?.length > 0 && (
        <div>
          {panel.chipsLabel && (
            <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-gray-400">
              {panel.chipsLabel}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {panel.chips.map((chip) => (
              <span
                key={chip}
                className="rounded-full bg-brand-50 px-3 py-1 text-[12px] font-medium text-brand-700"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
      )}

      {panel.paragraphs?.map((paragraph, i) => (
        <p key={i} className="text-[14.5px] leading-[1.7] text-gray-700">
          <RichText text={paragraph} />
        </p>
      ))}

      {panel.specs?.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-12 sm:grid-cols-2">
          {panel.specs.map((spec) => (
            <div
              key={spec.label}
              className="flex items-baseline justify-between gap-4 border-b border-dashed border-black/[0.09] py-2.5 text-[13.5px]"
            >
              <dt className="text-gray-500">{spec.label}</dt>
              <dd className="text-right font-medium text-gray-800">{spec.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {panel.note && (
        <p className="border border-black/[0.12] px-4 py-3.5 text-[13px] italic leading-[1.6] text-gray-500">
          {panel.note}
        </p>
      )}
    </div>
  );
}
