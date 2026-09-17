// Transportul ASINCRON pe contractul v1: acceptul durabil + așteptarea terminalului.
//
// Ce ancorează testele, în ordinea în care contează:
//
//  1. Widgetul randează ACELAȘI lucru. Transportul schimbă CÂND vine răspunsul, nu CE conține —
//     dacă asta se rupe, mutarea nu mai e o îmbunătățire de latență, e o schimbare de produs.
//  2. Comutarea are UN owner: serverul. Anunț absent ⇒ sincron; anunț dispărut între bootstrap
//     și accept (rollback) ⇒ cădem pe sincron fără ca mesajul clientului să se piardă.
//  3. GET-ul e autoritatea. SSE e optimizare, deci absența lui nu blochează nimic.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/supabaseClient", () => ({ supabase: null }));

const TOKEN = "pub_test";
const TURN_ID = "8f14e45f-ceea-467a-9c2f-5d4a0d4a2b11";

const V1_TERMINAL = Object.freeze({
  schema_version: "web-chat.v1",
  conversation: { id: "conv-1", revision: 2 },
  turn: { id: TURN_ID, client_turn_id: "c-1", status: "completed" },
  content: "Uite trei creme potrivite.",
  products: [
    { product_id: "p1", name: "Cremă A", price: 89, url: "https://sole.ro/p/1" },
  ],
  suggestions: ["Arată-mi variante sub 100 lei"],
  offer: { kind: "checkout", label: "Finalizează comanda", url: "https://sole.ro/cart" },
});

function bootstrapBody(extra) {
  return { token: TOKEN, visitor_id: "web_1", sig: "sig", ...extra };
}

const ASYNC_ADVERT = {
  view_contract: "web-chat.v1",
  sse: false, // SSE stins: rămâne pollingul, adică drumul pe care GET-ul e autoritatea
  poll_after_ms: 1,
  progress: { accepted: "Am primit mesajul", working: "Pregătesc răspunsul" },
};

