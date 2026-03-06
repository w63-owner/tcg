/**
 * QA: tests fonctionnels du service de messagerie (API send + validation).
 * Vérifie les cas nominaux et les validations métier.
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

// Import après les mocks pour que POST utilise le client mocké
import { POST } from "@/app/api/messages/send/route";

function buildRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockConversation(conversationId: string, userId: string) {
  return {
    id: conversationId,
    buyer_id: userId,
    seller_id: "seller-1",
  };
}

function mockMessage(id: string) {
  return { id, created_at: new Date().toISOString() };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-buyer-1" } },
    error: null,
  });
});

describe("Messages QA – POST /api/messages/send", () => {
  it("retourne 400 si conversationId manquant", async () => {
    const req = buildRequest({ content: "Hello" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("conversationId and content are required");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("retourne 400 si content manquant", async () => {
    const req = buildRequest({ conversationId: "conv-1" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("conversationId and content are required");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("retourne 400 si content vide après trim", async () => {
    const req = buildRequest({ conversationId: "conv-1", content: "   " });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("trunque le content à 2000 caractères", async () => {
    const convId = "conv-1";
    const longContent = "a".repeat(3000);
    const conversation = mockConversation(convId, "user-buyer-1");

    mockFrom.mockImplementation((table: string) => {
      if (table === "conversations") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: () => Promise.resolve({ data: conversation }),
          update: () => chain,
        };
        return chain;
      }
      if (table === "messages") {
        return {
          insert: (payload: { content: string }) => {
            expect(payload.content).toHaveLength(2000);
            expect(payload.content).toBe("a".repeat(2000));
            return {
              select: () => ({ single: () => Promise.resolve({ data: mockMessage("msg-1"), error: null }) }),
            };
          },
        };
      }
      return {};
    });

    const req = buildRequest({ conversationId: convId, content: longContent });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.messageId).toBe("msg-1");
  });

  it("retourne 401 si utilisateur non authentifié", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const req = buildRequest({ conversationId: "conv-1", content: "Hi" });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("retourne 403 si l'utilisateur n'est pas dans la conversation", async () => {
    const convId = "conv-1";
    const otherConversation = {
      id: convId,
      buyer_id: "other-buyer",
      seller_id: "seller-1",
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === "conversations") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: otherConversation }),
            }),
          }),
        };
      }
      return {};
    });

    const req = buildRequest({ conversationId: convId, content: "Hi" });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("Forbidden");
  });

  it("retourne 403 si conversation introuvable", async () => {
    const convChain = {
      select: () => convChain,
      eq: () => convChain,
      maybeSingle: () => Promise.resolve({ data: null }),
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === "conversations") return convChain;
      return {};
    });

    const req = buildRequest({ conversationId: "conv-unknown", content: "Hi" });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Forbidden");
  });

  it("retourne 200 et messageId quand tout est valide (buyer)", async () => {
    const convId = "conv-1";
    const conversation = mockConversation(convId, "user-buyer-1");

    mockFrom.mockImplementation((table: string) => {
      if (table === "conversations") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: () => Promise.resolve({ data: conversation }),
          update: () => chain,
        };
        return chain;
      }
      if (table === "messages") {
        return {
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: mockMessage("msg-123"),
                  error: null,
                }),
            }),
          }),
        };
      }
      return {};
    });

    const req = buildRequest({ conversationId: convId, content: "Hello seller" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.messageId).toBe("msg-123");
    expect(data.createdAt).toBeDefined();
  });

  it("accepte un seller dans la conversation", async () => {
    const convId = "conv-1";
    const conversation = {
      id: convId,
      buyer_id: "buyer-1",
      seller_id: "user-buyer-1",
    };
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "user-buyer-1" } },
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "conversations") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: () => Promise.resolve({ data: conversation }),
          update: () => chain,
        };
        return chain;
      }
      if (table === "messages") {
        return {
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: mockMessage("msg-456"),
                  error: null,
                }),
            }),
          }),
        };
      }
      return {};
    });

    const req = buildRequest({ conversationId: convId, content: "Reply from seller" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.messageId).toBe("msg-456");
  });
});

describe("Messages QA – submitOfferFromConversationAction (validation)", () => {
  // Validation uniquement (pas d’appel Supabase)
  it("submitOfferFromConversationAction: montant invalide retourne erreur", async () => {
    const { submitOfferFromConversationAction } = await import("@/app/messages/actions");
    const result = await submitOfferFromConversationAction("conv-1", "listing-1", 0);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Montant");
  });

  it("submitOfferFromConversationAction: montant négatif retourne erreur", async () => {
    const { submitOfferFromConversationAction } = await import("@/app/messages/actions");
    const result = await submitOfferFromConversationAction("conv-1", "listing-1", -10);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("invalide");
  });

  it("submitOfferFromConversationAction: conversationId vide retourne erreur", async () => {
    const { submitOfferFromConversationAction } = await import("@/app/messages/actions");
    const result = await submitOfferFromConversationAction("", "listing-1", 50);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("invalide");
  });

  it("submitOfferFromConversationAction: listingId vide retourne erreur", async () => {
    const { submitOfferFromConversationAction } = await import("@/app/messages/actions");
    const result = await submitOfferFromConversationAction("conv-1", "", 50);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("invalide");
  });
});
