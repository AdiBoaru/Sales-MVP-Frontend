// Extends `expect` with jest-dom matchers (toBeInTheDocument, toHaveTextContent, …)
// and unmounts the DOM after each test so fixtures don't leak between cases.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());
