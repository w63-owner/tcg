/**
 * Chaos: inputs invalides, erreurs Supabase simulées, exceptions.
 */
const mockGetUser = jest.fn();
const mockFrom = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
      from: mockFrom,
    })
  ),
}));

import { POST } from "@/app/api/messages/send/route";
import {
  sendMessageAction,
  markConversationReadAction,
  submitOfferFromConversationAction,
} from "@/app/messages/actions";

function buildRequest(body: Record<string, unknown> | string) {
  return new Request("http://localhost/api/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
});

describe("Chaos – POST /api/messages/send", () => {
  it("body JSON invalide → 500 ou 400", async () => {
    const req = buildRequest("not json {");
    const res = await POST(req);
    expect([400, 500]).toContain(res.status);
  });

  it("body null / vide → erreur", async () => {
    const req = buildRequest("");
    const res = await POST(req);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("body avec content trop long (string 10k) → tronqué à 2000", async () => {
    const convId = "conv-1";
    mockFrom.mockImplementation((table: string) => {
      if (table === "conversations") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: () =>
            Promise.resolve({
              data: { id: convId, buyer_id: "user-1", seller_id: "seller-1" },
            }),
          update: () => chain,
        };
        return chain;
      }
      if (table === "messages") {
        return {
          insert: (payload: { content: string }) => {
            expect(payload.content.length).toBeLessThanOrEqual(2000);
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: { id: "m1", created_at: new Date().toISOString() },
                    error: null,
                  }),
              }),
            };
          },
        };
      }
      return {};
    });
    const req = buildRequest({
      conversationId: convId,
      content: "x".repeat(10_000),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("Supabase insert messages retourne erreur → 500", async () => {
    const convChain = {
      select: () => convChain,
      eq: () => convChain,
      maybeSingle: () =>
        Promise.resolve({
          data: { id: "c1", buyer_id: "user-1", seller_id: "s1" },
        }),
      update: () => convChain,
    };
    const msgInsertResult = {
      select: () => ({
        single: () =>
          Promise.resolve({
            data: null,
            error: { message: "duplicate key value" },
          }),
      }),
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === "conversations") return convChain;
      if (table === "messages") return { insert: () => msgInsertResult };
      return {};
    });
    const req = buildRequest({ conversationId: "c1", content: "Hi" });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it("Supabase insert retourne null data sans error → 500", async () => {
    const convChain = {
      select: () => convChain,
      eq: () => convChain,
      maybeSingle: () =>
        Promise.resolve({
          data: { id: "c1", buyer_id: "user-1", seller_id: "s1" },
        }),
      update: () => convChain,
    };
    const msgInsertResult = {
      select: () => ({
        single: () => Promise.resolve({ data: null, error: null }),
      }),
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === "conversations") return convChain;
      if (table === "messages") return { insert: () => msgInsertResult };
      return {};
    });
    const req = buildRequest({ conversationId: "c1", content: "Hi" });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it("getUser throw → 500", async () => {
    mockGetUser.mockRejectedValueOnce(new Error("Auth service down"));
    const req = buildRequest({ conversationId: "c1", content: "Hi" });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Unexpected error");
  });

  it("conversations.maybeSingle throw → 500", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "conversations") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.reject(new Error("DB connection lost")),
            }),
          }),
        };
      }
      return {};
    });
    const req = buildRequest({ conversationId: "c1", content: "Hi" });
    const res = await POST(req);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Unexpected error");
  });
});

describe("Chaos – sendMessageAction", () => {
  it("FormData vide → pas d’appel insert", async () => {
    const formData = new FormData();
    await sendMessageAction(formData);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("conversation_id vide → pas d’appel insert", async () => {
    const formData = new FormData();
    formData.set("content", "Hello");
    await sendMessageAction(formData);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("content vide → pas d’appel insert", async () => {
    const formData = new FormData();
    formData.set("conversation_id", "conv-1");
    await sendMessageAction(formData);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("utilisateur non connecté → pas d’insert", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const formData = new FormData();
    formData.set("conversation_id", "conv-1");
    formData.set("content", "Hi");
    await sendMessageAction(formData);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe("Chaos – markConversationReadAction", () => {
  it("conversation_id vide → pas d’appel update", async () => {
    const formData = new FormData();
    await markConversationReadAction(formData);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("utilisateur non connecté → pas d’update", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const formData = new FormData();
    formData.set("conversation_id", "conv-1");
    await markConversationReadAction(formData);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe("Chaos – submitOfferFromConversationAction", () => {
  it("utilisateur non connecté → erreur", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const result = await submitOfferFromConversationAction(
      "conv-1",
      "listing-1",
      100
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Connecte");
  });

  it("NaN / Infinity montant → erreur", async () => {
    const result = await submitOfferFromConversationAction(
      "conv-1",
      "listing-1",
      Number.NaN
    );
    expect(result.ok).toBe(false);
  });
});
