// Client half of the demo gate. The security guarantees live in the database and
// the edge function — what's pinned here is the behaviour that would quietly ruin
// the experience if it regressed: code normalisation, and the distinction between
// "the server said no" and "the network failed".
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

const { formatCode, redeemCode } = await import("@/lib/demoAccess");

const SESSION = { access_token: "at", refresh_token: "rt" };

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.setSession.mockResolvedValue({ error: null });
  global.fetch = vi.fn();
});

afterEach(() => {
  delete global.fetch;
});

describe("formatCode", () => {
  it("uppercases and groups as the user types", () => {
    expect(formatCode("nx4k7m2p9qaf")).toBe("NX-4K7M2-P9QAF");
  });

  it("drops separators and whitespace pasted from an email", () => {
    expect(formatCode("  nx-4k7m2 p9qaf ")).toBe("NX-4K7M2-P9QAF");
  });

  it("stops at the code length so the field can't accumulate junk", () => {
    expect(formatCode("NX4K7M2P9QAFEXTRA")).toBe("NX-4K7M2-P9QAF");
  });

  it("groups partial input without inventing separators", () => {
    expect(formatCode("nx4")).toBe("NX-4");
    expect(formatCode("")).toBe("");
  });
});

describe("redeemCode", () => {
  it("installs the session the server returned", async () => {
    global.fetch.mockResolvedValue({
      json: async () => ({ ok: true, label: "Acme SRL", expiresAt: "2026-08-19T00:00:00Z", session: SESSION }),
    });

    const result = await redeemCode("NX-4K7M2-P9QAF");

    expect(result).toMatchObject({ ok: true, label: "Acme SRL" });
    expect(mockAuth.setSession).toHaveBeenCalledWith(SESSION);
  });

  it("sends the raw code — normalisation is the server's job, not a client contract", async () => {
    global.fetch.mockResolvedValue({ json: async () => ({ ok: true, session: SESSION }) });

    await redeemCode("  nx-4k7m2-p9qaf  ");

    const [, init] = global.fetch.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ code: "nx-4k7m2-p9qaf" });
    expect(init.method).toBe("POST");
  });

  it("surfaces the server's rejection message and installs nothing", async () => {
    global.fetch.mockResolvedValue({
      json: async () => ({ ok: false, reason: "expired", message: "Codul a expirat." }),
    });

    const result = await redeemCode("NX-4K7M2-P9QAF");

    expect(result.ok).toBe(false);
    expect(result.message).toBe("Codul a expirat.");
    expect(mockAuth.setSession).not.toHaveBeenCalled();
  });

  it("reports a network failure as a connection problem, never as a bad code", async () => {
    global.fetch.mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await redeemCode("NX-4K7M2-P9QAF");

    // A prospect on hotel wifi must not be told their code is wrong — they would
    // retype a perfectly good one until the per-IP throttle locks them out.
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/conexiunea/i);
    expect(result.message).not.toMatch(/invalid/i);
  });

  it("stays locked when the session itself fails to install", async () => {
    global.fetch.mockResolvedValue({ json: async () => ({ ok: true, session: SESSION }) });
    mockAuth.setSession.mockResolvedValue({ error: new Error("bad token") });

    expect((await redeemCode("NX-4K7M2-P9QAF")).ok).toBe(false);
  });
});
