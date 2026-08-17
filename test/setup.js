// Extends `expect` with jest-dom matchers (toBeInTheDocument, toHaveTextContent, …)
// and unmounts the DOM after each test so fixtures don't leak between cases.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { installMatchMedia, resetMatchMedia } from "./helpers/matchMedia.js";

// NX-245 — jsdom nu are `matchMedia`, iar widgetul îl folosește ca să decidă modalitatea
// dialogului (modal pe mobil / non-modal pe desktop). Stubul evaluează interogarea față de
// `window.innerWidth`, deci testele pot conduce viewportul cu `setViewport()`.
installMatchMedia();

beforeEach(() => resetMatchMedia());

afterEach(() => {
  cleanup();
  // Panelul se randează într-un portal pe `<body>`. Dacă un test lasă în urmă `inert`/`aria-hidden`
  // pe frați sau `overflow:hidden` pe body, următorul test ar porni dintr-un DOM contaminat — și
  // exact aici ar trece neobservată o scurgere de izolare modală.
  document.body.style.overflow = "";
  for (const node of Array.from(document.body.children)) {
    node.removeAttribute("inert");
    node.removeAttribute("aria-hidden");
  }
});
