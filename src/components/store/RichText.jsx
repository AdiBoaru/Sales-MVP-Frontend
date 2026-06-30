import React from "react";

// Escape HTML, then render only **bold** and newlines. Shared by the chat widget
// (message bubbles) and the product card ("Spune-mi mai multe" details), so all
// bot-authored text stays consistently safe — no raw HTML injection from replies.
export default function RichText({ text }) {
  const escaped = String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br/>");
  return <span dangerouslySetInnerHTML={{ __html: escaped }} />;
}
