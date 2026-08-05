import React from "react";
import { Link } from "react-router-dom";
import { BRAND } from "@/lib/brand";

/**
 * Storefront wordmark.
 *
 * Replaces the earlier icon-in-a-rounded-square lockup. A letterspaced wordmark
 * sitting over a hairline tagline is what an actual retail brand puts in its
 * header — the generic glyph-in-a-tile reads as an app chrome, not a shop.
 *
 * `to={null}` renders the mark without a link (footer usage).
 */
export default function StoreLogo({ to = "/", size = "md", tagline = true }) {
  const scale =
    size === "lg"
      ? { word: "text-2xl tracking-[0.26em]", tag: "text-[9px] tracking-[0.22em]" }
      : { word: "text-lg tracking-[0.24em]", tag: "text-[8px] tracking-[0.2em]" };

  const mark = (
    <span className="flex flex-col leading-none">
      <span className={`font-heading font-semibold uppercase text-gray-900 ${scale.word}`}>
        {BRAND.name}
      </span>
      {tagline && (
        <span
          className={`mt-1.5 hidden font-medium uppercase text-muted-foreground sm:block ${scale.tag}`}
        >
          {BRAND.tagline}
        </span>
      )}
    </span>
  );

  if (!to) return mark;

  return (
    <Link to={to} className="flex-shrink-0" aria-label={BRAND.name}>
      {mark}
    </Link>
  );
}
