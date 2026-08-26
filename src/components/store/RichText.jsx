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
// One 15px size across the answer, as in the reference — the lead is set apart by
// weight and ink, not by scale. Calibrated against the reference's line breaks at
// 405px: any smaller and each line swallows an extra word.
const LEAD_CLASS = "text-[15px] font-bold leading-[1.45] text-[var(--aria-text)]";
const SUMMARY_CLASS = "text-[15px] leading-[1.5] text-[var(--aria-accent-line)]";
const BODY_CLASS = "text-[15px] leading-[1.55] text-[var(--aria-text-2)]";

// The reference interleaves the answer with the products: the bold lead and its
// accent summary line introduce them, everything else follows them. That's the
// first two paragraphs — a third paragraph already reads as commentary and belongs
// underneath. `withHeading` additionally keeps the heading that LABELS a figure
// ("Diferențe principale" above a comparison table) on the intro side.
//
// Returns the block index to split at, plus the total, so a caller can tell
// whether either half is empty before rendering it.
export function replySplit(text, { withHeading = false } = {}) {
  const blocks = parseBlocks(text);
  let index = 0;
  while (index < 2 && blocks[index]?.type === "p") index++;
  if (withHeading && blocks[index]?.type === "h") index++;
  return { index, total: blocks.length };
}

function Reply({ text, part, split }) {
  const all = parseBlocks(text);
  const blocks = part === "intro" ? all.slice(0, split) : part === "rest" ? all.slice(split) : all;
  if (blocks.length === 0) return null;
  let paragraphs = 0; // paragraphs seen before the first heading/list
  // Past the intro, paragraphs are ordinary body copy — the lead/summary rhythm
  // belongs to the opening of the answer only.
  let structured = part === "rest";

  return (
    <div className="aria-reply flex flex-col gap-3">
      {blocks.map((b, i) => {
        if (b.type === "h") {
          structured = true;
          return (
            <h4 key={i} className="aria-heading text-[17px] leading-snug text-[var(--aria-text)] pt-2">
              <Inline text={b.text} />
            </h4>
          );
        }
        if (b.type === "ul") {
          structured = true;
          return (
            <ul key={i} className="flex flex-col gap-2">
              {b.items.map((it, j) => (
                <li key={j} className="flex gap-2">
                  <Check className="w-4 h-4 mt-[4px] shrink-0 text-[var(--aria-success)]" strokeWidth={2.75} />
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

// A comparison sends its framing as STRUCTURED fields (`subtitle`, `closing[]`) instead of
// leaving the renderer to infer them from paragraph position in `content`. These two wrappers
// exist so that structured copy lands in exactly the same type scale as the copy parsed out of
// `content` — a second set of hardcoded classes in ChatMessage would drift the moment either
// side is touched.
export function ReplySummary({ text }) {
  return (
    <p className={SUMMARY_CLASS}>
      <Inline text={text} />
    </p>
  );
}

export function ReplyBody({ paragraphs }) {
  if (!paragraphs?.length) return null;
  return (
    <div className="aria-reply flex flex-col gap-3">
      {paragraphs.map((p, i) => (
        <p key={i} className={BODY_CLASS}>
          <Inline text={p} />
        </p>
      ))}
    </div>
  );
}

export default function RichText({ text, variant = "inline", part = "all", split = 0 }) {
  return variant === "reply" ? <Reply text={text} part={part} split={split} /> : <Inline text={text} />;
}
