import React from "react";
import { Check } from "lucide-react";

// Bot-authored text is never trusted: everything is HTML-escaped first, then only
// **bold** is turned back into markup. Two rendering modes:
//
//   variant="inline" (default) — a single <span>, newlines become <br/>. Used
//     wherever the text sits inside another line of UI (user bubble, card
//     captions, verdict copy).
//   variant="reply" — the izi answer layout: a lead paragraph, an accent-blue
//     summary line, section headings and green-check feature lists. Used for the
//     assistant's message body and the "Spune-mi mai multe" detail block.

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Escaped text + **bold** -> safe HTML. Newlines are left to the caller.
function inlineHtml(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function Inline({ text }) {
  return <span dangerouslySetInnerHTML={{ __html: inlineHtml(text).replace(/\n/g, "<br/>") }} />;
}

const HEADING_RE = /^\s{0,3}#{1,4}\s+(.+?)\s*$/;
// A whole line wrapped in ** is a section heading ("**Ce spun clienții**"), but only
// when it's short — a long bold sentence is a lead paragraph, not a heading.
const BOLD_HEADING_RE = /^\s*\*\*(.+?)\*\*\s*:?\s*$/;
const BULLET_RE = /^\s*(?:[-*•]|✓|✔)\s+(.+?)\s*$/;
const NUMBERED_RE = /^\s*\d+[.)]\s+(.+?)\s*$/;
const HEADING_MAX = 60;

// Split bot markdown into the block types the reply layout renders. Blank lines
// separate paragraphs; consecutive bullets collapse into one list. Every block
// carries the same shape ({ type, text, items }) — only the fields its type uses
// are populated.
export function parseBlocks(text) {
  const blocks = [];
  let paragraph = /** @type {string[] | null} */ (null);
  let list = /** @type {string[] | null} */ (null);

  const closeParagraph = () => {
    if (paragraph) blocks.push({ type: "p", text: paragraph.join("\n"), items: [] });
    paragraph = null;
  };
  const closeList = () => {
    if (list) blocks.push({ type: "ul", text: "", items: list });
    list = null;
  };

  for (const raw of String(text ?? "").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeParagraph();
      closeList();
      continue;
    }

    const heading = line.match(HEADING_RE) || line.match(BOLD_HEADING_RE);
    if (heading && heading[1].length <= HEADING_MAX) {
      closeParagraph();
      closeList();
      blocks.push({ type: "h", text: heading[1], items: [] });
      continue;
    }

    const item = line.match(BULLET_RE) || line.match(NUMBERED_RE);
    if (item) {
      closeParagraph();
      if (!list) list = [];
      list.push(item[1]);
      continue;
    }

    closeList();
    if (!paragraph) paragraph = [];
    paragraph.push(line);
  }

  closeParagraph();
  closeList();
  return blocks;
}

// The first two paragraphs of an answer carry the izi rhythm — a bold navy lead,
// then one accent-blue line summarising it. Everything after a heading or a list
// is ordinary body copy.
const LEAD_CLASS = "text-[15px] font-bold leading-[1.45] text-[var(--aria-text)]";
const SUMMARY_CLASS = "text-[13.5px] leading-[1.6] text-[var(--aria-accent-line)]";
const BODY_CLASS = "text-[13.5px] leading-[1.65] text-[var(--aria-text-2)]";

// The reference interleaves the answer with the product cards: the lead + summary
// come first, then the card, then the detail sections. `part` slices the parsed
// blocks at the first heading/list so a caller can render each side of the cards.
//   "intro" — everything before the first heading/list (nothing if it starts with one)
//   "rest"  — the first heading/list onwards (nothing if there is none)
// Exported so a caller can skip rendering an empty half.
export function hasReplyPart(text, part) {
  return sliceBlocks(parseBlocks(text), part).length > 0;
}

function sliceBlocks(blocks, part) {
  if (part !== "intro" && part !== "rest") return blocks;
  const cut = blocks.findIndex((b) => b.type !== "p");
  if (cut === -1) return part === "intro" ? blocks : [];
  return part === "intro" ? blocks.slice(0, cut) : blocks.slice(cut);
}

function Reply({ text, part }) {
  const all = parseBlocks(text);
  const blocks = sliceBlocks(all, part);
  if (blocks.length === 0) return null;
  let paragraphs = 0; // paragraphs seen before the first heading/list
  let structured = part === "rest";

  return (
    <div className="aria-reply flex flex-col gap-3">
      {blocks.map((b, i) => {
        if (b.type === "h") {
          structured = true;
          return (
            <h4 key={i} className="aria-heading text-[16.5px] leading-snug text-[var(--aria-text)] pt-1">
              <Inline text={b.text} />
            </h4>
          );
        }
        if (b.type === "ul") {
          structured = true;
          return (
            <ul key={i} className="flex flex-col gap-2">
              {b.items.map((it, j) => (
                <li key={j} className="flex gap-2.5">
                  <Check className="w-4 h-4 mt-[3px] shrink-0 text-[var(--aria-success)]" strokeWidth={3} />
                  <span className={BODY_CLASS}>
                    <Inline text={it} />
                  </span>
                </li>
              ))}
            </ul>
          );
        }
        const rank = structured ? 2 : paragraphs++;
        const cls = rank === 0 ? LEAD_CLASS : rank === 1 ? SUMMARY_CLASS : BODY_CLASS;
        return (
          <p key={i} className={cls}>
            <Inline text={b.text} />
          </p>
        );
      })}
    </div>
  );
}

export default function RichText({ text, variant = "inline", part = "all" }) {
  return variant === "reply" ? <Reply text={text} part={part} /> : <Inline text={text} />;
}
