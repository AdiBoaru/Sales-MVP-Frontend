import React from "react";

// The Aria wordmark glyph — a rotated rounded square with a gradient BORDER
// (not fill) and a small solid-gradient dot at its center. Matches the design
// spec's header/welcome logo mark exactly (gradient border via double
// background + background-clip trick).
export default function AriaMark({ size = 34, innerSize = null, className = "" }) {
  const inner = innerSize ?? Math.round(size * 0.7);
  const dot = Math.round(inner * 0.3);
  return (
    <div
      className={`shrink-0 grid place-items-center ${className}`}
      style={{ width: size, height: size }}
    >
      <div
        style={{
          width: inner,
          height: inner,
          borderRadius: Math.round(inner * 0.3),
          transform: "rotate(45deg)",
          background: "#fff",
          border: "2px solid transparent",
          backgroundImage: "linear-gradient(#fff,#fff), var(--aria-gradient)",
          backgroundOrigin: "border-box",
          backgroundClip: "padding-box, border-box",
          display: "grid",
          placeItems: "center",
        }}
      >
        <div
          style={{
            transform: "rotate(-45deg)",
            width: dot,
            height: dot,
            borderRadius: "9999px",
            background: "var(--aria-gradient)",
          }}
        />
      </div>
    </div>
  );
}