function json(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/** Rutează după calea cerută; înregistrează fiecare apel ca să putem afirma CE s-a chemat. */
function routerFetch(routes) {
  const calls = [];
  const impl = async (url, init) => {
    const path = String(url).split("?")[0];
    calls.push({ path, method: init?.method || "GET" });
    const handler = routes[path];
    if (!handler) throw new Error(`rută nemockată: ${path}`);
    return handler(calls.filter((c) => c.path === path).length, init);
  };
  impl.calls = calls;
  return impl;
}

let chatClient;

async function freshClient() {
  vi.resetModules();
  localStorage.clear();
  chatClient = await import("@/api/chatClient.js");
  return chatClient;
}

beforeEach(() => {
  vi.stubEnv("VITE_CHAT_PUBLIC_TOKEN", TOKEN);
  vi.stubEnv("VITE_CHAT_API_BASE", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("anunțul de capabilitate decide transportul", () => {
  it("fără anunț, rămâne calea sincronă — byte pentru byte comportamentul de azi", async () => {
    const fetchMock = routerFetch({
      "/web/bootstrap": () => json(bootstrapBody()),
      "/web/chat": () => json({ content: "salut", products: [], suggestions: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { sendChatMessage } = await freshClient();

    const reply = await sendChatMessage("bună");

    expect(reply.content).toBe("salut");
    expect(fetchMock.calls.map((c) => c.path)).toEqual(["/web/bootstrap", "/web/chat"]);
  });

  it("cu anunț, acceptă asincron și livrează ACELAȘI conținut ca pe sincron", async () => {
    const fetchMock = routerFetch({
      "/web/bootstrap": () => json(bootstrapBody({ async_turns: ASYNC_ADVERT })),
      "/web/v2/turns": () =>
        json(
          {
            schema_version: "web-turn-status.v2",
            turn: { id: TURN_ID, client_turn_id: "c-1", status: "accepted" },
            status_url: `/web/v2/turns/${TURN_ID}`,
            poll_after_ms: 1,
          },
          202,
        ),
      [`/web/v2/turns/${TURN_ID}`]: (n) =>
        n === 1
          ? json(
              {
                schema_version: "web-turn-status.v2",
                turn: { id: TURN_ID, client_turn_id: "c-1", status: "working" },
                status_url: `/web/v2/turns/${TURN_ID}`,
                poll_after_ms: 1,
              },
              202,
            )
          : json(V1_TERMINAL),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { sendChatMessage } = await freshClient();

    const phases = [];
    const reply = await sendChatMessage("caut o cremă", { onStatus: (p) => phases.push(p) });

    // Conținutul: exact ce ar fi randat pe sincron, prin ACELAȘI `normalizeReply`.
    expect(reply.content).toBe(V1_TERMINAL.content);
    expect(reply.suggestions).toEqual(["Arată-mi variante sub 100 lei"]);
    expect(reply.offer?.label).toBe("Finalizează comanda");
    expect(reply.products).toHaveLength(1);
    // Fazele sunt cele ANUNȚATE de server, în ordine — nu inventate din timp de browser.
    expect(phases).toEqual(["accepted", "working"]);
    // Zero apeluri pe calea sincronă: nu am rulat turul de două ori.
    expect(fetchMock.calls.some((c) => c.path === "/web/chat")).toBe(false);
  });

  it("acceptul care întoarce direct terminal (replay) nu mai așteaptă nimic", async () => {
    const fetchMock = routerFetch({
      "/web/bootstrap": () => json(bootstrapBody({ async_turns: ASYNC_ADVERT })),
      "/web/v2/turns": () => json(V1_TERMINAL),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { sendChatMessage } = await freshClient();

    const reply = await sendChatMessage("din nou");

    expect(reply.content).toBe(V1_TERMINAL.content);
    expect(fetchMock.calls.filter((c) => c.path.startsWith("/web/v2/turns"))).toHaveLength(1);
  });

  it("rută stinsă între bootstrap și accept: mesajul NU se pierde, pleacă pe sincron", async () => {
    const fetchMock = routerFetch({
      "/web/bootstrap": () => json(bootstrapBody({ async_turns: ASYNC_ADVERT })),
      "/web/v2/turns": () => json({ detail: "not found" }, 404),
      "/web/chat": () => json({ content: "livrat sincron", products: [], suggestions: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { sendChatMessage } = await freshClient();

    const reply = await sendChatMessage("ceva");

    expect(reply.content).toBe("livrat sincron");
  });

  it("un anunț malformat e tratat ca absent, nu „reparat”", async () => {
    const fetchMock = routerFetch({
      "/web/bootstrap": () => json(bootstrapBody({ async_turns: { view_contract: "web-view.v2" } })),
      "/web/chat": () => json({ content: "sincron", products: [], suggestions: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { sendChatMessage } = await freshClient();

    await sendChatMessage("x");

    expect(fetchMock.calls.some((c) => c.path === "/web/chat")).toBe(true);
  });
});

describe("client_turn_id", () => {
  it("e un UUID real — cheia de idempotency a serverului e o coloană `uuid`", async () => {
    const seen = [];
    const fetchMock = routerFetch({
      "/web/bootstrap": () => json(bootstrapBody()),
      "/web/chat": (_n, init) => {
        seen.push(JSON.parse(init.body).client_msg_id);
        return json({ content: "ok", products: [], suggestions: [] });
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    // Fără `crypto.randomUUID` (Safari vechi / context non-secure): fallbackul trebuie să rămână
    // un UUID valid, altfel retry-ul ar rula turul a doua oară în tăcere.
    const realCrypto = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: realCrypto.getRandomValues.bind(realCrypto) });
    const { sendChatMessage } = await freshClient();

    await sendChatMessage("x");

    expect(seen[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
