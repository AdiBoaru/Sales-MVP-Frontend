import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CategorySidebar from "@/components/store/CategorySidebar";

// Shape as returned by listCategories() over the real `store_categories` view.
const TREE = [
  {
    id: "1", parentId: null, name: "Machiaj", slug: "machiaj", productCount: 101,
    children: [
      { id: "2", parentId: "1", name: "Rujuri", slug: "rujuri", productCount: 6, children: [] },
      { id: "3", parentId: "1", name: "Pudre", slug: "pudre", productCount: 7, children: [] },
    ],
  },
  {
    id: "4", parentId: null, name: "Protecție solară", slug: "protectie-solara", productCount: 6,
    children: [],
  },
];
const COUNTS = { all: 300, machiaj: 101, rujuri: 6, pudre: 7, "protectie-solara": 6 };

describe("CategorySidebar", () => {
  it("shows roots, hides children until the root is selected", () => {
    render(<CategorySidebar categories={TREE} selected="all" onSelect={() => {}} counts={COUNTS} />);
    expect(screen.getByText("Machiaj")).toBeInTheDocument();
    expect(screen.getByText("Protecție solară")).toBeInTheDocument();
    expect(screen.queryByText("Rujuri")).toBeNull();
  });

  it("expands children of the selected root, and keeps them open on a child", () => {
    const { rerender } = render(
      <CategorySidebar categories={TREE} selected="machiaj" onSelect={() => {}} counts={COUNTS} />
    );
    expect(screen.getByText("Rujuri")).toBeInTheDocument();
    rerender(<CategorySidebar categories={TREE} selected="rujuri" onSelect={() => {}} counts={COUNTS} />);
    expect(screen.getByText("Rujuri")).toBeInTheDocument();
    expect(screen.getByText("Machiaj")).toBeInTheDocument();
  });

  it("emits the slug on click and renders counts", () => {
    const onSelect = vi.fn();
    render(<CategorySidebar categories={TREE} selected="machiaj" onSelect={onSelect} counts={COUNTS} />);
    fireEvent.click(screen.getByText("Rujuri"));
    expect(onSelect).toHaveBeenCalledWith("rujuri");
    expect(screen.getByText("101")).toBeInTheDocument();
    expect(screen.getByText("300")).toBeInTheDocument();
  });

  it("survives an empty category list (first paint, before the fetch lands)", () => {
    const { container } = render(<CategorySidebar onSelect={() => {}} />);
    expect(screen.getByText("Toate produsele")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("undefined");
  });
});
