import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ChatMessage, { EMPTY_REPLY_FALLBACK } from "@/components/store/ChatMessage";
import { normalizeReply } from "@/api/chatClient";
import cases from "./fixtures/contract-cases.json";

// Render a bot reply EXACTLY as the app would: raw backend payload -> the real
// normalizeReply() -> <ChatMessage>. So the suite proves contract conformance, not
// a hand-rolled copy of the mapping. Router context is needed for offer <Link>s.
function renderReply(payload, props = {}) {
  const message = { role: "assistant", ...normalizeReply(payload) };
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ChatMessage message={message} isFirst={false} {...props} />
    </MemoryRouter>
  );
}

const byCase = (name) => cases.find((c) => c.case === name);

describe("contract conformance — every payload shape renders faithfully", () => {
  it.each(cases.map((c) => [c.case, c]))("%s", (_name, tc) => {
    const { container } = renderReply(tc.payload);
    const a = tc.assert || {};

    // Universal invariant: no raw placeholder ever leaks into the UI.
    for (const bad of ["undefined", "null", "NaN", "[object Object]"]) {
      expect(container).not.toHaveTextContent(bad);
    }

    (a.textPresent || []).forEach((t) => expect(container).toHaveTextContent(t));
    (a.textAbsent || []).forEach((t) => expect(container).not.toHaveTextContent(t));

    // Product cards counted by their "Adaugă în coș" button (one per card).
    if (a.productCards != null) {
      expect(within(container).queryAllByTitle("Adaugă în coș")).toHaveLength(a.productCards);
    }
    if (a.comparisonTable === true) expect(within(container).queryByRole("table")).toBeInTheDocument();
    if (a.comparisonTable === false) expect(within(container).queryByRole("table")).not.toBeInTheDocument();
    if (a.columnHeaders != null) {
      expect(within(container).getAllByRole("columnheader")).toHaveLength(a.columnHeaders);
    }
    if (a.dash === true) expect(container).toHaveTextContent("—");
    if (a.discountBadge === true) expect(container.innerHTML).toMatch(/-\d+%/);
    if (a.lineBreak === true) expect(container.innerHTML).toMatch(/<br/);
    if (a.moreDetails === true) expect(container).toHaveTextContent("Spune-mi mai multe");
    if (a.emptyFallback === true) expect(container).toHaveTextContent(EMPTY_REPLY_FALLBACK);
    if (a.noBubble === true) expect(container.querySelector(".rounded-2xl")).toBeNull();
    if (a.linkHrefs) {
      const hrefs = within(container)
        .queryAllByRole("link")
        .map((el) => el.getAttribute("href"));
      a.linkHrefs.forEach((h) => expect(hrefs).toContain(h));
    }
  });
});

describe("contract conformance — interactions & invariants", () => {
  it("empty reply shows a graceful fallback, never a blank bubble", () => {
    const { container } = renderReply(byCase("text_empty").payload);
    expect(screen.getByText(EMPTY_REPLY_FALLBACK)).toBeInTheDocument();
    expect(container.querySelector(".rounded-2xl")).toBeNull();
  });

  it("a follow-up chip fires onSuggestion with its label", () => {
    const onSuggestion = vi.fn();
    renderReply(byCase("rich_full").payload, { onSuggestion });
    fireEvent.click(screen.getByText("Una mai ieftină"));
    expect(onSuggestion).toHaveBeenCalledWith("Una mai ieftină");
  });

  it("a quick_reply offer sends its payload (does not open a url)", () => {
    const onQuickReply = vi.fn();
    renderReply(byCase("offer_quick_reply").payload, { onQuickReply });
    fireEvent.click(screen.getByText("Da, comand"));
    expect(onQuickReply).toHaveBeenCalledWith("Da, vreau să comand");
  });

  it("an open_url offer is a new-tab link to the url", () => {
    renderReply(byCase("offer_open_url").payload);
    const link = screen.getByText("Vezi produsul").closest("a");
    expect(link).toHaveAttribute("href", "https://x/p1");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it('"Spune-mi mai multe" reveals the product details on demand', () => {
    renderReply(byCase("emag_rich_full").payload);
    expect(screen.queryByText(/acid salicilic \+ zinc/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Spune-mi mai multe"));
    expect(screen.getByText(/acid salicilic \+ zinc/)).toBeInTheDocument();
  });

  it("adding a product from a card fires the toast callback", () => {
    const onToast = vi.fn();
    renderReply(byCase("simple_products").payload, { onToast });
    fireEvent.click(screen.getByTitle("Adaugă în coș"));
    expect(onToast).toHaveBeenCalled();
  });
});
