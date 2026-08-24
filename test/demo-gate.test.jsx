// The gate's job in the UI: never leak the protected tree before a session exists,
// and re-lock by itself when one goes away (revoked code -> failed refresh).
import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: {
    setSession: vi.fn(),
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signOut: vi.fn(),
  },
}));

vi.mock("@/api/supabaseClient", () => ({
  supabase: { auth: mockAuth },
  isSupabaseConfigured: true,
}));

const { default: DemoGate } = await import("@/components/DemoGate");

const SESSION = { access_token: "at", refresh_token: "rt" };
const Protected = () => <div>catalogul secret</div>;

/** Hand the component the next auth state change, the way supabase-js would. */
let emitAuthChange;

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.setSession.mockResolvedValue({ error: null });
  mockAuth.onAuthStateChange.mockImplementation((cb) => {
    emitAuthChange = cb;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  global.fetch = vi.fn();
});

afterEach(() => {
  delete global.fetch;
});

const renderGate = () =>
  render(
    <DemoGate>
      <Protected />
    </DemoGate>,
  );

describe("DemoGate", () => {
  it("shows the code form and hides the children when there is no session", async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null } });

    renderGate();

    expect(await screen.findByLabelText(/cod de acces/i)).toBeInTheDocument();
    expect(screen.queryByText("catalogul secret")).not.toBeInTheDocument();
  });

  it("renders the children straight away for an existing session", async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: SESSION } });

    renderGate();

    expect(await screen.findByText("catalogul secret")).toBeInTheDocument();
    expect(screen.queryByLabelText(/cod de acces/i)).not.toBeInTheDocument();
  });

  it("never flashes the children while the session is still being checked", () => {
    mockAuth.getSession.mockReturnValue(new Promise(() => {})); // never settles

    renderGate();

    expect(screen.queryByText("catalogul secret")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/cod de acces/i)).not.toBeInTheDocument();
  });

  it("opens the store once a valid code is redeemed", async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null } });
    global.fetch.mockResolvedValue({ json: async () => ({ ok: true, session: SESSION }) });

    renderGate();
    const input = await screen.findByLabelText(/cod de acces/i);
    await userEvent.type(input, "nx4k7m2p9qaf");
    await userEvent.click(screen.getByRole("button", { name: /intră în magazin/i }));

    expect(await screen.findByText("catalogul secret")).toBeInTheDocument();
  });

  it("shows the server's error and stays locked on a bad code", async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null } });
    global.fetch.mockResolvedValue({
      json: async () => ({ ok: false, reason: "invalid", message: "Cod invalid. Verifică-l și încearcă din nou." }),
    });

    renderGate();
    const input = await screen.findByLabelText(/cod de acces/i);
    await userEvent.type(input, "nx0000000000");
    await userEvent.click(screen.getByRole("button", { name: /intră în magazin/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/cod invalid/i);
    expect(screen.queryByText("catalogul secret")).not.toBeInTheDocument();
  });

  it("keeps the submit button disabled until the code is long enough to be real", async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null } });

    renderGate();
    const input = await screen.findByLabelText(/cod de acces/i);
    const button = screen.getByRole("button", { name: /intră în magazin/i });

    expect(button).toBeDisabled();
    await userEvent.type(input, "nx4k7m2p9qaf");
    expect(button).toBeEnabled();
  });

  it("re-locks when the session ends — the revoked-code path", async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: SESSION } });

    renderGate();
    expect(await screen.findByText("catalogul secret")).toBeInTheDocument();

    // supabase-js emits SIGNED_OUT when a refresh is rejected, which is exactly
    // what a revoked code looks like from the browser.
    act(() => emitAuthChange("SIGNED_OUT", null));

    await waitFor(() => expect(screen.queryByText("catalogul secret")).not.toBeInTheDocument());
    expect(screen.getByLabelText(/cod de acces/i)).toBeInTheDocument();
  });
});
